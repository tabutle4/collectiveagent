import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session instanceof NextResponse) return session

    const [txnRes, agentRes, typesRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select(
          'id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net, office_location'
        )
        .range(0, 9999),
      supabaseAdmin.from('transaction_internal_agents').select('transaction_id, agent_id, agent_role, agent_net, sales_volume').range(0, 9999),
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
    const enrichedAgentRows = (agentRes.data || []).map((row: any) => ({
      ...row,
      team_name: agentTeamMap[row.agent_id] || null,
    }))

    return NextResponse.json({
      transactions: txnRes.data || [],
      agentRows: enrichedAgentRows,
      processingFeeTypes: typesRes.data || [],
    })
  } catch (err: any) {
    console.error('Dashboard transactions API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}