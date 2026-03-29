import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

// POST - Add new member agreement to team
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const { teamId } = await context.params
    const body = await request.json()
    const {
      agent_id,
      effective_date,
      end_date,
      agreement_document_url,
      firm_min_override = false,
      notes,
      splits = [],
    } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    if (!effective_date) {
      return NextResponse.json({ error: 'Effective date is required' }, { status: 400 })
    }

    // Check if agent already has active agreement on this team
    const { data: existing } = await supabaseAdmin
      .from('team_member_agreements')
      .select('id')
      .eq('team_id', teamId)
      .eq('agent_id', agent_id)
      .is('end_date', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Agent already has an active agreement on this team' },
        { status: 400 }
      )
    }

    // Create member agreement
    const { data: agreement, error: agreementError } = await supabaseAdmin
      .from('team_member_agreements')
      .insert({
        team_id: teamId,
        agent_id,
        effective_date,
        end_date: end_date || null,
        agreement_document_url: agreement_document_url || null,
        firm_min_override,
        notes: notes || null,
      })
      .select()
      .single()

    if (agreementError) throw agreementError

    // Insert splits if provided
    if (splits.length > 0) {
      const splitsToInsert = splits.map((split: any) => ({
        agreement_id: agreement.id,
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

    return NextResponse.json({ agreement, success: true })
  } catch (error: any) {
    console.error('Error creating member agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create member agreement' },
      { status: 500 }
    )
  }
}
