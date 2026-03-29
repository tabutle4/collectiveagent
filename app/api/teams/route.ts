import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth, requirePermission } from '@/lib/api-auth'

// GET - List all teams
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'

    // Get all teams
    let teamsQuery = supabaseAdmin
      .from('teams')
      .select('*')
      .order('team_name')

    if (status !== 'all') {
      teamsQuery = teamsQuery.eq('status', status)
    }

    const { data: teams, error: teamsError } = await teamsQuery

    if (teamsError) throw teamsError

    // For each team, get leads and member count
    const teamsWithDetails = await Promise.all(
      (teams || []).map(async team => {
        // Get team leads
        const { data: leads } = await supabaseAdmin
          .from('team_leads')
          .select(`
            id,
            agent_id,
            start_date,
            end_date,
            agent:users!team_leads_agent_id_fkey(
              id,
              preferred_first_name,
              preferred_last_name,
              first_name,
              last_name
            )
          `)
          .eq('team_id', team.id)
          .is('end_date', null)

        // Get member count
        const { count: activeMembers } = await supabaseAdmin
          .from('team_member_agreements')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .is('end_date', null)

        const { count: totalMembers } = await supabaseAdmin
          .from('team_member_agreements')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)

        return {
          ...team,
          leads: leads || [],
          active_member_count: activeMembers || 0,
          total_member_count: totalMembers || 0,
        }
      })
    )

    return NextResponse.json({ teams: teamsWithDetails })
  } catch (error: any) {
    console.error('Error fetching teams:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch teams' },
      { status: 500 }
    )
  }
}

// POST - Create new team
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { team_name, status = 'active', lead_ids = [] } = body

    if (!team_name?.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }

    // Create team
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({ team_name: team_name.trim(), status })
      .select()
      .single()

    if (teamError) throw teamError

    // Add team leads if provided
    if (lead_ids.length > 0) {
      const leadInserts = lead_ids.map((agentId: string) => ({
        team_id: team.id,
        agent_id: agentId,
        start_date: new Date().toISOString().split('T')[0],
      }))

      const { error: leadsError } = await supabaseAdmin
        .from('team_leads')
        .insert(leadInserts)

      if (leadsError) throw leadsError
    }

    return NextResponse.json({ team, success: true })
  } catch (error: any) {
    console.error('Error creating team:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create team' },
      { status: 500 }
    )
  }
}
