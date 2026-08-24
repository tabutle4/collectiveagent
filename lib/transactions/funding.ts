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
 * What the deal's agent rows say about money, aggregated per transaction.
 * Deliberately booleans rather than amounts: the list page only needs to know
 * THAT an agent was paid, so no commission figure has to cross the wire.
 */
export interface FundingAgentSummary {
  /** At least one agent row on this deal has a payment_date. */
  anyPaid?: boolean | null
  /** At least one agent row has agent_basis > 0, i.e. the deal carries real
   *  payout data at all. */
  anyBasis?: boolean | null
}

/**
 * Whether a deal belongs in the funding filter / funding tiles, and if so
 * which state it is in. Returns null for deals outside the funding story.
 *
 * A PAID AGENT MEANS FUNDED. Tara does not always enter a check: when title
 * pays the agent directly, no check ever passes through the office, so the
 * absence of a check record is not the absence of money. Measured 2026-08-23:
 * "Waiting on payment" claimed 739 deals, 738 of them closed deals with zero
 * check rows. Of those 738, 282 had a paid agent and 456 were old imports
 * carrying no payout data at all. Exactly ZERO were genuinely waiting. A date
 * cutoff would not have fixed it either, because title still pays agents
 * directly today.
 *
 * So the order of questions is:
 *   1. cancelled, or no office gross      -> null (unchanged)
 *   2. checks on file                     -> the existing check math, and its
 *                                           verdict STANDS (see below)
 *   3. no checks, any agent paid          -> matched
 *   4. no checks, not closed              -> null (unchanged: a working deal
 *                                           is not "waiting on payment")
 *   5. closed, no checks, no payout data  -> null. Unknowable, not waiting.
 *   6. closed, no checks, has payout data -> the check math, i.e. waiting
 *
 * WHY CHECKS ARE ASKED FIRST. The rule as originally written was "if the agent
 * was paid, return matched regardless of checks." Measured against live data
 * that also converts 19 'mismatch' deals and 1 'partial' to 'matched', because
 * their agents happen to have been paid. A mismatch means cleared checks
 * disagree with office gross by more than the $1 tolerance - a bookkeeping
 * error that paying the agent does not fix, and one the owner dashboard's
 * "Needs attention" section exists to surface. Asking about checks first
 * reaches the same goal (738 stale "waiting" deals become funded, zero remain
 * waiting) without deleting 19 real warnings:
 *
 *              waiting  matched  partial  mismatch  excluded
 *   before         738      242        1        21       245
 *   paid-first       0     1000        0         2       245   <- loses 19
 *   checks-first     0      980        1        21       245   <- implemented
 *
 * A deal that genuinely has no check record is untouched by this ordering,
 * which is the entire case the rule was written for.
 *
 * This is a predicate fix, not a data fix. Nothing needs backfilling. Note
 * that step 5 currently matches nothing: all 738 closed-no-check deals have a
 * paid agent, so the "old import with no payout data" class is empty today.
 * It is kept as a guard for rows that arrive that way later.
 *
 * The transactions list chips, the deal-page banner and the dashboard tiles
 * all call this, so a tile count always matches the list the tile links to.
 */
export function fundingFilterState(
  txn: { status?: string | null; office_gross?: number | string | null },
  checks: FundingCheckInput[] | null | undefined,
  agents?: FundingAgentSummary | null
): FundingState | null {
  const status = String(txn?.status || '').toLowerCase()
  if (status === 'cancelled') return null
  const expected = num(txn?.office_gross)
  if (expected <= 0) return null

  // Checks first: where they exist, their verdict is the answer. A paid agent
  // does not make a mismatch go away.
  const list = checks || []
  if (list.length > 0) return fundingStatus(list, expected).state

  // No check record. A paid agent is proof the money arrived anyway - this is
  // the title-paid-the-agent-directly case.
  if (agents?.anyPaid) return 'matched'

  if (status !== 'closed') return null

  // Closed, no checks, nobody paid. An old import with no payout data on it
  // cannot be assessed - calling it "waiting" invents an expectation that
  // nobody is actually waiting on.
  if (agents && !agents.anyBasis) return null

  return fundingStatus(list, expected).state
}

export const FUNDING_FILTER_LABELS: Record<FundingState, string> = {
  waiting: 'Waiting on payment',
  partial: 'Partially funded',
  matched: 'Verified',
  mismatch: 'Mismatch',
}
