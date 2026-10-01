import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { needsAttentionCounts } from '@/lib/dashboard/needsAttention'
import { fetchComplianceRequestTxnIds } from '@/lib/reporting/complianceRequests'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import {
  buildMembershipResolver,
  governingTeamDate,
} from '@/lib/reporting/teamAttribution'

export async function GET(request: NextRequest) {
  try {
    // Company-wide numbers: admin dashboard only. requireAuth here would let
    // any logged-in agent pull every transaction row by calling the URL.
    const auth = await requirePermission(request, 'can_view_all_transactions')
    if (auth.error) return auth.error

    const [transactions, agentRows, teamMembers, teamLeadRows, teamRows, complianceRequestIds] = await Promise.all([
      fetchAllRows(
        'transactions',
        'id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, acceptance_date, office_net, office_location, compliance_status, cda_status'
      ),
      fetchAllRows(
        'transaction_internal_agents',
        'transaction_id, agent_id, agent_role, agent_net, sales_volume, payment_status'
      ),
      // EVERY membership, ended ones included, with the dates that decide which
      // deal belongs to which team. The old query filtered to end_date IS NULL
      // and applied one answer to every deal regardless of when it happened,
      // so these charts disagreed with reality the same way the quarterly
      // report did. See lib/reporting/teamAttribution.ts.
      fetchAllRows(
        'team_member_agreements',
        'agent_id, team_id, effective_date, end_date, team:teams(team_name)'
      ),
      // Leading a team is the second way of belonging to one: a lead has no
      // team_member_agreements row of their own, so without these rows their
      // deals are credited to no team on these charts.
      fetchAllRows<{ team_id: string; agent_id: string; start_date: string | null; end_date: string | null }>(
        'team_leads',
        'team_id, agent_id, start_date, end_date'
      ),
      // Team names, so a team whose only producer in a period is its lead still
      // has a label. The map used to be built from the membership rows alone,
      // which cannot name a team that has no members.
      fetchAllRows('teams', 'id, team_name'),
      // Which deals have a compliance request behind them. The charts need it
      // to qualify leases, and it is loaded here rather than in the component
      // so the client never has to read the submissions table.
      fetchComplianceRequestTxnIds(),
    ])

    // team_id -> display name, so the charts keep grouping by name as before
    const teamNameById: Record<string, string> = {}
    teamRows.forEach((row: any) => {
      if (row?.id && row?.team_name) teamNameById[row.id] = row.team_name
    })
    teamMembers.forEach((row: any) => {
      const team = Array.isArray(row.team) ? row.team[0] : row.team
      if (row.team_id && team?.team_name && !teamNameById[row.team_id]) {
        teamNameById[row.team_id] = team.team_name
      }
    })

    const resolveTeamForAgent = buildMembershipResolver(teamMembers, teamLeadRows)

    // The governing date per transaction, computed once. Execution date for
    // sales, move-in for leases, falling back to closing - the same date the
    // commission split uses, and the same the quarterly report uses.
    const governingDateByTxn = new Map<string, string | null>()
    transactions.forEach((txn: any) => {
      governingDateByTxn.set(
        txn.id,
        governingTeamDate(txn, isLeaseTransactionType(txn.transaction_type))
      )
    })

    // Enrich agent rows with the team that governed THAT deal
    const enrichedAgentRows = agentRows.map((row: any) => {
      const teamId = resolveTeamForAgent(
        row.agent_id,
        governingDateByTxn.get(row.transaction_id)
      )
      return {
        ...row,
        team_name: teamId ? teamNameById[teamId] || null : null,
      }
    })

    // Needs Attention counts come from the SHARED definition in
    // lib/dashboard/needsAttention.ts, which the owner dashboard also calls.
    // These four numbers used to be computed here and again, differently, in
    // the owner route - so the two views disagreed about the same figures.
    // Three real bugs went with that: this route counted
    // cda_status='pending_approval' (a value the database has never held, so
    // Broker Approval Pending read zero forever), it read the stored
    // compliance_status for CDA-needed rather than derived compliance, and it
    // treated a hand-marked-sent CDA as still needing one.
    const needsAttention = await needsAttentionCounts()

    return NextResponse.json({
      transactions,
      agentRows: enrichedAgentRows,
      complianceRequestTxnIds: Array.from(complianceRequestIds),
      needsAttention: {
        complianceRequested: needsAttention.complianceRequested,
        cdaNeeded: needsAttention.cdaNeeded,
        brokerApprovalPending: needsAttention.brokerApprovalPending,
        eligibleForPayout: needsAttention.eligibleForPayout,
      },
    })
  } catch (err: any) {
    console.error('Dashboard transactions API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}