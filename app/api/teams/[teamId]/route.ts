import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth, requirePermission } from '@/lib/api-auth'

// GET - Get team detail with leads and member agreements
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { teamId } = await context.params

    // Get team
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single()

    if (teamError) {
      if (teamError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 })
      }
      throw teamError
    }

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
          last_name,
          email,
          headshot_url
        )
      `)
      .eq('team_id', teamId)
      .order('start_date', { ascending: false })

    // Get member agreements with their splits
    const { data: memberAgreements } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        id,
        agent_id,
        effective_date,
        end_date,
        agreement_document_url,
        firm_min_override,
        notes,
        agent:users!team_member_agreements_agent_id_fkey(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name,
          email,
          headshot_url,
          commission_plan
        )
      `)
      .eq('team_id', teamId)
      .order('effective_date', { ascending: false })

    // Get splits for each member agreement
    const agreementsWithSplits = await Promise.all(
      (memberAgreements || []).map(async agreement => {
        const { data: splits } = await supabaseAdmin
          .from('team_agreement_splits')
          .select('*')
          .eq('agreement_id', agreement.id)
          .order('plan_type')
          .order('lead_source')

        return {
          ...agreement,
          splits: splits || [],
        }
      })
    )

    // Separate active and inactive members
    const activeMembers = agreementsWithSplits.filter(m => !m.end_date)
    const inactiveMembers = agreementsWithSplits.filter(m => m.end_date)

    return NextResponse.json({
      team,
      leads: leads || [],
      activeLeads: (leads || []).filter(l => !l.end_date),
      members: agreementsWithSplits,
      activeMembers,
      inactiveMembers,
    })
  } catch (error: any) {
    console.error('Error fetching team:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch team' },
      { status: 500 }
    )
  }
}

// PATCH - Update team info
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const { teamId } = await context.params
    const body = await request.json()
    const { team_name, status } = body

    const updates: any = {}
    if (team_name !== undefined) updates.team_name = team_name.trim()
    if (status !== undefined) updates.status = status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const { data: team, error } = await supabaseAdmin
      .from('teams')
      .update(updates)
      .eq('id', teamId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ team, success: true })
  } catch (error: any) {
    console.error('Error updating team:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update team' },
      { status: 500 }
    )
  }
}

// DELETE - Soft delete team (set status to inactive)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const { teamId } = await context.params

    // Soft delete - set status to inactive
    const { error } = await supabaseAdmin
      .from('teams')
      .update({ status: 'inactive' })
      .eq('id', teamId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting team:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete team' },
      { status: 500 }
    )
  }
}
