import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'

const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Cap Payload API calls per run so a backlog cannot blow the function budget.
// Anything left over is picked up on the next daily run.
const MAX_PER_RUN = 50

// A payment has hit the bank when its ledger carries a deposit entry
// (docs.payload.com/apis/unified-ledger). The entry's timestamp is the date
// the deposit was issued to the bank. Rejected payments carry rejected_date
// or status 'rejected'.
async function fetchPaymentFunding(txnId: string): Promise<{
  settledDate: string | null
  rejected: boolean
} | null> {
  const res = await fetch(
    `https://api.payload.com/transactions/${txnId}?fields[]=*&fields[]=ledger`,
    { headers: { Authorization: plAuth() } }
  )
  if (!res.ok) {
    console.error('funding-sync: transaction fetch failed', txnId, res.status)
    return null
  }
  const txn = await res.json()

  if (txn.status === 'rejected' || txn.rejected_date) {
    return { settledDate: null, rejected: true }
  }

  const ledger = Array.isArray(txn.ledger) ? txn.ledger : []
  const depositEntry = ledger.find((e: any) => e?.entry_type === 'deposit')
  if (depositEntry) {
    const stamp = depositEntry.processed_date || depositEntry.timestamp || null
    const date = stamp ? String(stamp).split('T')[0].split(' ')[0] : new Date().toISOString().split('T')[0]
    return { settledDate: date, rejected: false }
  }
  return { settledDate: null, rejected: false }
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    let apiCalls = 0
    const results = { checks_cleared: 0, checks_rejected: 0, rent_cleared: 0, skipped: 0 }

    // ── Part 1: pay-link checks awaiting settlement ──────────────────────────
    const { data: openChecks } = await supabase
      .from('checks_received')
      .select('id, payload_transaction_id, notes, status')
      .not('payload_transaction_id', 'is', null)
      .is('cleared_date', null)
      .neq('status', 'rejected')
      .limit(MAX_PER_RUN)

    for (const check of openChecks || []) {
      if (apiCalls >= MAX_PER_RUN) { results.skipped++; continue }
      apiCalls++
      const funding = await fetchPaymentFunding(check.payload_transaction_id)
      if (!funding) continue

      if (funding.rejected) {
        const today = new Date().toISOString().split('T')[0]
        await supabase
          .from('checks_received')
          .update({
            status: 'rejected',
            notes: `${check.notes ? check.notes + ' ' : ''}PAYLOAD REJECTED (payment returned) ${today}`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', check.id)
        results.checks_rejected++
        console.log('funding-sync: check rejected', check.id)
      } else if (funding.settledDate) {
        await supabase
          .from('checks_received')
          .update({ cleared_date: funding.settledDate, updated_at: new Date().toISOString() })
          .eq('id', check.id)
        results.checks_cleared++
        console.log('funding-sync: check cleared', check.id, funding.settledDate)
      }
    }

    // ── Part 2: PM rent awaiting settlement ─────────────────────────────────
    // Walk tenant invoice -> Payload invoice payment line item -> payment
    // transaction -> deposit ledger entry, then stamp funds_cleared_at.
    const { data: openRent } = await supabase
      .from('tenant_invoices')
      .select('id, payload_invoice_id')
      .eq('payment_method', 'payload')
      .eq('status', 'paid')
      .is('funds_cleared_at', null)
      .not('payload_invoice_id', 'is', null)
      .limit(MAX_PER_RUN)

    for (const inv of openRent || []) {
      if (apiCalls >= MAX_PER_RUN) { results.skipped++; continue }
      apiCalls++
      const invRes = await fetch(
        `https://api.payload.com/invoices/${inv.payload_invoice_id}?fields[]=*&fields[]=items`,
        { headers: { Authorization: plAuth() } }
      )
      if (!invRes.ok) {
        console.error('funding-sync: invoice fetch failed', inv.payload_invoice_id, invRes.status)
        continue
      }
      const plInvoice = await invRes.json()
      const items = Array.isArray(plInvoice.items) ? plInvoice.items : []
      const paymentItem = items.find((i: any) => i?.entry_type === 'payment' && i?.transaction_id)
      if (!paymentItem) continue

      if (apiCalls >= MAX_PER_RUN) { results.skipped++; continue }
      apiCalls++
      const funding = await fetchPaymentFunding(paymentItem.transaction_id)
      if (funding?.settledDate) {
        await supabase
          .from('tenant_invoices')
          .update({ funds_cleared_at: funding.settledDate, updated_at: new Date().toISOString() })
          .eq('id', inv.id)
        results.rent_cleared++
        console.log('funding-sync: rent cleared', inv.id, funding.settledDate)
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (error: any) {
    console.error('funding-sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
