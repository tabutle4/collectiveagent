import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'active'
    
    let query = supabase
      .from('listing_coordination')
      .select(`
        *,
        listing:transactions(*)
      `)
      .order('created_at', { ascending: false })
    
    if (filter === 'active') {
      query = query.eq('is_active', true)
    } else if (filter === 'inactive') {
      query = query.eq('is_active', false)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching coordinations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch coordinations' },
        { status: 500 }
      )
    }
    
    // Batch fetch agents and listings
    const agentIds = [...new Set(data.map((c: any) => c.agent_id).filter(Boolean))]
    const listingIds = [...new Set(data.map((c: any) => c.listing_id).filter(Boolean))]

    const [agentsRes, listingsRes] = await Promise.all([
      agentIds.length > 0
        ? supabase.from('users').select('id, preferred_first_name, preferred_last_name, first_name, last_name').in('id', agentIds)
        : { data: [] },
      listingIds.length > 0
        ? supabase.from('listings').select('id, transaction_type, property_address').in('id', listingIds)
        : { data: [] },
    ])

    const agentMap = Object.fromEntries((agentsRes.data || []).map((a: any) => [a.id, a]))
    const listingMap = Object.fromEntries((listingsRes.data || []).map((l: any) => [l.id, l]))

    const coordinationsWithAgents = data.map((coord: any) => {
      const agent = agentMap[coord.agent_id]
      if (agent) {
        coord.agent_name = agent.preferred_first_name && agent.preferred_last_name
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

