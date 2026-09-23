import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth, canAccessAgent, canManageAgent } from '@/lib/api-auth'
import { sanitizeDashboardLinks } from '@/lib/dashboard/links'

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
    // limit(1) rather than maybeSingle(): maybeSingle tolerates zero rows but
    // errors on two, and an agent holding live agreements with two teams would
    // come back as data null with the error discarded -- indistinguishable
    // from having no team at all. Newest agreement wins.
    const { data: membershipRows, error: membershipErr } = await supabaseAdmin
      .from('team_member_agreements')
      .select('team_id')
      .eq('agent_id', id)
      .is('end_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
    if (membershipErr) console.error('team_member_agreements lookup failed:', membershipErr)
    const teamMembership = membershipRows?.[0] || null

    let teamName = null
    let isTeamLead = false
    let teamMembers: any[] = []

    // Team leads are looked up independently of membership. A lead does not
    // necessarily hold a row in team_member_agreements -- she leads the team,
    // she is not a member of it -- and this whole block used to be gated on
    // that row existing, with the team_leads check nested inside it. So a
    // lead came back with teamName null and isTeamLead false, which the
    // compliance form reads as "not on a team": the Team option for the Just
    // Sold flyer was disabled and she could not pick her own team.
    //
    // Same limit(1) reasoning as the membership query above, and it matters
    // more here: dropping the old .eq('team_id', ...) filter is exactly what
    // makes this fix work, and it is also what makes two rows reachable.
    // Nothing prevents one person leading two teams -- app/api/teams/route.ts
    // inserts lead rows per team with no cross-team check -- so on maybeSingle
    // a two-team lead would land back in the state this change exists to fix,
    // silently. Newest leadership wins.
    const { data: leadRows, error: leadErr } = await supabaseAdmin
      .from('team_leads')
      .select('id, team_id')
      .eq('agent_id', id)
      .is('end_date', null)
      .order('start_date', { ascending: false })
      .limit(1)
    if (leadErr) console.error('team_leads lookup failed:', leadErr)
    const leadRecord = leadRows?.[0] || null

    isTeamLead = !!leadRecord
    const teamId = teamMembership?.team_id || leadRecord?.team_id || null

    if (teamId) {
      // Get team name
            const { data: team } = await supabaseAdmin
        .from('teams')
        .select('team_name')
        .eq('id', teamId)
        .single()

      if (team) {
        teamName = team.team_name
      }

      // If user is a team lead, fetch all team members
      if (isTeamLead) {
        const { data: members } = await supabaseAdmin
          .from('team_member_agreements')
          .select('agent_id')
          .eq('team_id', teamId)
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

/**
 * A standing rate is a nullable numeric column, so a cleared field has to
 * arrive as null rather than '' - Postgres rejects an empty string for numeric
 * and the whole save would fail with a type error the form could not explain.
 * A negative rate is treated as cleared rather than stored.
 */
const STANDING_RATE_FIELDS = [
  'onboarding_fee_override',
  'monthly_fee_override',
  'rc_annual_fee_override',
]

function standingRate(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
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
        // Courtney edits her own broker-dashboard links, so this has to be
        // self-updatable. Sanitized below - never stored as sent.
        'dashboard_links',
      ]
      const filteredUpdates: Record<string, any> = {}
      for (const key of Object.keys(updates)) {
        if (allowedSelfUpdateFields.includes(key)) {
          filteredUpdates[key] =
            key === 'dashboard_links'
              ? sanitizeDashboardLinks(updates[key])
              : STANDING_RATE_FIELDS.includes(key)
                ? standingRate(updates[key])
                : updates[key]
        }
      }
      const { error } = await supabaseAdmin.from('users').update(filteredUpdates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      // Admin branch. It used to be `.update(updates)` straight from the
      // request body, so anyone who passed canManageAgent could write any
      // column on users - password_hash, ms_refresh_token, the Payload
      // pointers, the monthly-fee and cap counters. Client-side gating on the
      // admin screens is not a server-side restriction, and this is the same
      // pattern that was removed from the onboarding route's `update_user`
      // action for exactly this reason.
      //
      // The list is the union of every field the two admin PATCH callers
      // actually send - components/profile/ProfileScreen.tsx (personal, real
      // estate, license, billing) and components/admin/AdminUserProfileModal
      // .tsx (create-then-update, and edit) - plus the three self-updatable
      // columns above that those screens do not send (phone, headshot_url,
      // headshot_crop), so an admin is never able to do less to their own
      // record than an agent can. Every name below is a real column on
      // public.users, verified against information_schema.
      //
      // Adding a field to an admin screen means adding it here too, or the
      // save will silently drop it.
      const allowedAdminUpdateFields = [
        // Identity and contact
        'first_name',
        'last_name',
        'preferred_first_name',
        'preferred_last_name',
        'email',
        'office_email',
        'personal_email',
        'personal_phone',
        'business_phone',
        'phone',
        'job_title',
        // Personal details and shipping
        'birth_month',
        'date_of_birth',
        'shirt_type',
        'shirt_size',
        'shipping_address_line1',
        'shipping_address_line2',
        'shipping_city',
        'shipping_state',
        'shipping_zip',
        // Social
        'instagram_handle',
        'tiktok_handle',
        'threads_handle',
        'youtube_url',
        'linkedin_url',
        'facebook_url',
        // Headshot
        'headshot_url',
        'headshot_crop',
        // Roster and role
        'office',
        'status',
        'is_active',
        'is_licensed_agent',
        'division',
        'join_date',
        'role',
        'roles',
        'full_nav_access',
        'referring_agent',
        'referring_agent_id',
        // License and association
        'license_number',
        'license_expiration',
        'mls_id',
        'nrds_id',
        'association',
        'association_status_on_join',
        // Commission plan
        'commission_plan',
        'commission_plan_other',
        'lease_commission_plan',
        'cap_amount_override',
        'post_cap_split_override',
        'qualifying_transaction_target',
        'special_commission_notes',
        'revenue_share',
        // Billing and compliance flags
        'monthly_fee_waived',
        // Standing rates. Null means the agent pays the standard fee; a number
        // replaces it and suppresses any promo (see lib/fees.ts).
        'onboarding_fee_override',
        'monthly_fee_override',
        'rc_annual_fee_override',
        'waive_buyer_processing_fees',
        'waive_seller_processing_fees',
        'half_buyer_processing_fees',
        'half_seller_processing_fees',
        'waive_coaching_fee',
        'accepted_trec',
        'w9_completed',
        'independent_contractor_agreement_signed',
        'onboarding_fee_paid',
        'onboarding_fee_paid_date',
        'admin_notes',
        // Broker-dashboard custom links. Sanitized below, never stored raw.
        'dashboard_links',
      ]
      const submittedKeys = Object.keys(updates || {})
      const filteredUpdates: Record<string, any> = {}
      const rejectedKeys: string[] = []
      for (const key of submittedKeys) {
        if (allowedAdminUpdateFields.includes(key)) {
          // dashboard_links lands in an href, so it is validated here and not
          // only in the form. http/https absolute URLs only - a javascript:
          // or data: URL stored here would run in the viewer's browser.
          filteredUpdates[key] =
            key === 'dashboard_links'
              ? sanitizeDashboardLinks(updates[key])
              : updates[key]
        } else {
          rejectedKeys.push(key)
        }
      }
      if (rejectedKeys.length > 0) {
        console.warn(
          'PATCH /api/users/profile: dropped fields not on the admin whitelist for user',
          id,
          rejectedKeys.join(', ')
        )
      }
      // Nothing survived the filter. Returning 200 here would report success
      // for a save that wrote nothing, which is how the old flat-payload bug
      // stayed hidden. Fail loudly instead and name the fields.
      if (Object.keys(filteredUpdates).length === 0) {
        return NextResponse.json(
          {
            error: 'No updatable fields in this request',
            rejected_fields: rejectedKeys,
          },
          { status: 400 }
        )
      }
      const { error } = await supabaseAdmin.from('users').update(filteredUpdates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}