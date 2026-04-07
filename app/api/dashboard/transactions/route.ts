import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

// Fetch all rows in batches to bypass 1000 row limit
async function fetchAllRows(
  table: string,
  selectFields: string,
  filters?: { column: string; operator: string; value: any }[]
) {
  const BATCH_SIZE = 1000
  let allData: any[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = supabaseAdmin
      .from(table)
      .select(selectFields)
      .range(offset, offset + BATCH_SIZE - 1)

    if (filters) {
      for (const f of filters) {
        if (f.operator === 'is') {
          query = query.is(f.column, f.value)
        } else if (f.operator === 'eq') {
          query = query.eq(f.column, f.value)
        }
      }
    }

    const { data, error } = await query

    if (error) throw error

    if (data && data.length > 0) {
      allData = allData.concat(data)
      offset += BATCH_SIZE
      hasMore = data.length === BATCH_SIZE
    } else {
      hasMore = false
    }
  }

  return allData
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session instanceof NextResponse) return session

    const [transactions, agentRows, typesRes, teamsRes] = await Promise.all([
      fetchAllRows(
        'transactions',
        'id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net, office_location'
      ),
      fetchAllRows(
        'transaction_internal_agents',
        'transaction_id, agent_id, agent_role, agent_net, sales_volume'
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

    return NextResponse.json({
      transactions,
      agentRows: enrichedAgentRows,
      processingFeeTypes: typesRes.data || [],
    })
  } catch (err: any) {
    console.error('Dashboard transactions API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}