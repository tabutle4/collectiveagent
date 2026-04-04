import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, status, email')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.status === 'prospect') {
      return NextResponse.json({ error: 'User is already a prospect' }, { status: 400 })
    }

    // Reset user fields to prospect state
    await supabaseAdmin.from('users').update({
      status: 'prospect',
      is_active: false,
      is_licensed_agent: false,
      join_date: null,
      broker_signed_at: null,
      independent_contractor_agreement_signed: false,
      ica_signed_at: null,
      ica_document_url: null,
      commission_plan_agreement_signed: false,
      commission_plan_agreement_signed_at: null,
      commission_plan_agreement_url: null,
      onboarding_fee_paid: false,
      onboarding_fee_paid_date: null,
    }).eq('id', userId)

    // Reset onboarding session to step 1
    await supabaseAdmin.from('onboarding_sessions').update({
      current_step: 1,
      step_1_completed_at: null,
      step_2_completed_at: null,
      step_3_completed_at: null,
      step_4_completed_at: null,
      step_5_completed_at: null,
      step_6_completed_at: null,
      agent_signature_url: null,
      policy_ack_document_url: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Revert to prospect error:', error)
    return NextResponse.json({ error: error.message || 'Failed to revert' }, { status: 500 })
  }
}