import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, user_id, token, rsvp_data } = await request.json()

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

    // Save RSVP to campaign_responses
    const { data: existingResponse } = await supabase
      .from('campaign_responses')
      .select('id')
      .eq('campaign_id', campaign_id)
      .eq('user_id', user_id)
      .single()

    if (existingResponse) {
      await supabase
        .from('campaign_responses')
        .update({
          attending_luncheon: rsvp_data.attending_luncheon,
          luncheon_comments: rsvp_data.luncheon_comments,
        })
        .eq('id', existingResponse.id)
    } else {
      await supabase
        .from('campaign_responses')
        .insert({
          campaign_id,
          user_id,
          attending_luncheon: rsvp_data.attending_luncheon,
          luncheon_comments: rsvp_data.luncheon_comments,
        })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update RSVP error:', error)
    return NextResponse.json({ error: 'Failed to update RSVP' }, { status: 500 })
  }
}