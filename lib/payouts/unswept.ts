// lib/payouts/unswept.ts
//
// One answer to "is this deal's share still sitting in the payouts account".
//
// Three places asked that question and each answered it differently. The
// payouts report skipped an amount of zero or less and never checked whether
// the deal was cancelled; lib/payouts/position.ts skipped only an exact zero;
// loadSweepable in the sweeps route kept anything non-zero. On today's data
// all three resolve to the same six actionable deals, so the disagreement is
// invisible: it takes one cancelled deal with a payouts check, or one negative
// office net, for the report to claim money the sweep will not move, or the
// reverse.
//
// The sweep's own list is longer than six, and that is not a disagreement:
// loadSweepable deliberately keeps a title-split deal so it can show it as
// refused rather than drop it silently. Its refused total reconciles the two.
//
// The sweep is the one that actually moves money, so its rule is the one kept
// here and the other two now defer to it.

export type UnsweptCandidate = {
  status?: string | null
  office_net?: number | string | null
  office_net_swept_at?: string | null
}

/**
 * True when a deal's office net is still in the payouts account.
 *
 * Says nothing about whether the money ever arrived. A deal where title paid
 * at the closing table has no share here to move, and callers exclude those
 * separately, by title-direct id or by office_net_state.
 */
export function isUnsweptDeal(t: UnsweptCandidate): boolean {
  if (t.status === 'cancelled') return false
  if (t.office_net_swept_at) return false
  return Number(t.office_net || 0) !== 0
}
