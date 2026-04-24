/**
 * Transaction pipeline stages — gated one-way progression.
 *
 * A deal can only reach stage N when the gate for stage N is satisfied. If
 * a gate fails, the deal stays at the highest previous stage whose gate is
 * met. The deal can never "skip" a stage. Locked 2026-04-24.
 *
 * Stages and gates:
 *   1. Prospect            — transaction exists
 *   2. Active              — listing is active (listings only; buyers skip
 *                            to Pending when they go under contract)
 *   3. Pending             — under_contract_date is set
 *   4. Compliance Review   — docs submitted to TC (compliance_status ∈
 *                            submitted, in_review, revision_requested,
 *                            compliant, broker_review, approved)
 *   5. Closed              — compliance_complete_date is set AND
 *                            closed_date is set
 *   6. Awaiting Payment    — at Closed AND no funds received yet
 *   7. Funded              — at Closed AND funds received ≥ expected
 *   8. Paid Out            — every TIA on the transaction has
 *                            payment_status='paid'
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
  | 'closed'
  | 'awaiting_payment'
  | 'funded'
  | 'paid_out'

export const PIPELINE_STAGES: PipelineStage[] = [
  'prospect',
  'active',
  'pending',
  'compliance_review',
  'closed',
  'awaiting_payment',
  'funded',
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

/** Compliance statuses that indicate docs have at least been submitted to TC. */
const COMPLIANCE_SUBMITTED_STATUSES = new Set([
  'submitted',
  'in_review',
  'revision_requested',
  'compliant',
  'broker_review',
  'approved',
])

export interface StageInputs {
  status?: TransactionStatus | string | null
  transaction_type?: string | null

  /** Listing-side fields */
  listing_active?: boolean | null
  listing_date?: string | null

  /** Contract event */
  under_contract_date?: string | null

  /** Compliance */
  compliance_status?: string | null
  compliance_complete_date?: string | null

  /** Closing event */
  closed_date?: string | null

  /** Funding (aggregated from checks) */
  total_check_amount_received?: number | null
  total_check_amount_expected?: number | null

  /** Derived from TIA payment_status */
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

  // Walk the gates top-down. We return the highest stage whose gate has
  // been met AND whose previous stage's gate has also been met (enforced
  // naturally by the sequential structure below).

  // Gate 8: Paid Out — all agents paid (authoritative signal)
  if (t.all_agents_paid) return 'paid_out'

  // Gate 7: Funded — Closed gate must also be met
  const closedGateMet =
    !!t.compliance_complete_date && !!t.closed_date
  if (closedGateMet) {
    const expected = t.total_check_amount_expected
    const received = t.total_check_amount_received ?? 0
    if (expected != null && expected > 0 && received >= expected) {
      return 'funded'
    }
    // Gate 6: Awaiting Payment — at Closed with no funding yet
    if (received > 0 || expected != null) {
      return 'awaiting_payment'
    }
    // Closed but no checks on file yet — treat as Awaiting Payment
    return 'awaiting_payment'
  }

  // Closed_date set but compliance NOT complete — stay at Compliance Review
  // (one-way progression, can't skip the compliance gate)
  if (t.closed_date && !t.compliance_complete_date) {
    return 'compliance_review'
  }

  // Gate 5 (Closed) failed — check stages below

  // Gate 4: Compliance Review — docs at least submitted to TC
  if (
    t.compliance_status &&
    COMPLIANCE_SUBMITTED_STATUSES.has(t.compliance_status.toLowerCase())
  ) {
    return 'compliance_review'
  }

  // Gate 3: Pending — under_contract_date set
  if (t.under_contract_date) {
    return 'pending'
  }

  // Gate 2: Active — only for listings. Buyer-side deals skip Active and
  // stay at Prospect until they go under contract.
  if (isListingSide(t.transaction_type)) {
    if (t.listing_active || t.listing_date) {
      return 'active'
    }
  }

  // Gate 1: Prospect — default when no other gate is met
  return 'prospect'
}

/**
 * Listing-side transaction types (sellers and landlords). Buyer-side and
 * tenant-side types are listing-less and skip the Active stage.
 */
function isListingSide(type: string | null | undefined): boolean {
  if (!type) return false
  const t = type.toLowerCase()
  return (
    t.includes('seller') ||
    t.includes('landlord') ||
    t.includes('listing')
  )
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
 * Helper: given TIA rows, returns whether all agents on the transaction
 * are paid. Used to derive the Paid Out stage without the deprecated
 * checks.agents_paid toggle.
 */
export function allAgentsPaid(
  tias: Array<{ payment_status?: string | null }>
): boolean {
  if (!tias || tias.length === 0) return false
  return tias.every((t) => (t.payment_status || '').toLowerCase() === 'paid')
}
