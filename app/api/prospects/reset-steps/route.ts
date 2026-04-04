import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { sendOnboardingResetEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Fields to clear on users table per step
const USER_RESET_FIELDS: Record<number, Record<string, any>> = {
  2: {
    onboarding_fee_paid: false,
    onboarding_fee_paid_date: null,
  },
  3: {
    independent_contractor_agreement_signed: false,
    ica_signed_at: null,
    ica_document_url: null,
  },
  4: {
    commission_plan_agreement_signed: false,
    commission_plan_agreement_signed_at: null,
    commission_plan_agreement_url: null,
  },
}

// Fields to clear on onboarding_sessions table per step
const SESSION_RESET_FIELDS: Record<number, Record<string, any>> = {
  1: { step_1_completed_at: null },
  2: { step_2_completed_at: null },
  3: { step_3_completed_at: null, agent_signature_url: null },
  4: { step_4_completed_at: null },
  5: { step_5_completed_at: null, policy_ack_document_url: null },
  6: { step_6_completed_at: null },
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const { prospect_id, steps } = await request.json()

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 })
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'At least one step is required' }, { status: 400 })
    }

    const validSteps = [1, 2, 3, 4, 5, 6]
    const invalidSteps = steps.filter((s: number) => !validSteps.includes(s))
    if (invalidSteps.length > 0) {
      return NextResponse.json({ error: `Invalid steps: ${invalidSteps.join(', ')}` }, { status: 400 })
    }

    // Fetch prospect
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, preferred_first_name, email, campaign_token, status')
      .eq('id', prospect_id)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }
    if (prospect.status !== 'prospect') {
      return NextResponse.json({ error: 'User is no longer a prospect' }, { status: 400 })
    }
    if (!prospect.campaign_token) {
      return NextResponse.json({ error: 'No onboarding token found' }, { status: 400 })
    }

    // Build user table update from all steps being reset
    const userUpdates = steps.reduce((acc: Record<string, any>, step: number) => {
      return { ...acc, ...(USER_RESET_FIELDS[step] || {}) }
    }, {})

    if (Object.keys(userUpdates).length > 0) {
      await supabaseAdmin.from('users').update(userUpdates).eq('id', prospect_id)
    }

    // Build session table update from all steps being reset
    const sessionUpdates = steps.reduce((acc: Record<string, any>, step: number) => {
      return { ...acc, ...(SESSION_RESET_FIELDS[step] || {}) }
    }, {})

    // Set current_step to the earliest step being reset
    const earliestStep = Math.min(...steps)
    sessionUpdates.current_step = earliestStep
    sessionUpdates.updated_at = new Date().toISOString()

    await supabaseAdmin
      .from('onboarding_sessions')
      .update(sessionUpdates)
      .eq('user_id', prospect_id)

    // Send reset email
    await sendOnboardingResetEmail({
      preferred_first_name: prospect.preferred_first_name || '',
      first_name: prospect.first_name || '',
      email: prospect.email,
      campaign_token: prospect.campaign_token,
      stepsReset: steps,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Reset steps error:', error)
    return NextResponse.json({ error: error.message || 'Failed to reset steps' }, { status: 500 })
  }
}