import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find user by campaign_token (allow prospect or active for agents mid-onboarding)
    const { data: prospect, error } = await supabase
      .from('users')
      .select('*')
      .eq('campaign_token', token)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    // Get or create onboarding session
    let { data: session } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', prospect.id)
      .single()

    if (!session) {
      const { data: newSession } = await supabase
        .from('onboarding_sessions')
        .insert({
          user_id: prospect.id,
          current_step: 1,
          reminder_count: 0,
        })
        .select()
        .single()
      session = newSession
    }

    // Don't return sensitive fields
    const { password_hash, ...safeProspect } = prospect

    return NextResponse.json({ prospect: safeProspect, session })
  } catch (error: any) {
    console.error('Onboarding verify error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
