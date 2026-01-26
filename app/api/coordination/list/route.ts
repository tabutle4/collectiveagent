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
    
    const coordinationsWithAgents = await Promise.all(
      data.map(async (coord: any) => {
        if (coord.agent_id) {
          const { data: agentData } = await supabase
            .from('users')
            .select('preferred_first_name, preferred_last_name, first_name, last_name')
            .eq('id', coord.agent_id)
            .single()
          
          if (agentData) {
            coord.agent_name = agentData.preferred_first_name && agentData.preferred_last_name
              ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
              : `${agentData.first_name} ${agentData.last_name}`
          }
        }
        return coord
      })
    )
    
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

