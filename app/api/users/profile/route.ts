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

    // Policy acknowledgment doc URL from onboarding session
    const { data: onboardingSession } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('policy_ack_document_url')
      .eq('user_id', id)
      .maybeSingle()

    // Compute YTD sales volume and units - two queries because sales use closing_date
    // and leases use move_in_date
    const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]
    const PRODUCTION_ROLES = ['primary_agent', 'listing_agent', 'co_agent']

    // Query 1: Sales - status must be closed, date by closing_date
    const { data: salesData } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('sales_volume, units, transaction_id, transactions!inner(status, closing_date, transaction_type)')
      .eq('agent_id', id)
      .in('agent_role', PRODUCTION_ROLES)
      .eq('transactions.status', 'closed')
      .gte('transactions.closing_date', ytdStart)
      .lte('transactions.closing_date', today)

    // Filter out lease types from sales query (leases may also have closing_date)
    const salesRows = (salesData || []).filter((r: any) => {
      const t = (r.transactions?.transaction_type || '').toLowerCase()
      return !t.includes('tenant') && !t.includes('landlord') && !t.includes('lease')
    })

    // Query 2a: Leases with move_in_date in YTD range
    const { data: leaseMoveInData } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('sales_volume, transaction_id, transactions!inner(move_in_date, closing_date, transaction_type)')
      .eq('agent_id', id)
      .in('agent_role', PRODUCTION_ROLES)
      .gte('transactions.move_in_date', ytdStart)
      .lte('transactions.move_in_date', today)

    // Query 2b: Leases with no move_in_date - fall back to closing_date
    const { data: leaseClosingData } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('sales_volume, transaction_id, transactions!inner(move_in_date, closing_date, transaction_type)')
      .eq('agent_id', id)
      .in('agent_role', PRODUCTION_ROLES)
      .is('transactions.move_in_date', null)
      .gte('transactions.closing_date', ytdStart)
      .lte('transactions.closing_date', today)

    // Combine lease rows, deduplicate by transaction_id, filter to lease types only
    const seenLeaseIds = new Set<string>()
    const leaseRows = [...(leaseMoveInData || []), ...(leaseClosingData || [])].filter((r: any) => {
      if (seenLeaseIds.has(r.transaction_id)) return false
      seenLeaseIds.add(r.transaction_id)
      const t = (r.transactions?.transaction_type || '').toLowerCase()
      return t.includes('tenant') || t.includes('landlord') || t.includes('lease')
    })

    const allProductionRows = [...salesRows, ...leaseRows]
    const total_sales_volume = allProductionRows.reduce((sum, r) => sum + (r.sales_volume || 0), 0)
    // Count TIA rows - each qualifying row = 1 unit (buyer, seller, tenant, landlord each count)
    const total_units_closed = allProductionRows.length

    // Cap progress: YTD sales only (leases never count toward cap)
    // Uses counts_toward_progress flag which is false for lease transaction types
    const { data: capData } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('brokerage_split, transaction_id, transactions!inner(status, closing_date)')
      .eq('agent_id', id)
      .in('agent_role', ['primary_agent', 'listing_agent', 'co_agent'])
      .eq('counts_toward_progress', true)
      .eq('transactions.status', 'closed')
      .gte('transactions.closing_date', ytdStart)
      .lte('transactions.closing_date', today)

    const cap_progress = Math.round(
      (capData || []).reduce((sum, r) => sum + parseFloat(r.brokerage_split || 0), 0)
    )

    return NextResponse.json({ 
      user: { 
        ...safeData, 
        team_name: teamName,
        is_team_lead: isTeamLead,
        team_members: teamMembers,
        referred_agents: referredAgents || [],
        policy_ack_document_url: onboardingSession?.policy_ack_document_url ?? null,
        total_sales_volume,
        total_units_closed,
        cap_progress,
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