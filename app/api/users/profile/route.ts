import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth, canAccessAgent, canManageAgent } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  // If no id provided, use the current session user
  const id = searchParams.get('id') || auth.user.id

  // Check if user can access this profile
  if (!canAccessAgent(auth, id)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
        const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Fetch team membership from new tables
    const { data: teamMembership } = await supabaseAdmin
      .from('team_member_agreements')
      .select('team_id')
      .eq('agent_id', id)
      .is('end_date', null)
      .maybeSingle()

    let teamName = null
    let isTeamLead = false
    let teamMembers: any[] = []

    if (teamMembership) {
      // Get team name
            const { data: team } = await supabaseAdmin
        .from('teams')
        .select('team_name')
        .eq('id', teamMembership.team_id)
        .single()
      
      if (team) {
        teamName = team.team_name
      }

      // Check if user is a team lead
      const { data: leadRecord } = await supabaseAdmin
        .from('team_leads')
        .select('id')
        .eq('agent_id', id)
        .eq('team_id', teamMembership.team_id)
        .is('end_date', null)
        .maybeSingle()
      
      isTeamLead = !!leadRecord

      // If user is a team lead, fetch all team members
      if (isTeamLead) {
        const { data: members } = await supabaseAdmin
          .from('team_member_agreements')
          .select('agent_id')
          .eq('team_id', teamMembership.team_id)
          .is('end_date', null)

        if (members && members.length > 0) {
          const memberIds = members.map(m => m.agent_id)
          const { data: memberUsers } = await supabaseAdmin
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name, headshot_url, email')
            .in('id', memberIds)
            .eq('is_active', true)
            .order('first_name')

          teamMembers = memberUsers || []
        }
      }
    }

    // Strip sensitive fields
    const { password_hash, reset_token, reset_token_expires, ...safeData } = data

    // Agents this user referred
    const { data: referredAgents } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
      .eq('referring_agent_id', id)
      .eq('is_active', true)
      .order('first_name', { ascending: true })

    return NextResponse.json({ 
      user: { 
        ...safeData, 
        team_name: teamName,
        is_team_lead: isTeamLead,
        team_members: teamMembers,
        referred_agents: referredAgents || [],
      } 
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { id, updates } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Check if user can manage this profile
    if (!canManageAgent(auth, id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // If user is updating their own profile, restrict what they can update
    if (id === auth.user.id && !auth.permissions.has('can_manage_agents')) {
      // Only allow these fields for self-update
      const allowedSelfUpdateFields = [
        'preferred_first_name',
        'preferred_last_name',
        'phone',
        'business_phone',
        'instagram_handle',
        'tiktok_handle',
        'threads_handle',
        'facebook_url',
        'linkedin_url',
        'twitter_url',
        'youtube_url',
        'tiktok_url',
        'website_url',
        'bio',
        'headshot_url',
        'headshot_crop',
        'shipping_address_line1',
        'shipping_address_line2',
        'shipping_city',
        'shipping_state',
        'shipping_zip',
        'birth_month',
        'shirt_type',
        'shirt_size',
      ]
      const filteredUpdates: Record<string, any> = {}
      for (const key of Object.keys(updates)) {
        if (allowedSelfUpdateFields.includes(key)) {
          filteredUpdates[key] = updates[key]
        }
      }
      const { error } = await supabaseAdmin.from('users').update(filteredUpdates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      // Admin can update anything
      const { error } = await supabaseAdmin.from('users').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}