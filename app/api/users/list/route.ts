import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // Require can_view_all_agents permission to list all users
  const auth = await requirePermission(request, 'can_view_all_agents')
  if (auth.error) return auth.error

  try {
    // Fetch all users
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (usersError) throw usersError

    // Fetch current team memberships (where end_date is null)
    const { data: teamMemberships, error: teamError } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        agent_id,
        teams!inner (
          team_name
        )
      `)
      .is('end_date', null)

    if (teamError) throw teamError

    // Create a map of agent_id -> team_name
    const teamMap: Record<string, string> = {}
    for (const membership of teamMemberships || []) {
      const teamName = (membership.teams as any)?.team_name
      if (teamName && membership.agent_id) {
        // If agent is on multiple teams, join with comma
        if (teamMap[membership.agent_id]) {
          teamMap[membership.agent_id] += `, ${teamName}`
        } else {
          teamMap[membership.agent_id] = teamName
        }
      }
    }

    // Strip sensitive fields and add team_name
    const usersWithTeams = (users || []).map(
      ({ password_hash, reset_token, reset_token_expires, ...user }: any) => ({
        ...user,
        team_name: teamMap[user.id] || null,
      })
    )

    return NextResponse.json({ users: usersWithTeams })
  } catch (err: any) {
    console.error('Users list API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}