/**
 * Funding verification for a transaction - the single source of truth for
 * whether the money that arrived matches what the deal expects.
 *
 * Client-safe, zero imports. Shared by the deal-page funding banner, the
 * close/payout gates in the admin transaction route, the transactions-list
 * funding filter, and the dashboard tiles, so every surface agrees.
 *
 * States:
 *   waiting  - no checks received yet
 *   partial  - at least one check has not cleared. Never flagged as a
 *              mismatch while checks are outstanding - comparing an
 *              incomplete total against office gross is the false positive
 *              the old amber math flag kept firing on.
 *   matched  - every check cleared AND the cleared total is within the $1
 *              rounding tolerance of office gross. Ready to pay and close.
 *   mismatch - every check cleared and the totals still disagree. Fix the
 *              deal before paying or closing.
 */

/** $1 rounding tolerance - same figure the commission math checks have
 *  always used on the deal page. */
export const MATH_TOLERANCE = 1.0

export type FundingState = 'waiting' | 'partial' | 'matched' | 'mismatch'

export interface FundingCheckInput {
  check_amount?: number | string | null
  cleared_date?: string | null
}

export interface FundingStatus {
  state: FundingState
  /** What the deal expects: office gross. */
  expected: number
  /** Sum of CLEARED check amounts. */
  received: number
  /** received - expected. Positive = over, negative = short. */
  diff: number
  checkCount: number
  clearedCount: number
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? 0 : n
}

export function fundingStatus(
  checks: FundingCheckInput[] | null | undefined,
  officeGross: number | string | null | undefined
): FundingStatus {
  const list = checks || []
  const expected = Math.round(num(officeGross) * 100) / 100
  const cleared = list.filter(c => !!c.cleared_date)
  const received =
    Math.round(cleared.reduce((s, c) => s + num(c.check_amount), 0) * 100) / 100
  const diff = Math.round((received - expected) * 100) / 100

  let state: FundingState
  if (list.length === 0) {
    state = 'waiting'
  } else if (cleared.length < list.length) {
    state = 'partial'
  } else if (Math.abs(diff) <= MATH_TOLERANCE) {
    state = 'matched'
  } else {
    state = 'mismatch'
  }

  return {
    state,
    expected,
    received,
    diff,
    checkCount: list.length,
    clearedCount: cleared.length,
  }
}

/**
 * Whether a deal belongs in the funding filter / funding tiles, and if so
 * which state it is in. Returns null for deals outside the funding story:
 * cancelled deals, deals with no office gross, and deals that are neither
 * closed nor holding a check (a working deal isn't "waiting on payment" -
 * money is only expected once the deal has closed).
 *
 * The transactions list chips and the dashboard tiles both call this, so
 * a tile count always matches the list the tile links to.
 */
export function fundingFilterState(
  txn: { status?: string | null; office_gross?: number | string | null },
  checks: FundingCheckInput[] | null | undefined
): FundingState | null {
  const status = String(txn?.status || '').toLowerCase()
  if (status === 'cancelled') return null
  const expected = num(txn?.office_gross)
  if (expected <= 0) return null
  const list = checks || []
  if (list.length === 0 && status !== 'closed') return null
  return fundingStatus(list, expected).state
}

export const FUNDING_FILTER_LABELS: Record<FundingState, string> = {
  waiting: 'Waiting on payment',
  partial: 'Partially funded',
  matched: 'Verified',
  mismatch: 'Mismatch',
}
