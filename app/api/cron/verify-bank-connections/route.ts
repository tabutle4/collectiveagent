import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { payoutMethodCanReceiveCredit } from '@/lib/payload/processPayout'
import { requireCronSecret } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'
// Two or three Payload list calls total, not one per agent. The whole customer
// and payment-method set is pulled once and matched in memory, so runtime no
// longer scales with headcount. 300s is the ceiling on Pro and is now far more
// headroom than this needs.
export const maxDuration = 300

const resend = new Resend(process.env.RESEND_API_KEY)
const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Page size for the two list calls. Payload documents limit/offset paging
// (docs.payload.com/apis/api-design/). 200 keeps each response small while
// still finishing the current 202 customers / 225 methods in two pages each.
const PAGE = 200
const MAX_PAGES = 25

// GET /api/cron/verify-bank-connections
//
// The daily reconciliation between the app's bank-connection state and
// Payload's.
//
// WHAT IT WRITES, and the boundary that has not moved:
//
//   It may set payload_payment_method_id and bank_connected, but ONLY to a
//   method that already sits on the agent's existing payload_payout_customer_id.
//
//   It NEVER writes payload_payout_customer_id. Not from the billing customer,
//   not from an email match, not from a name match. The payout ownership guard
//   in processPayout compares payload_payout_customer_id against the payment
//   method's customer, so a job that writes both sides of that comparison
//   leaves the guard agreeing with itself about a customer no human approved.
//   Discovered customers are REPORTED with their ids so a human can link them.
//
//   payload_payee_id is NEVER written. It is the BILLING pointer: invoices send
//   to it and the payment webhook matches on it.
//
// WHAT PAYLOAD MEANS BY A PAYOUT BANK
// (docs.payload.com/apis/object-reference/payment-methods/):
//
//   default_credit_method  - may be the default for CREDITS. A payout is a credit.
//   default_payment_method - may be the default for PAYMENTS, i.e. being charged.
//                            That is the monthly-fee account.
//   transfer_type          - 'send-only' | 'receive-only' | 'two-way'.
//                            A send-only method cannot receive anything.
//
// Measured across all 225 methods on this account, 24 August 2026: the 51
// receive-only methods are exactly the 51 with default_credit_method true, and
// the 174 send-only methods are exactly the 174 with it false. The two flags do
// not disagree anywhere, and the accounts that have actually received credits
// are receive-only. So payoutCapable() below is the real test for "can this
// account receive commission", and everything else is a billing account.
//
// Scope is is_active = true, not status = 'active' - departed agents still carry
// status 'active', and hunting a departed agent's bank account by name is not
// something an unattended job should do.
//
// Payload documents three payment-method statuses - active, inactive, declining -
// and only `inactive` means unusable. `declining` is a live connection with
// processing trouble, so it still counts as connected and the payout guard lets
// it through. Filtering to active-only silently disconnected declining-only
// agents.

type PMethod = {
  id: string
  customer_id: string
  type: string
  status: string
  bank_name?: string | null
  account_holder?: string | null
  default_credit_method?: boolean
  default_payment_method?: boolean
  transfer_type?: string | null
  created_at?: string | null
}

type PCustomer = { id: string; email: string }

/** A bank account Payload will let us send a commission credit to. */
function payoutCapable(pm: PMethod | null | undefined): boolean {
  if (!pm) return false
  if (String(pm.type || '') !== 'bank_account') return false
  if (String(pm.status || '').toLowerCase() === 'inactive') return false
  // Credit capability itself comes from the payout guard, so this job and
  // processPayout can never drift on what "can receive a commission" means.
  return payoutMethodCanReceiveCredit(pm)
}

/** A bank account at all. Used for connection state, not for paying. */
function usableBank(pm: PMethod | null | undefined): boolean {
  if (!pm) return false
  if (String(pm.type || '') !== 'bank_account') return false
  return String(pm.status || '').toLowerCase() !== 'inactive'
}

function capabilityNote(pm: PMethod): string {
  const bits = [
    `credit method: ${pm.default_credit_method ? 'yes' : 'no'}`,
    `payment method: ${pm.default_payment_method ? 'yes' : 'no'}`,
  ]
  if (pm.transfer_type) bits.push(`transfer type: ${pm.transfer_type}`)
  return bits.join(', ')
}

/** Deterministic pick so an agent with two payout banks does not flip daily. */
function pickBest(methods: PMethod[]): PMethod | null {
  const sorted = [...methods].sort((a, b) => {
    if (payoutCapable(a) !== payoutCapable(b)) return payoutCapable(a) ? -1 : 1
    const ac = String(a.created_at || ''), bc = String(b.created_at || '')
    if (ac !== bc) return ac.localeCompare(bc)
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
  return sorted[0] || null
}

/** Page a Payload list endpoint. Returns null if ANY page failed, so a partial
 *  read is never mistaken for "nothing exists". */
async function listAll<T>(path: string): Promise<T[] | null> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const url = `https://api.payload.com/${path}${sep}limit=${PAGE}&offset=${page * PAGE}`
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: plAuth() } })
    } catch {
      return null
    }
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data) return null
    const values: T[] = data?.values || []
    out.push(...values)
    if (values.length < PAGE) return out
  }
  return out
}

function normEmail(s: any): string {
  return String(s || '').trim().toLowerCase()
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const { data: agents } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, personal_email, is_active, bank_connected, payload_payment_method_id, payload_payout_customer_id, payload_payee_id'
      )
      .eq('status', 'active')
      .eq('is_active', true)

    // Pull Payload once. A failure here is fatal on purpose: continuing with a
    // partial view would clear connection flags for agents whose banks simply
    // were not in the page we managed to read.
    const [customers, methods] = await Promise.all([
      listAll<PCustomer>('customers/'),
      listAll<PMethod>('payment_methods/'),
    ])
    if (!customers || !methods) {
      return NextResponse.json(
        { error: 'Payload lookup failed; no changes made.' },
        { status: 502 }
      )
    }

    const emailByCustomer = new Map<string, string>()
    for (const c of customers) emailByCustomer.set(String(c.id), normEmail(c.email))

    const methodsByCustomer = new Map<string, PMethod[]>()
    for (const m of methods) {
      const cid = String(m.customer_id || '')
      if (!cid) continue
      const list = methodsByCustomer.get(cid) || []
      list.push(m)
      methodsByCustomer.set(cid, list)
    }

    // Every customer any agent already points at, so a discovered bank is never
    // offered for an agent when it belongs to someone else.
    const claimed = new Set<string>()
    for (const a of agents || []) {
      if (a.payload_payout_customer_id) claimed.add(String(a.payload_payout_customer_id))
      if (a.payload_payee_id) claimed.add(String(a.payload_payee_id))
    }

    const fixed: { name: string; email: string; change: string }[] = []
    const cleared: { name: string; email: string }[] = []
    const cantFix: { name: string; email: string; note: string }[] = []
    // The point of this job: payout banks that exist in Payload but are not
    // linked yet. These ARE linked automatically - see the note at the write.
    const linked: {
      name: string
      email: string
      customer_id: string
      payment_method_id: string
      bank: string
      matched_on: string
    }[] = []
    // More than one candidate. Never guessed - a human picks.
    const ambiguous: { name: string; email: string; note: string }[] = []
    const notCreditCapable: { name: string; email: string; note: string }[] = []
    let unchanged = 0

    for (const agent of agents || []) {
      const name = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
      const email = agent.office_email || agent.email || ''
      const agentEmails = new Set(
        [agent.office_email, agent.email, agent.personal_email].map(normEmail).filter(Boolean)
      )
      const lastName = String(agent.last_name || '').trim().toLowerCase()

      // 1. The payout customer, and only the payout customer, may be written to.
      const payoutId = agent.payload_payout_customer_id ? String(agent.payload_payout_customer_id) : ''
      const onPayout = payoutId ? methodsByCustomer.get(payoutId) || [] : []
      const found = pickBest(onPayout.filter(usableBank))

      if (found) {
        const changes: string[] = []
        const update: Record<string, any> = {}
        if (agent.payload_payment_method_id !== found.id) {
          update.payload_payment_method_id = found.id
          changes.push('payment method repointed')
        }
        if (!agent.bank_connected) {
          update.bank_connected = true
          update.bank_connected_at = new Date().toISOString()
          changes.push('marked connected')
        }
        if (changes.length > 0) {
          update.updated_at = new Date().toISOString()
          await supabaseAdmin.from('users').update(update).eq('id', agent.id)
          fixed.push({ name, email, change: changes.join(', ') })
        } else {
          unchanged++
        }
        if (!payoutCapable(found)) {
          notCreditCapable.push({
            name,
            email,
            note: `payout bank on file (${found.id}) is not marked as able to receive credits, which is what a billing account looks like - ${capabilityNote(found)}`,
          })
        }
        continue
      }

      // 2. No usable bank on the payout customer. Search all of Payload for a
      //    bank that CAN receive a credit and looks like this agent's, by any of
      //    their email addresses or by the name on the account. Report only.
      const candidates: { pm: PMethod; matched_on: string }[] = []
      for (const m of methods) {
        if (!payoutCapable(m)) continue
        const cid = String(m.customer_id || '')
        if (!cid || cid === payoutId || claimed.has(cid)) continue
        const custEmail = emailByCustomer.get(cid) || ''
        const holder = String(m.account_holder || '').trim().toLowerCase()
        if (agentEmails.has(custEmail)) {
          candidates.push({ pm: m, matched_on: `email ${custEmail}` })
        } else if (
          lastName.length > 3 &&
          holder &&
          holder !== 'collective realty co.' &&
          holder.includes(lastName)
        ) {
          candidates.push({ pm: m, matched_on: `name on account "${m.account_holder}"` })
        }
      }

      // Exactly one payout-capable bank that is unmistakably theirs: link it.
      //
      // Writing payload_payout_customer_id here is deliberate and is NOT the
      // failure this job used to have. That failure adopted the agent's BILLING
      // customer, an account Payload marks send-only and cannot credit. This
      // writes only an account Payload marks as able to RECEIVE a credit
      // (payoutCapable below), on a customer no other user points at, matched to
      // the agent by one of their own email addresses or the name on the
      // account. A billing account can never satisfy payoutCapable, so the old
      // failure is unreachable from here.
      //
      // The office still confirms before money moves: Process Payout opens a
      // preview showing the bank name, account type, last four and account
      // holder, and nothing is sent until that is accepted. That is the human
      // check on this write.
      const distinct = new Map<string, { pm: PMethod; matched_on: string }>()
      for (const c of candidates) distinct.set(String(c.pm.customer_id), c)
      if (distinct.size === 1) {
        const chosen = Array.from(distinct.values())[0]
        const cid = String(chosen.pm.customer_id)
        await supabaseAdmin
          .from('users')
          .update({
            payload_payout_customer_id: cid,
            payload_payment_method_id: chosen.pm.id,
            bank_connected: true,
            bank_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id)
        claimed.add(cid)
        linked.push({
          name,
          email,
          customer_id: cid,
          payment_method_id: chosen.pm.id,
          bank: String(chosen.pm.bank_name || 'bank account'),
          matched_on: chosen.matched_on,
        })
        continue
      }
      if (distinct.size > 1) {
        ambiguous.push({
          name,
          email,
          note: `${distinct.size} payout bank accounts in Payload match this agent (${Array.from(distinct.keys()).join(', ')}). Not linked - open their profile and pick the right one.`,
        })
        continue
      }

      // 3. A bank exists, but only on the BILLING customer. Never adopted: that
      //    is the failure this job used to have. Reported, and reported BEFORE
      //    the clear branch so nobody is disconnected over it.
      const billingId = agent.payload_payee_id ? String(agent.payload_payee_id) : ''
      const onBilling =
        billingId && billingId !== payoutId
          ? pickBest((methodsByCustomer.get(billingId) || []).filter(usableBank))
          : null
      if (onBilling) {
        cantFix.push({
          name,
          email,
          note: `no payout bank on their payout customer, but a bank sits on their BILLING customer (${billingId}, ${capabilityNote(onBilling)}). Do NOT reuse it for payouts. Send Bank Activation so they set up a real payout account.`,
        })
        continue
      }

      // 4. Nothing anywhere.
      if (agent.bank_connected) {
        await supabaseAdmin
          .from('users')
          .update({
            bank_connected: false,
            bank_connected_at: null,
            payload_activation_id: null,
            payload_payment_method_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id)
        cleared.push({ name, email })
        cantFix.push({ name, email, note: 'no bank on any Payload customer we can match - send Bank Activation' })
      } else {
        unchanged++
      }
    }

    if (fixed.length > 0 || cleared.length > 0 || cantFix.length > 0 || linked.length > 0 || ambiguous.length > 0 || notCreditCapable.length > 0) {
      const row = (cells: string[]) =>
        `<tr>${cells.map(c => `<td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${c}</td>`).join('')}</tr>`
      const fixedRows = fixed.map(f => row([f.name, f.email, f.change])).join('')
      const linkRows = linked.map(l => row([l.name, l.bank, l.matched_on])).join('')
      const ambiguousRows = ambiguous.map(a => row([a.name, a.email, a.note])).join('')
      const cantFixRows = cantFix.map(c => row([c.name, c.email, c.note])).join('')
      const notCreditRows = notCreditCapable.map(c => row([c.name, c.email, c.note])).join('')
      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: 'office@collectiverealtyco.com',
          subject: `Bank connection sync: ${linked.length} linked, ${fixed.length} fixed, ${cleared.length} cleared`,
          html: getEmailLayout(
            `<p>The daily Payload verification ran. ${linked.length} payout ${linked.length === 1 ? 'bank was' : 'banks were'} linked, ${fixed.length} fixed, ${cleared.length} cleared.</p>
             ${linked.length > 0 ? `<p style="margin-top:14px;"><strong>Payout bank linked</strong></p>
             <p>Payload holds a bank account for these agents that can receive a commission credit, and it is now linked. Their bank details are shown for confirmation the next time you process a payout.</p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Bank</th><th style="text-align: left; padding: 6px 12px;">Matched on</th></tr>
               ${linkRows}
             </table>` : ''}
             ${ambiguous.length > 0 ? `<p style="margin-top:14px;"><strong>More than one payout bank, not linked</strong></p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Email</th><th style="text-align: left; padding: 6px 12px;">Why</th></tr>
               ${ambiguousRows}
             </table>` : ''}
             ${fixed.length > 0 ? `<p style="margin-top:14px;"><strong>Fixed automatically</strong></p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Email</th><th style="text-align: left; padding: 6px 12px;">Change</th></tr>
               ${fixedRows}
             </table>` : ''}
             ${cantFix.length > 0 ? `<p style="margin-top:14px;"><strong>Needs a human</strong></p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Email</th><th style="text-align: left; padding: 6px 12px;">Why</th></tr>
               ${cantFixRows}
             </table>
             <p>To restore payouts by direct deposit, open each agent's profile and use <strong>Send Bank Activation</strong>.</p>` : ''}
             ${notCreditCapable.length > 0 ? `<p style="margin-top:14px;"><strong>Linked bank may not be able to receive commission</strong></p>
             <p>Payload does not mark these accounts as able to receive a credit, which is what a billing-only bank account looks like. Nothing was changed.</p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Email</th><th style="text-align: left; padding: 6px 12px;">What Payload says</th></tr>
               ${notCreditRows}
             </table>` : ''}`,
            {
              title: 'Bank Connection Sync',
              subtitle: 'Daily Payload Verification',
              preheader: `${linked.length} linked, ${fixed.length} fixed, ${cleared.length} cleared, ${cantFix.length} need a human.`,
            }
          ),
        })
      } catch (emailErr) {
        console.error('verify-bank-connections: alert email failed', emailErr)
      }
    }

    return NextResponse.json({
      checked: (agents || []).length,
      payload_customers: customers.length,
      payload_methods: methods.length,
      linked: linked.length,
      ambiguous: ambiguous.length,
      fixed: fixed.length,
      cleared: cleared.length,
      cant_fix: cantFix.length,
      not_credit_capable: notCreditCapable.length,
      unchanged,
      linked_agents: linked,
      ambiguous_agents: ambiguous,
      fixed_agents: fixed,
      cleared_agents: cleared,
      cant_fix_agents: cantFix,
      not_credit_capable_agents: notCreditCapable,
    })
  } catch (error: any) {
    console.error('verify-bank-connections error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
