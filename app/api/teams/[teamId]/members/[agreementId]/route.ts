import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth, requirePermission } from '@/lib/api-auth'

// GET - Get single member agreement with splits
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string; agreementId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { teamId, agreementId } = await context.params

    // Get agreement
    const { data: agreement, error: agreementError } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        *,
        agent:users!team_member_agreements_agent_id_fkey(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name,
          email,
          headshot_url,
          commission_plan
        ),
        team:teams!team_member_agreements_team_id_fkey(
          id,
          team_name,
          status
        )
      `)
      .eq('id', agreementId)
      .eq('team_id', teamId)
      .single()

    if (agreementError) {
      if (agreementError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
      }
      throw agreementError
    }

    // Get splits
    const { data: splits } = await supabaseAdmin
      .from('team_agreement_splits')
      .select('*')
      .eq('agreement_id', agreementId)
      .order('plan_type')
      .order('lead_source')

    // Get agent's other agreements on this team (history)
    const { data: historyAgreements } = await supabaseAdmin
      .from('team_member_agreements')
      .select(`
        id,
        effective_date,
        end_date,
        agreement_document_url,
        firm_min_override,
        notes
      `)
      .eq('team_id', teamId)
      .eq('agent_id', agreement.agent_id)
      .neq('id', agreementId)
      .order('effective_date', { ascending: false })

    // Get splits for history agreements
    const agentHistory = []
    for (const hist of historyAgreements || []) {
      const { data: histSplits } = await supabaseAdmin
        .from('team_agreement_splits')
        .select('*')
        .eq('agreement_id', hist.id)
      agentHistory.push({ ...hist, splits: histSplits || [] })
    }

    // For admins: get agent's agreements on OTHER teams
    let crossTeamAgreements: any[] = []
    const isAdmin = auth.permissions.has('can_manage_agents')
    
    if (isAdmin) {
      const { data: otherTeamAgreements } = await supabaseAdmin
        .from('team_member_agreements')
        .select(`
          id,
          team_id,
          effective_date,
          end_date,
          agreement_document_url,
          firm_min_override,
          notes,
          team:teams!team_member_agreements_team_id_fkey(
            id,
            team_name
          )
        `)
        .eq('agent_id', agreement.agent_id)
        .neq('team_id', teamId)
        .order('effective_date', { ascending: false })

      // Get splits for each cross-team agreement
      for (const otherAgreement of otherTeamAgreements || []) {
        const { data: otherSplits } = await supabaseAdmin
          .from('team_agreement_splits')
          .select('*')
          .eq('agreement_id', otherAgreement.id)
        crossTeamAgreements.push({ ...otherAgreement, splits: otherSplits || [] })
      }
    }

    return NextResponse.json({
      agreement: {
        ...agreement,
        splits: splits || [],
      },
      team: agreement.team,
      agentHistory,
      crossTeamAgreements,
      isAdmin,
    })
  } catch (error: any) {
    console.error('Error fetching agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch agreement' },
      { status: 500 }
    )
  }
}

// PATCH - Update member agreement
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ teamId: string; agreementId: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const { teamId, agreementId } = await context.params
    const body = await request.json()
    const {
      effective_date,
      end_date,
      agreement_document_url,
      firm_min_override,
      notes,
      splits,
    } = body

    // Build updates
    const updates: any = {}
    if (effective_date !== undefined) updates.effective_date = effective_date
    if (end_date !== undefined) updates.end_date = end_date || null
    if (agreement_document_url !== undefined) updates.agreement_document_url = agreement_document_url || null
    if (firm_min_override !== undefined) updates.firm_min_override = firm_min_override
    if (notes !== undefined) updates.notes = notes || null

    // Update agreement if there are field changes
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('team_member_agreements')
        .update(updates)
        .eq('id', agreementId)
        .eq('team_id', teamId)

      if (updateError) throw updateError
    }

    // Update splits if provided
    if (splits !== undefined) {
      // Delete existing splits
      await supabaseAdmin
        .from('team_agreement_splits')
        .delete()
        .eq('agreement_id', agreementId)

      // Insert new splits
      if (splits.length > 0) {
        const splitsToInsert = splits.map((split: any) => ({
          agreement_id: agreementId,
          plan_type: split.plan_type,
          lead_source: split.lead_source,
          agent_pct: split.agent_pct,
          team_lead_pct: split.team_lead_pct,
          firm_pct: split.firm_pct,
        }))

        const { error: splitsError } = await supabaseAdmin
          .from('team_agreement_splits')
          .insert(splitsToInsert)

        if (splitsError) throw splitsError
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update agreement' },
      { status: 500 }
    )
  }
}

// DELETE - End member agreement (soft delete by setting end_date)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ teamId: string; agreementId: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const { teamId, agreementId } = await context.params

    // Soft delete - set end_date to today
    const { error } = await supabaseAdmin
      .from('team_member_agreements')
      .update({ end_date: new Date().toISOString().split('T')[0] })
      .eq('id', agreementId)
      .eq('team_id', teamId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error ending agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to end agreement' },
      { status: 500 }
    )
  }
}
