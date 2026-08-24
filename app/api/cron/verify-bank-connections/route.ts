import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

export const dynamic = 'force-dynamic'
// This route makes one sequential Payload call per linked customer per
// active agent (90 in scope as of 23 August 2026: status = 'active' AND
// is_active = true) plus an email sweep only for agents with no bank on a
// linked customer. Vercel's default function timeout would cut that off
// mid-loop, leaving a partly reconciled table and no report email. 300s is
// the ceiling on Pro.
export const maxDuration = 300

const resend = new Resend(process.env.RESEND_API_KEY)
const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// GET /api/cron/verify-bank-connections
//
// The daily reconciliation between the app's bank-connection state and
// Payload's. It writes, but only within a hard boundary:
//
//   WRITES pointers ONLY for customers already on the user record
//   (payload_payout_customer_id, then payload_payee_id). A bank found by
//   sweeping Payload for the agent's email address is REPORTED, never
//   written. The payout ownership guard compares
//   payload_payout_customer_id against the payment method's customer; if
//   this cron were allowed to write both sides of that comparison from an
//   email match, the guard would be agreeing with itself about a customer
//   no human ever approved. A human links it from the agent's profile.
//
//   payload_payee_id is NEVER written. It is the BILLING pointer: invoices
//   send to it and the payment webhook matches on it.
//
// Scope is is_active = true, not status = 'active' - ten departed agents
// still carry status 'active' (23 August 2026), and hunting a departed
// agent's bank account by email address is not something an unattended job
// should do.
//
// Selection is deterministic: Payload's own default_credit_method first,
// then oldest created_at, then id. An unordered methods[0] pick meant an
// agent with two active accounts could have their payout target flip
// between days.
//
// Payload documents three payment-method statuses - active, inactive,
// declining - and only `inactive` means unusable. `declining` is a live
// connection with processing trouble, so it counts as connected here and
// the payout guard lets it through. Filtering to active-only silently
// disconnected declining-only agents.
//
// Tri-state on purpose: ok=false means the LOOKUP failed (Payload error),
// which must never be read as "no bank exists" - clearing flags on a flaky
// response would disconnect every agent during a Payload outage.
async function findUsableBank(
  customerId: string
): Promise<{ ok: boolean; pm: any | null }> {
  try {
    // No status filter in the query: `declining` must come back too.
    const res = await fetch(
      `https://api.payload.com/payment_methods?customer_id=${customerId}&type=bank_account&limit=10`,
      { headers: { Authorization: plAuth() } }
    )
    if (!res.ok) return { ok: false, pm: null }
    const data = await res.json().catch(() => null)
    if (!data) return { ok: false, pm: null }
    const methods = (data?.values || []).filter((pm: any) => {
      const status = String(pm?.status || '').toLowerCase()
      return String(pm?.type || '') === 'bank_account' && status !== 'inactive'
    })
    methods.sort((a: any, b: any) => {
      if (!!a.default_credit_method !== !!b.default_credit_method) {
        return a.default_credit_method ? -1 : 1
      }
      const ac = String(a.created_at || ''), bc = String(b.created_at || '')
      if (ac !== bc) return ac.localeCompare(bc)
      return String(a.id || '').localeCompare(String(b.id || ''))
    })
    return { ok: true, pm: methods[0] || null }
  } catch {
    return { ok: false, pm: null }
  }
}

async function findCustomersByEmail(email: string): Promise<string[]> {
  if (!email) return []
  try {
    const res = await fetch(
      `https://api.payload.com/customers?email=${encodeURIComponent(email)}&limit=10`,
      { headers: { Authorization: plAuth() } }
    )
    if (!res.ok) return []
    const data = await res.json().catch(() => null)
    return (data?.values || []).map((c: any) => String(c?.id || '')).filter(Boolean)
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: agents } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, personal_email, is_active, bank_connected, payload_payment_method_id, payload_payout_customer_id, payload_payee_id'
      )
      .eq('status', 'active')
      // is_active is the real departure flag; ten departed agents still
      // carry status 'active' (23 August 2026). An unattended job must not go
      // hunting a departed agent's bank account.
      .eq('is_active', true)

    const fixed: { name: string; email: string; change: string }[] = []
    const cleared: { name: string; email: string }[] = []
    const cantFix: { name: string; email: string; note: string }[] = []
    let unchanged = 0
    let payloadErrors = 0

    for (const agent of agents || []) {
      const name = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
      const email = agent.office_email || agent.email || ''

      // Linked customers ONLY - these are pointers a human already set.
      const candidates: { customerId: string; via: string }[] = []
      if (agent.payload_payout_customer_id) {
        candidates.push({ customerId: agent.payload_payout_customer_id, via: 'payout customer' })
      }
      if (agent.payload_payee_id && agent.payload_payee_id !== agent.payload_payout_customer_id) {
        candidates.push({ customerId: agent.payload_payee_id, via: 'billing customer' })
      }
      let found: { pm: any; customerId: string; via: string } | null = null
      let anyLookupFailed = false
      for (const c of candidates) {
        const result = await findUsableBank(c.customerId)
        if (!result.ok) anyLookupFailed = true
        if (result.pm) { found = { pm: result.pm, customerId: c.customerId, via: c.via }; break }
      }

      // Email sweep runs ONLY when the linked customers turned up nothing,
      // and it never writes. Repointing the payout customer at a customer
      // discovered by email would make the payout ownership guard agree
      // with a link no human approved, so this reports and stops.
      let emailSuggestion: { customerId: string; via: string } | null = null
      if (!found && !anyLookupFailed) {
        const emails = Array.from(
          new Set([agent.office_email, agent.email, agent.personal_email].filter(Boolean))
        ) as string[]
        for (const em of emails) {
          const customerIds = await findCustomersByEmail(em)
          for (const cid of customerIds) {
            if (candidates.some(c => c.customerId === cid)) continue
            const result = await findUsableBank(cid)
            if (!result.ok) { anyLookupFailed = true; continue }
            if (result.pm) { emailSuggestion = { customerId: cid, via: `email match (${em})` }; break }
          }
          if (emailSuggestion) break
        }
      }

      // A failed Payload lookup is counted for every agent, whatever their
      // current connection state. It used to be counted only inside the
      // `agent.bank_connected` branch below, so a lookup failure for an agent
      // with no connection fell through to unchanged++ and never appeared in
      // the report - the run read cleaner than it was. payload_errors now
      // means "agents with at least one failed Payload lookup this run" and
      // deliberately overlaps the other counters: the same agent can be
      // counted here and in fixed, cant_fix, or unchanged.
      if (anyLookupFailed) payloadErrors++

      if (found) {
        // Repoint within customers already linked to this agent.
        // payload_payee_id is untouched - billing changes are human-only.
        const changes: string[] = []
        const update: Record<string, any> = {}
        if (agent.payload_payout_customer_id !== found.customerId) {
          update.payload_payout_customer_id = found.customerId
          changes.push(`payout customer -> ${found.via}`)
        }
        if (agent.payload_payment_method_id !== found.pm.id) {
          update.payload_payment_method_id = found.pm.id
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
      } else if (emailSuggestion) {
        // A bank exists on an unlinked customer. Human decision.
        cantFix.push({
          name,
          email,
          note: `bank found on an unlinked Payload customer (${emailSuggestion.via}, ${emailSuggestion.customerId}) - link it from their profile if it is theirs`,
        })
      } else if (agent.bank_connected) {
        if (anyLookupFailed) {
          // Never clear flags on a flaky Payload response. Already counted in
          // payloadErrors above.
          continue
        }
        // The app claimed a connection and no active bank exists anywhere we
        // are allowed to look. Clear the payout flags and put the agent on
        // the human list - they need a fresh Bank Connect.
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
        cantFix.push({ name, email, note: 'no active bank on any matching Payload customer - resend Bank Connect' })
      } else {
        unchanged++
      }
    }

    // Morning email: a changelog plus the can't-fix list. Skipped entirely
    // when the run was a no-op - todays verified state is the baseline and
    // the first runs are expected to fix nothing.
    if (fixed.length > 0 || cleared.length > 0 || cantFix.length > 0) {
      const row = (cells: string[]) =>
        `<tr>${cells.map(c => `<td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${c}</td>`).join('')}</tr>`
      const fixedRows = fixed.map(f => row([f.name, f.email, f.change])).join('')
      const cantFixRows = cantFix.map(c => row([c.name, c.email, c.note])).join('')
      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: 'office@collectiverealtyco.com',
          subject: `Bank connection sync: fixed ${fixed.length}, cleared ${cleared.length}`,
          html: getEmailLayout(
            `<p>The daily Payload verification ran. Fixed ${fixed.length}, cleared ${cleared.length}.</p>
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
             <p>To restore payouts by direct deposit, open each agent's profile and use <strong>Send Bank Activation</strong>.</p>` : ''}`,
            {
              title: 'Bank Connection Sync',
              subtitle: 'Daily Payload Verification',
              preheader: `Fixed ${fixed.length}, cleared ${cleared.length}, ${cantFix.length} need a human.`,
            }
          ),
        })
      } catch (emailErr) {
        console.error('verify-bank-connections: alert email failed', emailErr)
      }
    }

    return NextResponse.json({
      checked: (agents || []).length,
      fixed: fixed.length,
      cleared: cleared.length,
      cant_fix: cantFix.length,
      unchanged,
      payload_errors: payloadErrors,
      fixed_agents: fixed,
      cleared_agents: cleared,
      cant_fix_agents: cantFix,
    })
  } catch (error: any) {
    console.error('verify-bank-connections error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
