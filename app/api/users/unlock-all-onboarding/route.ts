import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(request: NextRequest) {
  try {
    // Verify admin access (check for admin role in request headers or body)
    // For now, we'll allow this endpoint to be called - you may want to add auth checks

    // Update all users with 'agent' role to unlock onboarding
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, roles')
      .not('roles', 'is', null)

    if (fetchError) {
      console.error('Error fetching users:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch users', details: fetchError.message },
        { status: 500 }
      )
    }

    // Filter for agents (simple string, not array)
    const agents = (users || []).filter((user: any) => user.role === 'Agent')

    if (agents.length === 0) {
      return NextResponse.json({ message: 'No agents found', unlocked: 0 }, { status: 200 })
    }

    // Update all agents
    const agentIds = agents.map((agent: any) => agent.id)
    const { data: updatedData, error: updateError } = await supabase
      .from('users')
      .update({ onboarding_unlocked: true })
      .in('id', agentIds)

    if (updateError) {
      console.error('Error unlocking users:', updateError)
      return NextResponse.json(
        { error: 'Failed to unlock users', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: `Successfully unlocked onboarding for ${agents.length} agent(s)`,
      unlocked: agents.length,
    })
  } catch (error: any) {
    console.error('Error in unlock-all-onboarding:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
