import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { payoutStatus } from '@/lib/payload/processPayout'
import { markAgentPaid } from '@/lib/transactions/markPaid'
import { MATH_TOLERANCE } from '@/lib/transactions/funding'
import { requireCronSecret } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'
// One sequential Payload call per row in scope. Pass A is the payouts still in
// flight; Pass B is everything paid in the last 30 days, re-checked for a
// reversal. On live data that is roughly 40 to 60 calls a run, but a backlog
// after a Payload outage could be larger, so the run is capped (MAX_PER_RUN)
// and 300s is the Vercel Pro ceiling.
export const maxDuration = 300

const resend = new Resend(process.env.RESEND_API_KEY)

// Hard cap on Payload calls per run so a backlog cannot blow the function
// budget. Anything left over is picked up on the next daily run. Mirrors the
// cap in app/api/cron/payload/funding-sync/route.ts.
const MAX_PER_RUN = 250

// Days back that Pass B keeps re-checking a payout already marked paid.
// The five live examples of a rejection arriving AFTER funding_status went
// `batched` all landed within days, not weeks; 30 days is generous cover.
const REVERSAL_WATCH_DAYS = 30

// Payload's documented funding_status values
// (docs.payload.com/apis/object-reference/transactions).
// `batched` is the only one that means the money left CRC's operating
// account. Anything outside this set is unknown to us and must never mark
// money paid - it gets reported instead.
const KNOWN_FUNDING_STATUSES = new Set(['pending', 'captured', 'batched', 'refunded', 'reversed'])

// Documented Transaction status values that mean the payout did not or no
// longer stands. Checked BEFORE funding_status, because a rejection arrives
// after funding_status has already read `batched`.
const FAILED_STATUSES = new Set(['rejected', 'declined', 'voided'])

// funding_status values that mean money came back after settling.
const REVERSED_FUNDING = new Set(['refunded', 'reversed'])

interface TiaRow {
  id: string
  transaction_id: string | null
  agent_id: string | null
  payment_reference: string | null
  payment_method: string | null
  funding_source: string | null
  payment_date: string | null
  payment_status: string | null
  agent_net: number | string | null
}

interface MarkedRow {
  agent: string
  deal: string
  amount: string
  settled: string
  note: string
}

interface InFlightRow {
  agent: string
  deal: string
  amount: string
  expected: string
}

interface AttentionRow {
  agent: string
  deal: string
  amount: string
  why: string
}

const TIA_FIELDS =
  'id, transaction_id, agent_id, payment_reference, payment_method, funding_source, payment_date, payment_status, agent_net'

const fmtMoney = (v: any) => {
  const n = parseFloat(v ?? 0) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Payload returns a date, sometimes with a time component. payment_date is a
// DATE column, so take the calendar day. Same normalisation the funding-sync
// cron already applies to Payload timestamps.
const asDate = (v: any): string | null => {
  if (!v) return null
  const s = String(v).split('T')[0].split(' ')[0].trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

const esc = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// GET /api/cron/reconcile-payouts
//
// Replaces the morning bank check on the PAYOUT side. Payload already knows
// which agent payouts have funded; this reads that and marks the rows paid
// through the same markAgentPaid() the Mark Paid button calls.
//
// Two passes:
//   Pass A - rows with a payment_reference and no payment_date. `batched`
//            marks paid, dated by Payload's own processed_date. `pending`
//            is left alone and reported as in flight. Everything else,
//            including any funding_status we do not recognise, is reported
//            and NOT marked paid.
//   Pass B - rows already marked paid within the last 30 days. A payout can
//            flip to rejected days after it read `batched` (five live cases
//            in the incoming audit), so this keeps watching. It never
//            unmarks: money records must not reverse themselves silently.
//            It reports and a human decides.
//
// The only write this route makes is through markAgentPaid(). No money math
// is duplicated here.
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    let apiCalls = 0
    let capped = 0

    const marked: MarkedRow[] = []
    const inFlight: InFlightRow[] = []
    const attention: AttentionRow[] = []
    const returned: AttentionRow[] = []

    // transaction_internal_agents holds 1,503 rows and grows with every deal,
    // so both selects page through fetchAllRows. A truncated page here would
    // silently skip real payouts.
    const unpaid = await fetchAllRows<TiaRow>('transaction_internal_agents', TIA_FIELDS, {
      filters: [
        { type: 'not', column: 'payment_reference', value: null },
        { type: 'is', column: 'payment_date', value: null },
      ],
    })

    const watchFrom = new Date(Date.now() - REVERSAL_WATCH_DAYS * 86400000)
      .toISOString()
      .split('T')[0]
    const recentlyPaid = await fetchAllRows<TiaRow>('transaction_internal_agents', TIA_FIELDS, {
      filters: [
        { type: 'eq', column: 'payment_status', value: 'paid' },
        { type: 'not', column: 'payment_reference', value: null },
        { type: 'not', column: 'payment_date', value: null },
        { type: 'gte', column: 'payment_date', value: watchFrom },
      ],
    })

    // One lookup of the names and addresses both passes need, rather than a
    // query per row.
    const agentIds = Array.from(
      new Set([...unpaid, ...recentlyPaid].map(r => r.agent_id).filter(Boolean))
    ) as string[]
    const txnIds = Array.from(
      new Set([...unpaid, ...recentlyPaid].map(r => r.transaction_id).filter(Boolean))
    ) as string[]

    const nameById = new Map<string, string>()
    if (agentIds.length > 0) {
      const { data: agentRows } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', agentIds)
      for (const u of agentRows || []) {
        const name = `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
        nameById.set(u.id, name || 'Unknown agent')
      }
    }

    const addressById = new Map<string, string>()
    if (txnIds.length > 0) {
      const { data: txnRows } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address')
        .in('id', txnIds)
      for (const t of txnRows || []) {
        addressById.set(t.id, t.property_address || 'this deal')
      }
    }

    const label = (row: TiaRow) => ({
      agent: nameById.get(row.agent_id || '') || 'Unknown agent',
      deal: addressById.get(row.transaction_id || '') || 'unknown deal',
      amount: fmtMoney(row.agent_net),
    })

    // ── Pass A: payouts sent, not yet recorded as paid ──────────────────────
    for (const row of unpaid) {
      const l = label(row)
      if (apiCalls >= MAX_PER_RUN) {
        capped++
        continue
      }
      apiCalls++
      // payment_reference is a free-text "Reference / Check #" box in the Mark
      // Paid modal, not a Payload id. A check number or Zelle reference in it
      // would 404 here and be reported as a missing Payload transaction every
      // morning for 30 days. Payload transaction ids are txn_-prefixed
      // (docs.payload.com/apis/object-reference/transactions/), so anything
      // else is not ours to reconcile.
      if (!String(row.payment_reference || '').startsWith('txn_')) continue
      const lookup = await payoutStatus(row.payment_reference as string)

      if (!lookup.ok) {
        attention.push({ ...l, why: `Payload lookup failed: ${lookup.error || 'unknown error'}` })
        continue
      }
      if (lookup.notFound) {
        attention.push({
          ...l,
          why: `Payload has no transaction ${row.payment_reference}. The reference on this row may be wrong.`,
        })
        continue
      }

      const status = String(lookup.status || '').toLowerCase()
      const funding = String(lookup.fundingStatus || '').toLowerCase()

      // Status is checked FIRST. A rejection arrives after funding_status has
      // already gone `batched`, so testing funding_status first would mark a
      // returned payout paid.
      if (FAILED_STATUSES.has(status)) {
        attention.push({
          ...l,
          why: `Payload status is ${status}${lookup.statusMessage ? ` - ${lookup.statusMessage}` : ''}. Not marked paid.`,
        })
        continue
      }

      if (!KNOWN_FUNDING_STATUSES.has(funding)) {
        // Fail safe. A funding_status outside the documented set is a value we
        // have never seen and must never silently mark money paid.
        attention.push({
          ...l,
          why: `Unrecognised funding status ${lookup.fundingStatus === null || lookup.fundingStatus === undefined ? '(none returned)' : `"${lookup.fundingStatus}"`}. Not marked paid - check this payout in Payload.`,
        })
        continue
      }

      if (funding === 'pending') {
        inFlight.push({
          ...l,
          expected: asDate(lookup.processedDate) || 'date not given by Payload',
        })
        continue
      }

      if (funding !== 'batched') {
        // captured, refunded, reversed. Documented, but none of them means the
        // batch left CRC's operating account, which is Tara's rule for paid.
        attention.push({
          ...l,
          why: `Funding status is ${funding}, not batched, so the money has not left the operating account. Not marked paid.`,
        })
        continue
      }

      const settled = asDate(lookup.processedDate)
      if (!settled) {
        attention.push({
          ...l,
          why: 'Funding status is batched but Payload returned no processed date, so there is no settlement date to record. Not marked paid.',
        })
        continue
      }

      try {
        const markResult = await markAgentPaid({
          transactionId: row.transaction_id as string,
          internalAgentId: row.id,
          paymentDate: settled,
          // Preserve what Process Payout wrote rather than overwriting it.
          // markAgentPaid coerces a falsy value to null. The fallback is
          // lowercase to match the one vocabulary; it used to read 'ACH' and
          // so re-seeded the drift on every row Process Payout had missed.
          paymentMethod: row.payment_method || 'ach',
          paymentReference: row.payment_reference,
          // Preserve the row's existing funding source. markAgentPaid
          // defaults a falsy value to 'crc'.
          fundingSource: row.funding_source,
          // Empty by design. Staged debts and credits still fold in inside
          // markAgentPaid, which is correct: debts are staged BEFORE Process
          // Payout and the amount sent already netted them off.
          debtsToApply: [],
          creditsToApply: [],
        })

        if (markResult.alreadyPaid) {
          // Raced with a human pressing Mark Paid. Nothing was written.
          continue
        }

        // The amount Payload settled and the net recorded on the row must
        // agree - payoutNetForRow and markAgentPaid run the same formula, so
        // a difference means something changed after the send. The payment is
        // a fact either way, so the row stays marked paid and the
        // disagreement is reported rather than hidden.
        const recordedNet = parseFloat(String(markResult.updates?.agent_net ?? 0)) || 0
        const settledAmount =
          lookup.amount === null || lookup.amount === undefined
            ? null
            : parseFloat(String(lookup.amount)) || 0
        const drift =
          settledAmount !== null && Math.abs(settledAmount - recordedNet) > MATH_TOLERANCE

        marked.push({
          ...l,
          amount: fmtMoney(recordedNet),
          settled,
          note: drift
            ? `Payload settled ${fmtMoney(settledAmount)} but the net recorded on this row is ${fmtMoney(recordedNet)}. Check this one.`
            : '',
        })
        if (drift) {
          attention.push({
            ...l,
            amount: fmtMoney(recordedNet),
            why: `Marked paid, but Payload settled ${fmtMoney(settledAmount)} against a recorded net of ${fmtMoney(recordedNet)}. The two should match.`,
          })
        }
        console.log('reconcile-payouts: marked paid', row.id, settled)
      } catch (e: any) {
        attention.push({
          ...l,
          why: `Funding status is batched but marking paid failed: ${e?.message || 'unknown error'}`,
        })
        console.error('reconcile-payouts: markAgentPaid failed', row.id, e)
      }
    }

    // ── Pass B: already paid, watching for a reversal ───────────────────────
    for (const row of recentlyPaid) {
      const l = label(row)
      if (apiCalls >= MAX_PER_RUN) {
        capped++
        continue
      }
      apiCalls++
      // payment_reference is a free-text "Reference / Check #" box in the Mark
      // Paid modal, not a Payload id. A check number or Zelle reference in it
      // would 404 here and be reported as a missing Payload transaction every
      // morning for 30 days. Payload transaction ids are txn_-prefixed
      // (docs.payload.com/apis/object-reference/transactions/), so anything
      // else is not ours to reconcile.
      if (!String(row.payment_reference || '').startsWith('txn_')) continue
      const lookup = await payoutStatus(row.payment_reference as string)

      if (!lookup.ok) {
        attention.push({
          ...l,
          why: `Already paid ${row.payment_date}, but the re-check failed: ${lookup.error || 'unknown error'}`,
        })
        continue
      }
      if (lookup.notFound) {
        attention.push({
          ...l,
          why: `Marked paid ${row.payment_date}, but Payload no longer has transaction ${row.payment_reference}.`,
        })
        continue
      }

      const status = String(lookup.status || '').toLowerCase()
      const funding = String(lookup.fundingStatus || '').toLowerCase()

      if (status === 'rejected' || REVERSED_FUNDING.has(funding)) {
        // Deliberately NOT unmarked. A money record does not reverse itself.
        returned.push({
          ...l,
          why: `Paid ${row.payment_date} and the money came back. Payload now reads status ${status || 'unknown'}, funding ${funding || 'unknown'}${lookup.statusMessage ? ` - ${lookup.statusMessage}` : ''}. The row is still marked paid; decide what to do.`,
        })
        console.log('reconcile-payouts: returned after paid', row.id, status, funding)
      }
    }

    // ── Morning email ───────────────────────────────────────────────────────
    // Skipped entirely on a quiet run. A daily no-op email trains people to
    // ignore it.
    const hasSomething =
      marked.length > 0 || inFlight.length > 0 || attention.length > 0 || returned.length > 0

    if (hasSomething) {
      const th = (t: string) =>
        `<th style="text-align: left; padding: 6px 12px;">${t}</th>`
      const row = (cells: string[]) =>
        `<tr>${cells
          .map(c => `<td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${c}</td>`)
          .join('')}</tr>`
      const table = (headers: string[], rows: string) =>
        `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
           <tr>${headers.map(th).join('')}</tr>
           ${rows}
         </table>`

      const sections: string[] = []

      if (returned.length > 0) {
        sections.push(
          `<p style="margin-top:14px;"><strong>Returned after being paid - needs a decision</strong></p>
           <p>These agents were marked paid and the money has come back. Nothing has been unmarked.</p>
           ${table(
             ['Agent', 'Deal', 'Amount', 'What happened'],
             returned
               .map(r => row([esc(r.agent), esc(r.deal), esc(r.amount), esc(r.why)]))
               .join('')
           )}`
        )
      }

      if (marked.length > 0) {
        sections.push(
          `<p style="margin-top:14px;"><strong>Marked paid this run</strong></p>
           ${table(
             ['Agent', 'Deal', 'Amount', 'Settled'],
             marked
               .map(m =>
                 row([
                   esc(m.agent),
                   esc(m.deal),
                   esc(m.amount),
                   esc(m.settled) + (m.note ? ` <span style="color:#B45309;">${esc(m.note)}</span>` : ''),
                 ])
               )
               .join('')
           )}`
        )
      }

      if (inFlight.length > 0) {
        sections.push(
          `<p style="margin-top:14px;"><strong>Still in flight</strong></p>
           ${table(
             ['Agent', 'Deal', 'Amount', 'Expected to clear'],
             inFlight
               .map(f => row([esc(f.agent), esc(f.deal), esc(f.amount), esc(f.expected)]))
               .join('')
           )}`
        )
      }

      if (attention.length > 0) {
        sections.push(
          `<p style="margin-top:14px;"><strong>Needs attention</strong></p>
           ${table(
             ['Agent', 'Deal', 'Amount', 'Why'],
             attention
               .map(a => row([esc(a.agent), esc(a.deal), esc(a.amount), esc(a.why)]))
               .join('')
           )}`
        )
      }

      if (capped > 0) {
        sections.push(
          `<p style="margin-top:14px;">${capped} row${capped === 1 ? '' : 's'} were not checked this run because the per-run Payload call cap of ${MAX_PER_RUN} was reached. They are picked up on the next run.</p>`
        )
      }

      const subjectBits = [
        `${marked.length} marked paid`,
        `${inFlight.length} in flight`,
      ]
      if (returned.length > 0) subjectBits.unshift(`${returned.length} returned`)
      if (attention.length > 0) subjectBits.push(`${attention.length} need attention`)

      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: 'office@collectiverealtyco.com',
          subject: `Payout reconciliation: ${subjectBits.join(', ')}`,
          html: getEmailLayout(
            `<p>Payload was checked for every payout in flight and every payout marked paid in the last ${REVERSAL_WATCH_DAYS} days. A payout is marked paid only when Payload reports the batch funded, dated by Payload's own settlement date.</p>
             ${sections.join('')}`,
            {
              title: 'Payout Reconciliation',
              subtitle: 'Daily Payload Settlement Check',
              preheader: subjectBits.join(', '),
            }
          ),
        })
      } catch (emailErr) {
        console.error('reconcile-payouts: report email failed', emailErr)
      }
    }

    return NextResponse.json({
      success: true,
      pass_a_checked: unpaid.length,
      pass_b_checked: recentlyPaid.length,
      payload_calls: apiCalls,
      capped,
      marked_paid: marked.length,
      in_flight: inFlight.length,
      needs_attention: attention.length,
      returned_after_paid: returned.length,
      email_sent: hasSomething,
      marked,
      in_flight_rows: inFlight,
      attention_rows: attention,
      returned_rows: returned,
    })
  } catch (error: any) {
    console.error('reconcile-payouts error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
