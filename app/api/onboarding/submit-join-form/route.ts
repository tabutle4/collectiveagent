import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { token, ...formData } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Verify token
    const { data: prospect, error: fetchError } = await supabase
      .from('users')
      .select('id, status')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (fetchError || !prospect) {
      return NextResponse.json({ error: 'Invalid onboarding link' }, { status: 404 })
    }

    // Update user with all join form fields
    const { error: updateError } = await supabase
      .from('users')
      .update({
        first_name: formData.first_name,
        last_name: formData.last_name,
        preferred_first_name: formData.preferred_first_name,
        preferred_last_name: formData.preferred_last_name,
        personal_phone: formData.personal_phone,
        business_phone: formData.business_phone || null,
        date_of_birth: formData.date_of_birth || null,
        shipping_address_line1: formData.shipping_address_line1,
        shipping_address_line2: formData.shipping_address_line2 || null,
        shipping_city: formData.shipping_city,
        shipping_state: formData.shipping_state,
        shipping_zip: formData.shipping_zip ? parseInt(formData.shipping_zip) : null,
        license_number: formData.license_number ? parseFloat(formData.license_number) : null,
        mls_id: formData.mls_id,
        nrds_id: formData.nrds_id || null,
        association: formData.association,
        association_status_on_join: formData.association_status_on_join,
        commission_plan: formData.commission_plan,
        instagram_handle: formData.instagram_handle || null,
        tiktok_handle: formData.tiktok_handle || null,
        threads_handle: formData.threads_handle || null,
        linkedin_url: formData.linkedin_url || null,
        facebook_url: formData.facebook_url || null,
        youtube_url: formData.youtube_url || null,
        referring_agent: formData.referring_agent || null,
        joining_team: formData.joining_team || null,
        prospect_status: 'joined',
      })
      .eq('id', prospect.id)

    if (updateError) {
      console.error('Join form update error:', updateError)
      return NextResponse.json({ error: 'Failed to save your information' }, { status: 500 })
    }

    // Advance onboarding session to step 2
    await supabase.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: 2,
        step_1_completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    return NextResponse.json({ success: true, next_step: 2 })
  } catch (error: any) {
    console.error('Submit join form error:', error)
    return NextResponse.json({ error: error.message || 'Failed to submit' }, { status: 500 })
  }
}
