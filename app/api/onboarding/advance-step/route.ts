import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { token, step } = await request.json()
    if (!token || !step) {
      return NextResponse.json({ error: 'token and step are required' }, { status: 400 })
    }

    const { data: prospect } = await supabase
      .from('users')
      .select('id')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (!prospect) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const completedAtField = `step_${step}_completed_at`
    const nextStep = step + 1

    await supabase.from('onboarding_sessions').upsert(
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
    console.error('Advance step error:', error)
    return NextResponse.json({ error: error.message || 'Failed to advance step' }, { status: 500 })
  }
}
