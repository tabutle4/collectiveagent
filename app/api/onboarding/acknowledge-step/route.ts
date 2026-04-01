import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Public route — authenticated by campaign_token, not session.
// Used for non-document steps (policy manual acknowledgment, W-9 notice, etc.)
export async function POST(request: NextRequest) {
  try {
    const { token, step } = await request.json()

    if (!token || !step) {
      return NextResponse.json({ error: 'token and step are required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const completedAtField = `step_${step}_completed_at`
    const nextStep = step + 1

    await supabaseAdmin.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: nextStep,
        [completedAtField]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    return NextResponse.json({ success: true, next_step: nextStep })
  } catch (error: any) {
    console.error('Acknowledge step error:', error)
    return NextResponse.json({ error: error.message || 'Failed to advance step' }, { status: 500 })
  }
}