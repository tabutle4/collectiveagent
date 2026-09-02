import { supabaseAdmin } from '@/lib/supabase'
import {
  applyCommissionOffset,
  extractPayloadInvoiceId,
  recordInvoiceSettlement,
} from '@/lib/payload/commissionOffset'

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
      .select('id, status, notes, agent_id')
      .eq('id', debtId)
      .maybeSingle()
    if (!debt || debt.status !== 'paid') return
    const notes = String(debt.notes || '')
    if (notes.includes('auto-settled in Payload')) return
    // Same stamp formats as the admin stage_debt path: matches
    // "Payload invoice ID: xxx", "Payload invoice: xxx", and
    // "payload_invoice_id:xxx".
    const invoiceId = extractPayloadInvoiceId(notes)
    if (!invoiceId) return

    const applied = await applyCommissionOffset(invoiceId)
    if (!applied.ok) {
      console.error('settlePayloadInvoiceForDebt: Payload settlement failed for debt', debtId, applied.error)
      return
    }
    if (applied.amountOffset > 0) {
      await recordInvoiceSettlement({
        invoiceId,
        agentId: debt.agent_id,
        method: 'offset',
        source: 'payout_auto_settle',
        amount: applied.amountOffset,
        note: 'Withheld from commission payout',
      })
    }
    await supabaseAdmin
      .from('agent_debts')
      .update({ notes: `${notes} | auto-settled in Payload after internal settlement` })
      .eq('id', debtId)
  } catch (err) {
    console.error('settlePayloadInvoiceForDebt failed for', debtId, err)
  }
}
