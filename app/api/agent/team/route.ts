import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // Admins can pass ?user_id= to fetch another user's team data
    const urlUserId = request.nextUrl.searchParams.get('user_id')
    const userId = (urlUserId && auth.permissions.has('can_manage_agents')) ? urlUserId : auth.user.id

    // Get agent's active team membership with agreement and splits
    const { data: membership, error } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        id,
        effective_date,
        end_date,
        agreement_document_url,
        firm_min_override,
        notes,
        team:teams!team_member_agreements_team_id_fkey(
          id,
          team_name,
          status
        ),
        splits:team_agreement_splits(
          id,
          plan_type,
          lead_source,
          agent_pct,
          team_lead_pct,
          firm_pct
        )
      `)
      .eq('agent_id', userId)
      .is('end_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!membership) {
      return NextResponse.json({ team: null, membership: null })
    }

    // Get team lead
    const { data: leads } = await supabaseAdmin
      .from('team_leads')
      .select(`
        agent:users!team_leads_agent_id_fkey(
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name,
          headshot_url
        )
      `)
      .eq('team_id', (membership.team as any).id)
      .is('end_date', null)
      .limit(1)

    // Get all active members of the same team with their splits
    const { data: allMembers } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        id,
        agent_id,
        effective_date,
        agreement_document_url,
        splits:team_agreement_splits(
          id, plan_type, lead_source, agent_pct, team_lead_pct, firm_pct
        ),
        agent:users!team_member_agreements_agent_id_fkey(
          preferred_first_name, preferred_last_name,
          first_name, last_name, headshot_url
        )
      `)
      .eq('team_id', (membership.team as any).id)
      .is('end_date', null)
      .order('effective_date', { ascending: true })

    return NextResponse.json({
      team: membership.team,
      membership: {
        id: membership.id,
        agent_id: userId,
        effective_date: membership.effective_date,
        agreement_document_url: membership.agreement_document_url,
        splits: membership.splits,
      },
      team_lead: leads?.[0]?.agent || null,
      all_members: allMembers || [],
    })
  } catch (error: any) {
    console.error('Agent team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}