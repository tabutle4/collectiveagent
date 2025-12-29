import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizeSocialUrl } from '@/lib/socialLinks'
import { regenerateRoster } from '@/lib/rosterGenerator'

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, user_id, token, profile_data } = await request.json()

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

    // Update user profile
    const { error: updateError } = await supabase
      .from('users')
      .update({
        first_name: profile_data.first_name,
        last_name: profile_data.last_name,
        preferred_first_name: profile_data.preferred_first_name,
        preferred_last_name: profile_data.preferred_last_name,
        personal_email: profile_data.personal_email,
        personal_phone: profile_data.personal_phone,
        business_phone: profile_data.business_phone,
        date_of_birth: profile_data.date_of_birth,
        birth_month: profile_data.birth_month,
        shirt_type: profile_data.shirt_type,
        shirt_size: profile_data.shirt_size,
        shipping_address_line1: profile_data.shipping_address_line1,
        shipping_address_line2: profile_data.shipping_address_line2,
        shipping_city: profile_data.shipping_city,
        shipping_state: profile_data.shipping_state,
        shipping_zip: profile_data.shipping_zip,
        instagram_handle: normalizeSocialUrl(profile_data.instagram_handle, 'instagram'),
        tiktok_handle: normalizeSocialUrl(profile_data.tiktok_handle, 'tiktok'),
        threads_handle: normalizeSocialUrl(profile_data.threads_handle, 'threads'),
        youtube_url: normalizeSocialUrl(profile_data.youtube_url, 'youtube'),
        linkedin_url: normalizeSocialUrl(profile_data.linkedin_url, 'linkedin'),
        facebook_url: normalizeSocialUrl(profile_data.facebook_url, 'facebook'),
      })
      .eq('id', user_id)

    if (updateError) throw updateError

    // Save commission plan selection to campaign_responses
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
          commission_plan_2026: profile_data.commission_plan,
          commission_plan_2026_other: profile_data.commission_plan_other,
          profile_updates: profile_data,
        })
        .eq('id', existingResponse.id)
    } else {
      await supabase
        .from('campaign_responses')
        .insert({
          campaign_id,
          user_id,
          commission_plan_2026: profile_data.commission_plan,
          commission_plan_2026_other: profile_data.commission_plan_other,
          profile_updates: profile_data,
        })
    }

    regenerateRoster().catch((err) => console.error('Roster regenerate error:', err))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}