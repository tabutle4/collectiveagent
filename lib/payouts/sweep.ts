// lib/payouts/sweep.ts
//
// Whether a deal's office net can move to the income account, and if not, what
// it is waiting on. Pure: no database. Callers fetch and pass in.
//
// HARD RULE, and the reason this file holds no compliance logic of its own:
// compliance status comes from `deriveComplianceForTransactions` in
// `lib/compliance/derive.ts` and nowhere else. Re-deriving it produced two
// wrong answers during design, both times by missing that a complete
// submission outranks a newer open one. The route calls the app's function and
// hands the result here.
//
// The standing rule from Tara is never block, only warn. There is exactly one
// exception, `sweepRefusal` below, and it exists because she stated that office
// net is never negative: a negative is therefore a broken deal rather than a
// judgement call, and moving it would be meaningless.

export type SweepGates = {
  /** Every check on the deal has cleared, on or before today. */
  fundsCleared: boolean
  /** Checklist items done, and how many the deal's template requires. */
  checklistDone: number
  checklistRequired: number
  /** Compliance sides that have actually been signed off. */
  sidesComplete: number
  /** Sides the deal expects. 2 when Collective Realty Co. is on both. */
  sidesExpected: number
}

export function checklistComplete(g: SweepGates): boolean {
  return g.checklistRequired > 0 && g.checklistDone >= g.checklistRequired
}

/**
 * The badge. A one-sided deal shows nothing, because "1 of 1" on every
 * ordinary row buries the two-sided deals this exists to surface. A two-sided
 * deal always carries its fraction, finished or not: "1 of 2" is the point,
 * and "2 of 2" beside it is what makes "1 of 2" read as incomplete.
 */
export function sidesBadge(g: SweepGates): string | null {
  if (g.sidesExpected <= 1) return null
  return `${g.sidesComplete} of ${g.sidesExpected}`
}

/**
 * Cleared and Verified, per Tara: funds cleared, checklist done, and at least
 * one side verified. A deal with one of two sides signed off belongs here with
 * its fraction showing, not hidden in Needs Attention.
 */
export function isClearedAndVerified(g: SweepGates): boolean {
  return g.fundsCleared && checklistComplete(g) && g.sidesComplete >= 1
}

/**
 * What a Needs Attention row is waiting on, in the order a person would fix it.
 * Empty means nothing, which should not happen on that bucket.
 */
export function waitingOn(g: SweepGates): string[] {
  const out: string[] = []
  if (!g.fundsCleared) out.push('Funds not cleared')
  if (!checklistComplete(g)) {
    out.push(
      g.checklistRequired > 0
        ? `Checklist ${g.checklistDone} of ${g.checklistRequired}`
        : 'No checklist on this deal'
    )
  }
  if (g.sidesComplete < 1) out.push('No compliance side signed off')
  else if (g.sidesComplete < g.sidesExpected) {
    out.push(`Compliance ${g.sidesComplete} of ${g.sidesExpected} sides`)
  }
  return out
}

/**
 * The one hard stop. Returns a reason when the deal must not be swept at all,
 * or null when it may be. Everything else warns.
 */
export function sweepRefusal(officeNet: number): string | null {
  if (!Number.isFinite(officeNet)) {
    return 'Office net is not a number on this deal'
  }
  if (officeNet < 0) {
    return 'Office net is negative, which means the commission inputs on this deal are wrong. Fix the deal, then sweep.'
  }
  if (officeNet === 0) {
    return 'Nothing to move on this deal'
  }
  return null
}

/**
 * Pre-ticked in the sweep dialog. Ready means every gate is met, so the office
 * can move it without thinking. An unready deal is still tickable by hand, with
 * its warning shown, unless `sweepRefusal` says otherwise.
 */
export function isSweepReady(g: SweepGates, officeNet: number): boolean {
  if (sweepRefusal(officeNet)) return false
  return g.fundsCleared && checklistComplete(g) && g.sidesComplete >= g.sidesExpected
}

/** Warnings shown beside a ticked but not ready deal. Never blocks. */
export function sweepWarnings(g: SweepGates): string[] {
  return waitingOn(g)
}

export type PayoutBucket = 'paid_recently' | 'cleared_verified' | 'needs_attention'

/**
 * Which section of the payouts report a deal sits in.
 *
 * `crcTransferred` is the per-check toggle the office marks by hand, surfaced
 * in the UI as a check being processed. It has nothing to do with sweeping
 * office net, and the two were briefly and wrongly treated as the same thing.
 */
export function payoutBucket(args: { crcTransferred: boolean; gates: SweepGates }): PayoutBucket {
  if (args.crcTransferred) return 'paid_recently'
  return isClearedAndVerified(args.gates) ? 'cleared_verified' : 'needs_attention'
}

const BUCKET_LABELS: Record<PayoutBucket, string> = {
  paid_recently: 'Paid Most Recently',
  cleared_verified: 'Cleared and Verified',
  needs_attention: 'Needs Attention',
}

export function payoutBucketLabel(b: PayoutBucket): string {
  return BUCKET_LABELS[b]
}

/**
 * Shown when Cleared and Verified is empty. That is the normal end of a working
 * day rather than a problem: everyone eligible has been paid.
 */
export const CLEARED_VERIFIED_EMPTY = 'All clear. Everyone eligible has been paid.'
