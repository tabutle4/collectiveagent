/**
 * Transaction pipeline stages — gated one-way progression.
 *
 * A deal can only reach stage N when the gate for stage N is satisfied. If
 * a gate fails, the deal stays at the highest previous stage whose gate is
 * met. The deal can never "skip" a stage. Locked 2026-04-24.
 *
 * Stages and gates:
 *   1. Prospect            — transaction exists
 *   2. Active              — status is 'active'
 *   3. Pending             — status is 'pending', or acceptance_date is set
 *   4. Compliance Review   — docs at least submitted to TC
 *   5. Awaiting Payment    — compliance complete, money not verified yet
 *   6. Funded              — funds verified against office gross
 *   7. Closed              — closed_date is set AND compliance is complete
 *   8. Paid Out            — every TIA on the transaction has
 *                            payment_status='paid'
 *
 * FUNDED SITS BELOW CLOSED, not above it. The app's own close_transaction
 * gate requires fundingStatus === 'matched' before a deal may be closed, so
 * money always arrives first. The previous order put Closed at 5 and decided
 * funded-vs-awaiting *inside* the closed branch, which meant a deal with
 * verified funds and no closed_date could not reach Funded at all.
 *
 * Cancelled transactions return null — the caller renders a text-only
 * status badge instead of a pipeline rail.
 */

import type { TransactionStatus } from './types'

export type PipelineStage =
  | 'prospect'
  | 'active'
  | 'pending'
  | 'compliance_review'
  | 'awaiting_payment'
  | 'funded'
  | 'closed'
  | 'paid_out'

export const PIPELINE_STAGES: PipelineStage[] = [
  'prospect',
  'active',
  'pending',
  'compliance_review',
  'awaiting_payment',
  'funded',
  'closed',
  'paid_out',
]

export const STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: 'Prospect',
  active: 'Active',
  pending: 'Pending',
  compliance_review: 'Compliance Review',
  closed: 'Closed',
  awaiting_payment: 'Awaiting Payment',
  funded: 'Funded',
  paid_out: 'Paid Out',
}

/**
 * Compliance statuses that indicate docs have at least been submitted to TC.
 *
 * Checked against the live vocabulary 2026-08-23. Actual values in
 * transactions.compliance_status, with counts:
 *
 *   complete       1086     submitted-and-finished  → counts
 *   not_submitted   112     nothing sent yet        → does NOT count
 *   not_requested    18     nothing asked for yet   → does NOT count
 *   submitted        17     sent to TC              → counts
 *   incomplete       11     sent, needs work        → counts
 *   in_review         3     TC working it           → counts
 *
 * 'complete' was MISSING from this set, and 'compliant' (which was in it)
 * does not occur even once. That single omission covered 1,086 deals - 89%
 * of the table - and is why a compliance-complete deal fell straight through
 * this gate to Prospect. 'incomplete' counts as submitted because the ops
 * dashboard's own "Compliance Requested" tile treats it that way
 * (compliance_status IN ('submitted','incomplete')).
 *
 * The four legacy values with zero live rows are kept: they cost nothing and
 * older rows elsewhere may still carry them.
 */
const COMPLIANCE_SUBMITTED_STATUSES = new Set([
  'complete',
  'submitted',
  'incomplete',
  'in_review',
  'revision_requested',
  'compliant',
  'broker_review',
  'approved',
])

export interface StageInputs {
  status?: TransactionStatus | string | null
  /**
   * Passed by the caller and currently unread: the listing-side check that
   * used it is gone with the old Active gate. Kept rather than deleted
   * because, unlike the listing fields below, this one genuinely arrives and
   * is a real column - a future gate is a plausible consumer. Delete it if
   * that never happens.
   */
  transaction_type?: string | null

  /*
   * `listing_active` and `listing_date` used to live here as the inputs to the
   * Active gate. Both are gone for the same reason `under_contract_date` was:
   * no caller ever passed them. getPipelineStage has exactly one caller and it
   * supplied neither, so the Active dot could never light up. `listing_active`
   * was not even a column - it existed only on this interface. `listing_date`
   * IS a real column, written by the listings routes, but it never reached
   * this function. A parameter that looks meaningful and never arrives is a
   * trap for the next reader, so the gate now reads status instead. See Gate 2.
   */

  /**
   * Contract event. This is the real column name, deliberately: the field used
   * to be called `under_contract_date`, which is not a column anywhere in the
   * database - it existed only on this interface, and its one caller mapped
   * `acceptance_date` into it. An interface field named after a column that
   * does not exist is a trap for the next reader, so the alias is gone.
   *
   * It is now only a FALLBACK for the Pending gate. See Gate 3.
   */
  acceptance_date?: string | null

  /** Compliance */
  compliance_status?: string | null
  compliance_complete_date?: string | null

  /** Closing event */
  closed_date?: string | null

  /** Funding (aggregated from checks) */
  total_check_amount_received?: number | null
  total_check_amount_expected?: number | null
  /**
   * Verified funding state from lib/transactions/funding.ts. When provided
   * it is authoritative for the Funded gate: only 'matched' counts as
   * funded, so an over/under mismatch never paints the Funded dot. The raw
   * received/expected comparison below remains as the fallback for callers
   * that haven't computed the funding state.
   */
  funding_state?: 'waiting' | 'partial' | 'matched' | 'mismatch' | null

  /**
   * Derived from TIA payment_status AND external-brokerage payment_status.
   * Build it with allAgentsPaid(tias, externals) - see that helper for why the
   * external rows are not optional in practice.
   */
  all_agents_paid?: boolean | null
}

/**
 * Returns the current pipeline stage based on which gates the transaction
 * has passed. Null when the transaction is cancelled (caller renders the
 * cancelled badge instead of a rail).
 */
export function getPipelineStage(t: StageInputs): PipelineStage | null {
  const status = (t.status || '').toString().toLowerCase()
  if (status === 'cancelled') return null

  // Two distinct notions, and conflating them is what broke the old version:
  //   submitted = docs have reached TC (stage 4 and up)
  //   complete  = compliance is finished (stage 5 and up)
  // compliance_complete_date is supplied by the caller from DERIVED
  // compliance, not from the stored column, because the stored column is
  // dual-written and falls behind.
  const complianceComplete = !!t.compliance_complete_date
  const complianceSubmitted =
    complianceComplete ||
    (!!t.compliance_status &&
      COMPLIANCE_SUBMITTED_STATUSES.has(t.compliance_status.toLowerCase()))

  // Rollback guard for the two terminal gates ONLY.
  //
  // Gates 7 and 8 promote a deal on things that moving its status backwards
  // does not undo: closed_date stays on the row, and paid agent rows stay
  // paid. So a deal walked back from Closed to Pending kept reading Closed
  // or Paid Out with no way to correct it.
  //
  // Deliberately narrow. It would be easy to cap the whole rail at the
  // deal's own status, and wrong: 38 pending and 30 active deals have
  // compliance complete right now, and they SHOULD read Compliance Review,
  // Awaiting Payment or Funded. Progress before closing is real progress.
  // Only Closed and Paid Out are claims a non-closed deal cannot make.
  //
  // Scoped to the two statuses that mean "walked back": active and pending.
  // NOT written as `status === 'closed'`, which would also demote the 4
  // prospect deals that have every agent paid - odd data, but data that
  // reads Paid Out today and has nothing to do with this bug.
  //
  // Live data, 25 Aug 2026: no pending or active deal carries a closed_date
  // or has all its agents paid, so this demotes nothing today - the stale
  // Closed reading was in the browser, not the database. It is what keeps
  // the next rollback honest.
  const rolledBack = status === 'active' || status === 'pending'

  // Gate 8: Paid Out — every agent AND every external brokerage paid.
  // Authoritative, outranks everything, which is exactly why it must not be
  // computed from the internal agent rows alone.
  if (t.all_agents_paid && !rolledBack) return 'paid_out'

  // Gate 7: Closed. One-way progression still holds: a closed_date with
  // incomplete compliance cannot skip the compliance gate, so it parks at
  // Compliance Review exactly as before.
  if (t.closed_date && !rolledBack) {
    return complianceComplete ? 'closed' : 'compliance_review'
  }

  // Gate 6: Funded — funds verified. No closed_date required: a deal whose
  // money has landed but which nobody has closed yet IS funded, and telling
  // the operator so is the whole point of the rail. Still gated on having
  // reached compliance, so money on an untouched deal cannot skip stages.
  if (complianceSubmitted && fundsVerified(t)) return 'funded'

  // Gate 5: Awaiting Payment — compliance finished, money not verified.
  if (complianceComplete) return 'awaiting_payment'

  // Gate 4: Compliance Review — docs at least submitted to TC.
  if (complianceSubmitted) return 'compliance_review'

  // Gate 3: Pending — the deal's own status says so, or an acceptance date
  // is on file.
  //
  // Status FIRST, date second. Keying this gate on a date alone was the bug:
  // acceptance_date is set on only 175 of 1,187 non-cancelled deals, and 869
  // closed deals have none, so the gate recognised almost nothing and
  // everything under contract sat at Prospect instead. The transaction's own
  // status is the field the office actually maintains.
  //
  // Same rule for sales and leases, no per-type branching. Explicitly NOT
  // move_in_date: that is closer to a closing date than an under-contract
  // signal, so it is not read here or anywhere else in this file.
  if (status === 'pending' || t.acceptance_date) {
    return 'pending'
  }

  // Gate 2: Active — the deal's own status says so.
  //
  // Status only, and deliberately no date fallback: no listing_date, no
  // effective_date, nothing secondary. Status is the field the office
  // maintains, and it is the whole signal here.
  //
  // No listing-side branching either. The old version only considered
  // seller- and landlord-side types, which is why a buyer-side deal sitting
  // at status 'active' still showed as Prospect.
  //
  // This sits BELOW Gate 3, so a deal that has also earned Pending or higher
  // keeps the higher stage - the gates are checked from 8 down to 1 and the
  // first match wins.
  if (status === 'active') return 'active'

  // Gate 1: Prospect — nothing else met.
  return 'prospect'
}

/**
 * Whether the money is verified. Prefers the caller's computed funding_state
 * (only 'matched' counts, so an over/under mismatch never paints Funded) and
 * falls back to the raw received-vs-expected comparison for callers that
 * have not computed it.
 */
function fundsVerified(t: StageInputs): boolean {
  if (t.funding_state) return t.funding_state === 'matched'
  const expected = t.total_check_amount_expected
  const received = t.total_check_amount_received ?? 0
  return expected != null && expected > 0 && received >= expected
}

/**
 * Returns 'done' | 'current' | 'upcoming' for a stage relative to the
 * transaction's current stage. Used by the pipeline rail UI to paint
 * dots and connector lines.
 */
export function stageState(
  stage: PipelineStage,
  current: PipelineStage
): 'done' | 'current' | 'upcoming' {
  const currentIdx = PIPELINE_STAGES.indexOf(current)
  const stageIdx = PIPELINE_STAGES.indexOf(stage)
  if (stageIdx < currentIdx) return 'done'
  if (stageIdx === currentIdx) return 'current'
  return 'upcoming'
}

/**
 * Helper: whether EVERY payee on the transaction is paid. Used to derive the
 * Paid Out stage without the deprecated checks.agents_paid toggle.
 *
 * Two sets of payees, and both have to be paid:
 *   transaction_internal_agents      - CRC's own agents
 *   transaction_external_brokerages  - co-op brokerages, referral brokerages,
 *                                     and eCommission advance repayments
 *
 * The external rows carry their own payment_status / payment_date /
 * payment_method / payment_reference and are real money owed out of the same
 * commission. Reading only the internal rows made Paid Out fire while a co-op
 * brokerage was still owed, and because Gate 8 outranks every other gate the
 * rail claimed the deal was finished. Confirmed live on 5725 Adamite Way,
 * where the rail showed Paid Out with a $3,120.95 eCommission advance
 * repayment still unpaid.
 *
 * `externals` is optional ONLY so the signature stays backwards compatible.
 * Omitting it reproduces the bug, so every caller passes it. The deal page
 * reads them from its main data payload, not from the lazily-fetched
 * Check & Payouts tab state, so the rail is right on first paint.
 *
 * app/admin/reports/payouts/page.tsx has always had its own local version of
 * this predicate that DID check the external rows. That one is correct; this
 * one was the outlier.
 */
export function allAgentsPaid(
  tias: Array<{ payment_status?: string | null }>,
  externals?: Array<{ payment_status?: string | null }> | null
): boolean {
  const internalRows = tias || []
  const externalRows = externals || []
  // No payees at all means nothing has been paid out, not that everything has.
  if (internalRows.length === 0 && externalRows.length === 0) return false
  const isPaid = (r: { payment_status?: string | null }) =>
    (r.payment_status || '').toLowerCase() === 'paid'
  return internalRows.every(isPaid) && externalRows.every(isPaid)
}
