/**
 * Which team a deal counts for, decided by WHEN the deal happened.
 *
 * Team production was attributed by looking up who is on a team right now and
 * applying that answer to every deal in the range, however old. Two things went
 * wrong with that, in opposite directions:
 *
 *   A team was credited for deals its member did BEFORE joining, because the
 *   lookup ignored effective_date entirely.
 *
 *   A team lost every deal a member earned while on it the moment that
 *   membership ended, because the lookup filtered on end_date IS NULL.
 *
 * On the 375 deals in the 2026 Q1-Q3 report that was 63 of 388 agent rows on
 * the wrong team: 9 rows and $1,027,028 over-credited, 54 rows and $2,651,333
 * under-credited. Clutch City Realty Group was showing 60 units when it earned
 * 84. Elevé Relocation Group was showing exactly half its units, 25 of 50.
 *
 * This is the same mistake as the RC/mls_choice filter corrected on 2026-08-01,
 * which retroactively erased CRC production by filtering on the agent's current
 * entity. Current state is the wrong question for a historical report. See the
 * comment in app/api/reports/quarterly/route.ts.
 *
 * The dated logic itself is not new - lib/transactions/teamAgreement.ts has
 * resolved membership and leads by date since the team agreement exit provision
 * was implemented, and commission splits have used it all along. Reporting
 * simply never called it. What this file adds is a bulk, in-memory form of the
 * same rule: the reporting routes fetch every row in one pass and resolve
 * hundreds of deals, where per-row async resolution would be one query each.
 *
 * Nothing here touches the database, matching lib/reporting/production.ts.
 */

// Matches a plain calendar date (YYYY-MM-DD). Longer ISO timestamps are sliced
// to their date portion first. Anything else is treated as no date at all.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The Brokermint cutover date.
 *
 * Every team record carried over from Brokermint was stamped with this date
 * rather than the member's real join date - 27 of 41 membership agreements and
 * 9 of 10 lead records sit on it exactly. Tara confirmed on 2026-09-18 that
 * these are migration artifacts, and that the records should be kept as they
 * are rather than backfilled from the signed agreements.
 *
 * So a record starting exactly here is read as "since before we have records"
 * and covers earlier dates too. Without this, a deal signed before cutover and
 * closed after it finds no agreement and silently loses its team. That is not
 * hypothetical: 24631 Country Oaks Blvd was executed 2025-12-21 and closed
 * 2026-01-29, and would have dropped $65,000 and 1 unit off The Signature
 * Group purely because of how the data was imported.
 *
 * A record with any other start date is a real date and is honored strictly.
 */
const MIGRATION_CUTOVER_DATE = '2026-01-01'

function asDate(value: unknown): string | null {
  if (!value) return null
  const sliced = String(value).slice(0, 10)
  return DATE_RE.test(sliced) ? sliced : null
}

// A record covers a date when it had started by then and had not yet ended.
// Migration-stamped records are treated as having always been in effect, and so
// is a record with no start date at all: resolveGoverningTeamLeads in
// lib/transactions/teamAgreement.ts treats a null start_date as "held the role
// since before the record was kept", and the two resolvers disagreeing about
// the same row is exactly the drift this file exists to remove. No live row is
// in that state today (0 of 10 team_leads, and the column is NOT NULL on
// team_member_agreements), so this changes nothing now and stops the two from
// splitting later.
function coversDate(
  startDate: string | null,
  endDate: string | null,
  date: string
): boolean {
  const startedByThen = !startDate || startDate === MIGRATION_CUTOVER_DATE || startDate <= date
  const notYetEnded = !endDate || endDate >= date
  return startedByThen && notYetEnded
}

// A record overlaps a range when it started before the range ended and had not
// ended before the range began. Used for roster display, where the question is
// "who was on this team during the quarter" rather than "on this one day".
function overlapsRange(
  startDate: string | null,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const startedBeforeRangeEnded =
    !startDate || startDate === MIGRATION_CUTOVER_DATE || startDate <= rangeEnd
  const notEndedBeforeRangeBegan = !endDate || endDate >= rangeStart
  return startedBeforeRangeEnded && notEndedBeforeRangeBegan
}

export interface TransactionDateFields {
  acceptance_date?: string | null
  move_in_date?: string | null
  closing_date?: string | null
}

/**
 * The date that decides which team a deal belongs to.
 *
 * Purchase agreement execution for sales, tenant move-in for leases, falling
 * back to the closing date when the primary one was never entered - 79 of the
 * 388 agent rows on the 2026 report are sales with no acceptance_date, so that
 * fallback carries real weight.
 *
 * This is deliberately the same governing date the commission split uses in
 * lib/transactions/cascade.ts. Tara chose it over the closing date on
 * 2026-09-18. On live data the two answers differ for 1 agent row out of 388,
 * so this is a correctness choice rather than a numbers choice.
 *
 * The DATE matches the split. The membership LOOKUP does not, in two ways, and
 * both are deliberate.
 *
 * First, the lead fallback below. resolveGoverningTeamAgreement reads
 * team_member_agreements only and knows nothing about team_leads, and
 * cascade.ts gates every team split on that lookup finding a membership. So on
 * a lead's own deals - 11 non-cancelled deals and $718,070 of agent-row volume
 * today, all Brianna Stevenson's - reporting now says The Stevenson Group while
 * the split applies standard brokerage splits because it finds no team
 * agreement. No money moves either way: this file is read by reports only. It
 * is a labelling divergence, and it grows by one agent every time a lead is
 * added without a membership row.
 *
 * Second, the migration stamp:
 * resolveGoverningTeamAgreement compares effective_date strictly, while this
 * file treats the 2026-01-01 migration stamp as open-ended backward. On the 741
 * non-cancelled deals whose governing date predates that stamp, reporting
 * credits a team and the split path credits none. That is the point of treating
 * the stamp as a stamp rather than a start date.
 *
 * Net: reporting and the split agree on the date, not always on the team.
 */
export function governingTeamDate(
  transaction: TransactionDateFields | null | undefined,
  isLease: boolean
): string | null {
  if (!transaction) return null
  const primary = isLease
    ? asDate(transaction.move_in_date)
    : asDate(transaction.acceptance_date)
  return primary || asDate(transaction.closing_date)
}

export interface DatedMembership {
  agent_id: string
  team_id: string
  effective_date: string | null
  end_date?: string | null
}

export interface DatedTeamLead {
  team_id: string
  agent_id: string
  start_date: string | null
  end_date?: string | null
  agent?: any
}

export type MembershipResolver = (
  agentId: string | null | undefined,
  date: string | null | undefined
) => string | null

export type TeamLeadResolver = (
  teamId: string | null | undefined,
  date: string | null | undefined
) => DatedTeamLead[]

/**
 * Builds the agent -> team lookup, keyed on the deal's governing date.
 *
 * Pass every agreement row, ended ones included. Filtering them out before they
 * reach here is the bug this file exists to fix.
 *
 * ALSO pass the team_leads rows. A team lead does not get a
 * team_member_agreements row - Tara confirmed that on 2026-10-01, and the data
 * agrees: 9 of the 10 current leads do have one, but every single one of those
 * is stamped 2026-01-01, which is the Brokermint migration date, not something
 * this app wrote. Brianna Stevenson became lead of The Stevenson Group on
 * 2026-05-26, after the migration, and has no membership row at all. Without
 * the lead fallback her 7 production rows and $1,649,770 of 2026 volume are
 * credited to no team, and every lead added from now on lands the same way. The
 * nine that work today work by accident.
 *
 * Membership is tried first, so the nine migration-stamped leads resolve
 * exactly as they did before and only the leads with no membership row change.
 *
 * When more than one agreement covers the same date the latest effective_date
 * wins, matching resolveGoverningTeamAgreement. No agent currently holds
 * overlapping memberships, so this is a tiebreak that does not fire today.
 *
 * With no usable date, falls back to the agent's open agreement, or to the team
 * they currently lead, preserving the old behavior for deals that have no dates
 * entered at all.
 */
export function buildMembershipResolver(
  rows: DatedMembership[] | null | undefined,
  leadRows?: DatedTeamLead[] | null
): MembershipResolver {
  const byAgent = new Map<string, DatedMembership[]>()

  for (const row of rows || []) {
    if (!row?.agent_id || !row?.team_id) continue
    const existing = byAgent.get(row.agent_id)
    if (existing) existing.push(row)
    else byAgent.set(row.agent_id, [row])
  }

  for (const list of byAgent.values()) {
    list.sort((a, b) =>
      String(b.effective_date || '').localeCompare(String(a.effective_date || ''))
    )
  }

  // Leadership as a second way of belonging to a team, read the same way.
  const leadsByAgent = new Map<string, DatedTeamLead[]>()
  for (const row of leadRows || []) {
    if (!row?.agent_id || !row?.team_id) continue
    const existing = leadsByAgent.get(row.agent_id)
    if (existing) existing.push(row)
    else leadsByAgent.set(row.agent_id, [row])
  }
  for (const list of leadsByAgent.values()) {
    list.sort((a, b) =>
      String(b.start_date || '').localeCompare(String(a.start_date || ''))
    )
  }

  return (agentId, date) => {
    if (!agentId) return null
    const list = byAgent.get(agentId) || []
    const leadList = leadsByAgent.get(agentId) || []
    if (list.length === 0 && leadList.length === 0) return null

    const safeDate = asDate(date)
    if (!safeDate) {
      const open = list.find(row => !asDate(row.end_date))
      if (open) return open.team_id
      const openLead = leadList.find(row => !asDate(row.end_date))
      return openLead ? openLead.team_id : null
    }

    const governing = list.find(row =>
      coversDate(asDate(row.effective_date), asDate(row.end_date), safeDate)
    )
    if (governing) return governing.team_id

    // No membership covers this date. If they were leading a team on it, the
    // deal belongs to that team - and if they were not leading it yet, it does
    // not. Brianna's Wolf Pass (2026-02-24) and Woodrose Orchard (2026-05-14)
    // closed before she became lead on 2026-05-26, so they stay teamless,
    // which is the dated rule the rest of this file follows.
    const governingLead = leadList.find(row =>
      coversDate(asDate(row.start_date), asDate(row.end_date), safeDate)
    )
    return governingLead ? governingLead.team_id : null
  }
}

/**
 * Builds the team -> leads lookup, keyed on the deal's governing date.
 *
 * Leadership changes hands, so "who leads this team now" puts the current
 * lead's name on a deal that closed under someone else. Mirrors
 * resolveGoverningTeamLeads. Pass every lead row, ended ones included.
 *
 * All leads are returned, not just one - Elevated Realty Group, Nexa Real
 * Estate Group and The Signature Group each have two co-leads.
 */
export function buildTeamLeadResolver(
  rows: DatedTeamLead[] | null | undefined
): TeamLeadResolver {
  const byTeam = new Map<string, DatedTeamLead[]>()

  for (const row of rows || []) {
    if (!row?.team_id || !row?.agent_id) continue
    const existing = byTeam.get(row.team_id)
    if (existing) existing.push(row)
    else byTeam.set(row.team_id, [row])
  }

  for (const list of byTeam.values()) {
    list.sort((a, b) =>
      String(a.start_date || '').localeCompare(String(b.start_date || ''))
    )
  }

  return (teamId, date) => {
    if (!teamId) return []
    const list = byTeam.get(teamId)
    if (!list || list.length === 0) return []

    const safeDate = asDate(date)
    if (!safeDate) return list.filter(row => !asDate(row.end_date))

    return list.filter(row =>
      coversDate(asDate(row.start_date), asDate(row.end_date), safeDate)
    )
  }
}

/**
 * The agents who were on a team at any point during a date range.
 *
 * Roster display, not production. A member who left in September still belongs
 * in the Q1 roster of the team whose Q1 deals they earned - showing the team's
 * corrected unit count beside a roster that omits the person who earned those
 * units is how a presentation invites a question nobody can answer.
 *
 * Leads count as being on the team for the dates they led it, because they have
 * no membership row of their own. Without this a lead is absent from their own
 * team's roster slide while their production sits in the team's total.
 */
export function membersDuringRange(
  rows: DatedMembership[] | null | undefined,
  teamId: string,
  rangeStart: string,
  rangeEnd: string,
  leadRows?: DatedTeamLead[] | null
): string[] {
  const agentIds: string[] = []
  for (const row of rows || []) {
    if (!row?.agent_id || row.team_id !== teamId) continue
    if (
      overlapsRange(
        asDate(row.effective_date),
        asDate(row.end_date),
        rangeStart,
        rangeEnd
      )
    ) {
      if (!agentIds.includes(row.agent_id)) agentIds.push(row.agent_id)
    }
  }
  for (const row of leadRows || []) {
    if (!row?.agent_id || row.team_id !== teamId) continue
    if (
      overlapsRange(asDate(row.start_date), asDate(row.end_date), rangeStart, rangeEnd)
    ) {
      if (!agentIds.includes(row.agent_id)) agentIds.push(row.agent_id)
    }
  }
  return agentIds
}
