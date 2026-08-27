/**
 * Funding verification for a transaction - the single source of truth for
 * whether the money that arrived matches what the deal expects.
 *
 * Client-safe, zero imports. Shared by the deal-page funding banner, the
 * close/payout gates in the admin transaction route, the transactions-list
 * funding filter, and the dashboard tiles, so every surface agrees.
 *
 * WHAT THE DEAL EXPECTS. office_gross is the office's own commission. It is
 * NOT the whole check. BTSA (bonus to selling agent) is money the title
 * company adds to the same check, which passes through the office to the
 * agent, so the check that arrives is office_gross + BTSA. The app already
 * defines that sum: computeGrossFromSides() in lib/transactions/math.ts
 * returns gross_commission = office_gross + btsa_total, and
 * recomputeGrossAndOffice() feeds it the SUM OF transaction_internal_agents
 * .btsa_amount. This file now compares the cleared checks against the same
 * figure.
 *
 * BTSA comes from transaction_internal_agents.btsa_amount ONLY. Measured over
 * 1,187 non-cancelled deals on 24 August 2026: the TIA column is non-zero on
 * 25 deals, transactions.btsa_amount on 5, and there are ZERO deals carrying
 * it on transactions without also carrying it on the TIA rows - the TIA
 * column is a strict superset, and on all 5 overlapping deals the two values
 * are identical. transactions.has_btsa and transactions.bonus_amount are
 * form-capture echoes of the same figure. Never sum more than one of them.
 *
 * States:
 *   waiting  - no checks received yet
 *   partial  - at least one check has not cleared. Never flagged as a
 *              mismatch while checks are outstanding - comparing an
 *              incomplete total against office gross is the false positive
 *              the old amber math flag kept firing on.
 *   matched  - every check cleared AND the cleared total is within the $1
 *              rounding tolerance of what the deal expects. Ready to pay and
 *              close.
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
  /** What the deal expects: office gross + BTSA. */
  expected: number
  /** The BTSA portion of `expected`. 0 on the overwhelming majority of deals. */
  btsa: number
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

/**
 * The deal's BTSA total, from its agent rows. ONE definition, used by the deal
 * page banner, the close dialog, the close/payout gates, the transactions list
 * and the dashboard tiles, so no two surfaces can disagree about what a deal
 * expects.
 *
 * Deliberately UNFILTERED by agent_role, because the figure this has to agree
 * with is transactions.gross_commission, and recomputeGrossAndOffice() sums
 * every row's btsa_amount without filtering before handing it to
 * computeGrossFromSides(). Matching that exactly is the point.
 *
 * Note that components/transactions/CloseDialog.tsx and the deal page's
 * Overview "Gross" display both compute the same sum with the linked roles
 * (team_lead, momentum_partner, referral_agent) filtered out. That filter is a
 * NO-OP on live data: of the 26 agent rows carrying a non-zero btsa_amount on
 * 24 August 2026, all 26 are agent_role = 'primary_agent' and not one linked
 * row carries any. So filtered and unfiltered agree today. If a linked row
 * ever gets a BTSA the two would part company, and gross_commission would
 * follow this one.
 */
export function btsaTotalFromAgentRows(
  rows: Array<{ btsa_amount?: number | string | null }> | null | undefined
): number {
  return Math.round((rows || []).reduce((s, r) => s + num(r?.btsa_amount), 0) * 100) / 100
}

/**
 * How to name the figure in `FundingStatus.expected` to a human. Kept here so
 * the banner, the close dialog, the deal-page payout chips and the server's
 * close and payout gates all use the same words. Says "office gross" on the
 * overwhelming majority of deals, where BTSA is zero, and only widens when
 * there is BTSA to account for.
 */
export function fundingExpectedLabel(btsa: number | string | null | undefined): string {
  return num(btsa) > 0 ? 'office gross plus BTSA' : 'office gross'
}

export function fundingStatus(
  checks: FundingCheckInput[] | null | undefined,
  officeGross: number | string | null | undefined,
  /**
   * Sum of transaction_internal_agents.btsa_amount for the deal. Optional so
   * every existing call site keeps compiling, but a caller that omits it on a
   * BTSA deal will report a false mismatch - see the docblock at the top of
   * this file.
   */
  btsaTotal?: number | string | null
): FundingStatus {
  const list = checks || []
  const btsa = Math.round(num(btsaTotal) * 100) / 100
  const expected = Math.round((num(officeGross) + num(btsaTotal)) * 100) / 100
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
    btsa,
    received,
    diff,
    checkCount: list.length,
    clearedCount: cleared.length,
  }
}

/**
 * What the deal's agent rows say about money, aggregated per transaction.
 * Booleans wherever a boolean will do: the list page only needs to know THAT
 * an agent was paid, so no agent's commission figure has to cross the wire.
 * btsaTotal is the one amount here, and it is the office's expectation rather
 * than anyone's pay.
 */
export interface FundingAgentSummary {
  /** At least one agent row on this deal has a payment_date. */
  anyPaid?: boolean | null
  /** At least one agent row has agent_basis > 0, i.e. the deal carries real
   *  payout data at all. */
  anyBasis?: boolean | null
  /**
   * Sum of btsa_amount across the deal's agent rows. Part of what the deal
   * expects to receive, because BTSA arrives in the same check. An amount
   * rather than a boolean: unlike the flags above it has to be compared, not
   * just known about, and it is the office's own figure, not an agent's net.
   */
  btsaTotal?: number | string | null
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
  // Guard stays on office_gross alone, deliberately. It decides whether a deal
  // is in the funding story at all, and widening it to office_gross + BTSA
  // would pull deals with no office commission into the tiles.
  if (expected <= 0) return null
  const btsa = num(agents?.btsaTotal)

  // Checks first: where they exist, their verdict is the answer. A paid agent
  // does not make a mismatch go away.
  const list = checks || []
  if (list.length > 0) return fundingStatus(list, expected, btsa).state

  // No check record. A paid agent is proof the money arrived anyway - this is
  // the title-paid-the-agent-directly case.
  if (agents?.anyPaid) return 'matched'

  if (status !== 'closed') return null

  // Closed, no checks, nobody paid. An old import with no payout data on it
  // cannot be assessed - calling it "waiting" invents an expectation that
  // nobody is actually waiting on.
  if (agents && !agents.anyBasis) return null

  return fundingStatus(list, expected, btsa).state
}

export const FUNDING_FILTER_LABELS: Record<FundingState, string> = {
  waiting: 'Waiting on payment',
  partial: 'Partially funded',
  matched: 'Verified',
  mismatch: 'Mismatch',
}

/**
 * A staged debt or credit sitting against a deal: an agent_debts row with
 * status='paid' and offset_transaction_id set to this deal.
 */
export interface StagedRecordInput {
  /** The TIA row the record was staged against. */
  offset_transaction_agent_id?: string | null
  /** 'credit' pays the agent more; anything else withholds from them. */
  record_type?: string | null
  amount_owed?: number | string | null
  amount_remaining?: number | string | null
}

/** The fields of a transaction_internal_agents row this file needs. */
export interface AgentNetRowInput {
  id?: string | null
  agent_net?: number | string | null
  payment_status?: string | null
}

/**
 * What one agent row will actually be paid, with staged debts and credits
 * folded in. ONE definition, so the close dialog, the server's close gate and
 * the deal page cannot disagree about what a payee is owed.
 *
 * Why this is not just agent_net: transaction_internal_agents.debts_deducted
 * is stamped at Mark Paid and nowhere else, so an UNPAID row reads
 * debts_deducted = 0 and its stored agent_net is the figure BEFORE any
 * withholding. recomputeOfficeNet, by contrast, folds staged debts into
 * office_net the moment they are staged. Reconciling raw agent_net against
 * that office_net therefore reports the deal as over-allocated by exactly the
 * staged total, on a deal where nothing is wrong. Measured 27 August 2026:
 * every open deal carrying a staged debt on an unpaid row was off by exactly
 * the staged amount, and every deal whose rows were already paid reconciled
 * to zero.
 *
 * A PAID row is returned as-is. Its agent_net already carries debts_deducted
 * from Mark Paid, and subtracting the staged records again would double-count.
 * Same rule the deal page's payout preview uses.
 *
 * `staged` may be the whole deal's staged pool; records are matched to this
 * row by offset_transaction_agent_id, so passing extra rows is safe and
 * passing the same pool for every agent cannot double-count.
 */
export function effectiveAgentNet(
  row: AgentNetRowInput | null | undefined,
  staged: StagedRecordInput[] | null | undefined
): number {
  const baseNet = num(row?.agent_net)
  if (String(row?.payment_status || '') === 'paid') {
    return Math.round(baseNet * 100) / 100
  }
  let debts = 0
  let credits = 0
  for (const r of staged || []) {
    if (!r || r.offset_transaction_agent_id !== row?.id) continue
    const applied = Math.max(0, num(r.amount_owed) - num(r.amount_remaining))
    if (String(r.record_type || '') === 'credit') credits += applied
    else debts += applied
  }
  return Math.round((baseNet - debts + credits) * 100) / 100
}

/** Sum of effectiveAgentNet across a deal's agent rows. */
export function effectiveAgentNetTotal(
  rows: Array<AgentNetRowInput & { billing?: { staged?: StagedRecordInput[] | null } | null }> | null | undefined,
  staged?: StagedRecordInput[] | null
): number {
  const total = (rows || []).reduce(
    (s, r) => s + effectiveAgentNet(r, staged ?? r?.billing?.staged),
    0
  )
  return Math.round(total * 100) / 100
}
