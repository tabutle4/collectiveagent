import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { needsAttentionCounts } from '@/lib/dashboard/needsAttention'

export async function GET(request: NextRequest) {
  try {
    // Company-wide numbers: admin dashboard only. requireAuth here would let
    // any logged-in agent pull every transaction row by calling the URL.
    const auth = await requirePermission(request, 'can_view_all_transactions')
    if (auth.error) return auth.error

    const [transactions, agentRows, typesRes, teamsRes] = await Promise.all([
      fetchAllRows(
        'transactions',
        'id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net, office_location, compliance_status, cda_status'
      ),
      fetchAllRows(
        'transaction_internal_agents',
        'transaction_id, agent_id, agent_role, agent_net, sales_volume, payment_status'
      ),
      supabaseAdmin.from('processing_fee_types').select('name, is_lease').eq('is_active', true),
      supabaseAdmin
        .from('team_member_agreements')
        .select('agent_id, team:teams(team_name)')
        .is('end_date', null),
    ])

    // Build agent_id -> team_name lookup
    const agentTeamMap: Record<string, string> = {}
    if (teamsRes.data) {
      teamsRes.data.forEach((row: any) => {
        if (row.agent_id && row.team?.team_name) {
          agentTeamMap[row.agent_id] = row.team.team_name
        }
      })
    }

    // Enrich agent rows with team names
    const enrichedAgentRows = agentRows.map((row: any) => ({
      ...row,
      team_name: agentTeamMap[row.agent_id] || null,
    }))

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
      processingFeeTypes: typesRes.data || [],
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