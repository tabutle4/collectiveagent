import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, user_id, token, survey_data } = await request.json()

    // Verify token
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .eq('campaign_token', token)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    // Save survey to campaign_responses
    const { data: existingResponse } = await supabase
      .from('campaign_responses')
      .select('id')
      .eq('campaign_id', campaign_id)
      .eq('user_id', user_id)
      .single()

    const now = new Date().toISOString()

    if (existingResponse) {
      await supabase
        .from('campaign_responses')
        .update({
          support_rating: survey_data.support_rating,
          support_improvements: survey_data.support_improvements,
          work_preference: survey_data.work_preference,
          submitted_at: now,
        })
        .eq('id', existingResponse.id)
    } else {
      await supabase.from('campaign_responses').insert({
        campaign_id,
        user_id,
        support_rating: survey_data.support_rating,
        support_improvements: survey_data.support_improvements,
        work_preference: survey_data.work_preference,
        submitted_at: now,
      })
    }

    // Mark campaign as fully completed
    await supabase
      .from('campaign_recipients')
      .update({
        fully_completed_at: now,
        current_step: 4,
      })
      .eq('campaign_id', campaign_id)
      .eq('user_id', user_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Submit survey error:', error)
    return NextResponse.json({ error: 'Failed to submit survey' }, { status: 500 })
  }
}
