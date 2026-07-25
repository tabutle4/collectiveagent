import { supabaseAdmin } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * Two-way billing sync, missing half.
 *
 * The Payload webhook already syncs one direction: invoice paid in Payload ->
 * agent_debts marked paid. This is the other direction: a debt that
 * originated as a Payload invoice gets settled INTERNALLY (withheld from a
 * payout), so the Payload copy must be closed or the agent can be charged
 * twice. Called after every payout debt application.
 *
 * Settles via a negative "Commission Offset" line item, the same pattern the
 * admin stage_debt action uses, NOT a void: the money was collected through
 * the commission, so the invoice should read as paid by offset, not
 * cancelled.
 *
 * Fire-and-forget by design: a Payload hiccup must never fail a payout.
 * Failures log, and the Billing page's manual controls remain the fallback.
 * Only fires when the debt is fully paid, only for debts whose notes carry
 * the Payload invoice ID stamped at creation, and never twice (the
 * auto-settled marker guards reruns, and a zero balance in Payload is a
 * no-op).
 */
export async function settlePayloadInvoiceForDebt(debtId: string): Promise<void> {
  try {
    const { data: debt } = await supabaseAdmin
      .from('agent_debts')
      .select('id, status, notes')
      .eq('id', debtId)
      .maybeSingle()
    if (!debt || debt.status !== 'paid') return
    const notes = String(debt.notes || '')
    if (notes.includes('auto-settled in Payload')) return
    // Same stamp regex as the admin stage_debt path: matches
    // "Payload invoice ID: xxx", "Payload invoice: xxx", and
    // "payload_invoice_id:xxx".
    const m = notes.match(/payload[ _]invoice(?:[ _]id)?:\s*([A-Za-z0-9_-]+)/i)
    if (!m) return
    const invoiceId = m[1].trim()

    const invRes = await fetch(
      `https://api.payload.com/invoices/${invoiceId}?fields[]=amount_due`,
      { headers: { Authorization: authHeader() } }
    )
    if (!invRes.ok) {
      console.error('settlePayloadInvoiceForDebt: invoice lookup failed for debt', debtId)
      return
    }
    const inv = await invRes.json()
    const balanceDue = Number(inv.amount_due ?? 0)
    if (balanceDue > 0) {
      const lineRes = await fetch('https://api.payload.com/line_items/', {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          invoice_id: invoiceId,
          type: 'Payment (Commission Offset)',
          description: 'Commission Offset',
          amount: String(-balanceDue),
          entry_type: 'charge',
        }),
      })
      if (!lineRes.ok) {
        const e = await lineRes.text().catch(() => '')
        console.error('settlePayloadInvoiceForDebt: Payload settlement failed for debt', debtId, e)
        return
      }
    }
    await supabaseAdmin
      .from('agent_debts')
      .update({ notes: `${notes} | auto-settled in Payload after internal settlement` })
      .eq('id', debtId)
  } catch (err) {
    console.error('settlePayloadInvoiceForDebt failed for', debtId, err)
  }
}
