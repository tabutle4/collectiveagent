import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // Coordination is admin-only
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'active'

    // Build filters based on active/inactive/all
    const filters: Array<{ type: 'eq' | 'neq' | 'is' | 'not' | 'in' | 'gte' | 'lte'; column: string; value: any }> = []
    if (filter === 'active') {
      filters.push({ type: 'eq', column: 'is_active', value: true })
    } else if (filter === 'inactive') {
      filters.push({ type: 'eq', column: 'is_active', value: false })
    }

    const data = await fetchAllRows(
      'listing_coordination',
      `*, listing:transactions(*)`,
      {
        filters,
        orderBy: { column: 'created_at', ascending: false },
      },
      supabase
    )

    // Batch fetch agents and listings
    const agentIds = [...new Set(data.map((c: any) => c.agent_id).filter(Boolean))]
    const listingIds = [...new Set(data.map((c: any) => c.listing_id).filter(Boolean))]

    const [agentsRes, listingsRes, transactionsRes] = await Promise.all([
      agentIds.length > 0
        ? supabase
            .from('users')
            .select('id, preferred_first_name, preferred_last_name, first_name, last_name')
            .in('id', agentIds)
        : { data: [] },
      listingIds.length > 0
        ? supabase
            .from('listings')
            .select('id, transaction_type, property_address')
            .in('id', listingIds)
        : { data: [] },
      listingIds.length > 0
        ? supabase
            .from('transactions')
            .select('id, transaction_type, property_address')
            .in('id', listingIds)
        : { data: [] },
    ])

    const agentMap = Object.fromEntries((agentsRes.data || []).map((a: any) => [a.id, a]))
    const listingMap = {
      ...Object.fromEntries((transactionsRes.data || []).map((t: any) => [t.id, t])),
      ...Object.fromEntries((listingsRes.data || []).map((l: any) => [l.id, l])),
    }

    const coordinationsWithAgents = data.map((coord: any) => {
      const agent = agentMap[coord.agent_id]
      if (agent) {
        coord.agent_name =
          agent.preferred_first_name && agent.preferred_last_name
            ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
            : `${agent.first_name} ${agent.last_name}`
      }
      const listing = listingMap[coord.listing_id]
      if (listing) {
        coord.transaction_type = listing.transaction_type
        if (!coord.listing) coord.listing = listing
      }
      return coord
    })

    return NextResponse.json({
      success: true,
      coordinations: coordinationsWithAgents,
    })
  } catch (error: any) {
    console.error('Error in coordination list:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch coordinations' },
      { status: 500 }
    )
  }
}
