import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { user_id, active_goals, sales_volume_goal, units_goal, agent_net_goal } = body

    // Verify user can update this profile (themselves or admin)
    if (user_id !== auth.user.id && !auth.permissions.has('can_manage_agents')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const updates: Record<string, any> = {}
    
    if (active_goals !== undefined) {
      updates.active_goals = active_goals
    }
    if (sales_volume_goal !== undefined) {
      updates.sales_volume_goal = sales_volume_goal
    }
    if (units_goal !== undefined) {
      updates.units_goal = units_goal
    }
    if (agent_net_goal !== undefined) {
      updates.agent_net_goal = agent_net_goal
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating goals:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}