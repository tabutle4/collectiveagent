import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Fetch all active agents
    const { data: agents, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
      .contains('roles', ['agent'])
      .eq('is_active', true)
      .order('preferred_first_name', { ascending: true })
    
    if (error) {
      throw error
    }
    
    // Format agents for dropdown
    const formattedAgents = (agents || []).map(agent => ({
      id: agent.id,
      name: agent.preferred_first_name && agent.preferred_last_name
        ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
        : `${agent.first_name} ${agent.last_name}`,
      displayName: agent.preferred_first_name && agent.preferred_last_name
        ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
        : `${agent.first_name} ${agent.last_name}`,
    }))
    
    return NextResponse.json({
      success: true,
      agents: formattedAgents,
    })
    
  } catch (error: any) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch agents' },
      { status: 500 }
    )
  }
}

