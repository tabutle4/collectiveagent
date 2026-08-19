import { supabaseAdmin } from '@/lib/supabase'
import { recomputeOfficeNet } from '@/lib/transactions/cascade'
import { ECOMMISSION_DEBT_TYPE } from '@/lib/transactions/ecommission'

/**
 * Server-only. Pushes a corrected eCommission advance amount onto the two
 * records that carry the money: the agent's repayment debt and eCommission's
 * payout row on the deal.
 *
 * Anything already disbursed is left alone and reported back as 'locked'
 * instead of being rewritten:
 *   - a debt that has been staged is status='paid' with amount_paid frozen at
 *     the staged figure. Rewriting amount_owed underneath that would put the
 *     debt and the payout further out of step, not less. It has to be
 *     unstaged, corrected, and restaged.
 *   - a payout row already marked paid is money out the door.
 * The approval screens surface a reported-vs-applied disagreement, so a locked
 * record gets caught before a CDA is signed rather than going out silently.
 */

export type EcommissionRecordOutcome = 'updated' | 'locked' | 'unchanged' | 'none'

export type EcommissionSyncResult = {
  amount: number
  debt: EcommissionRecordOutcome
  payout_row: EcommissionRecordOutcome
}

const n = (v: any): number => parseFloat(String(v ?? 0)) || 0
const round2 = (v: number): number => Math.round(v * 100) / 100

export async function syncEcommissionRecords(
  transactionId: string,
  amount: any
): Promise<EcommissionSyncResult> {
  const target = round2(n(amount))
  const now = new Date().toISOString()
  const result: EcommissionSyncResult = { amount: target, debt: 'none', payout_row: 'none' }

  // The repayment debt. An unstaged debt has no link back to the deal, so the
  // auto tag written at creation is the only join available for it; a staged
  // one is found by offset_transaction_id.
  const tag = `auto:compliance-ecommission:${transactionId}`
  const [{ data: taggedDebts }, { data: linkedDebts }] = await Promise.all([
    supabaseAdmin
      .from('agent_debts')
      .select('id, status, amount_owed, amount_paid')
      .eq('debt_type', ECOMMISSION_DEBT_TYPE)
      .ilike('notes', `%${tag}%`),
    supabaseAdmin
      .from('agent_debts')
      .select('id, status, amount_owed, amount_paid')
      .eq('debt_type', ECOMMISSION_DEBT_TYPE)
      .eq('offset_transaction_id', transactionId),
  ])
  const debtsById = new Map<string, any>()
  for (const d of [...(taggedDebts || []), ...(linkedDebts || [])]) debtsById.set(d.id, d)
  const debts = Array.from(debtsById.values())

  for (const debt of debts) {
    if (round2(n(debt.amount_owed)) === target) {
      if (result.debt === 'none') result.debt = 'unchanged'
      continue
    }
    if (debt.status !== 'outstanding' || n(debt.amount_paid) !== 0) {
      result.debt = 'locked'
      continue
    }
    // Do NOT write amount_remaining. It is GENERATED ALWAYS AS (amount_owed -
    // amount_paid) STORED in the live database, confirmed against
    // information_schema.columns. Postgres rejects an explicit write to a
    // generated column, which would make every correction fail. Updating
    // amount_owed is enough; the balance follows on its own.
    await supabaseAdmin
      .from('agent_debts')
      .update({ amount_owed: target, updated_at: now })
      .eq('id', debt.id)
    if (result.debt !== 'locked') result.debt = 'updated'
  }

  // eCommission's payout row on the deal. This is what the CDA pays them.
  // Matched on the name prefix because brokerage_role_other is not always set.
  // A brokerage legitimately named "eCommission <something>" would collide;
  // there are none today.
  const { data: payoutRow } = await supabaseAdmin
    .from('transaction_external_brokerages')
    .select('id, amount_1099_reportable, payment_status')
    .eq('transaction_id', transactionId)
    .eq('brokerage_role', 'other')
    .ilike('brokerage_name', 'eCommission%')
    .limit(1)
    .maybeSingle()
  if (payoutRow) {
    if (round2(n(payoutRow.amount_1099_reportable)) === target) {
      result.payout_row = 'unchanged'
    } else if (payoutRow.payment_status === 'paid') {
      result.payout_row = 'locked'
    } else {
      await supabaseAdmin
        .from('transaction_external_brokerages')
        .update({
          commission_amount: target,
          amount_1099_reportable: target,
          updated_at: now,
        })
        .eq('id', payoutRow.id)
      result.payout_row = 'updated'
    }
  }

  // office_net is derived from sum(TEB.amount_1099_reportable) and from staged
  // debts, both of which this function writes, so it has to be recomputed or
  // the broker approves a CDA against an office net that is stale by exactly
  // the correction. recomputeOfficeNet is idempotent and never throws. Every
  // other mutation site in the app pairs the two the same way.
  if (result.debt === 'updated' || result.payout_row === 'updated') {
    await recomputeOfficeNet(transactionId)
  }

  return result
}
