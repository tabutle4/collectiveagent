import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendOnboardingNextStepsEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

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

    // If a referring agent name was provided, look up their user ID and link it
    if (formData.referring_agent) {
      const nameParts = formData.referring_agent.trim().split(/\s+/)
      if (nameParts.length >= 2) {
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ')
        const { data: referrer } = await supabase
          .from('users')
          .select('id')
          .ilike('first_name', firstName)
          .ilike('last_name', lastName)
          .eq('is_active', true)
          .limit(1)
          .single()
        if (referrer) {
          await supabase
            .from('users')
            .update({ referring_agent_id: referrer.id })
            .eq('id', prospect.id)
        }
      }
    }

    // Check if this is the first time step 1 is being submitted
    const { data: existingSession } = await supabase
      .from('onboarding_sessions')
      .select('step_1_completed_at, step_2_completed_at')
      .eq('user_id', prospect.id)
      .single()

    const isFirstSubmission = !existingSession?.step_1_completed_at
    const paymentAlreadyDone = !!existingSession?.step_2_completed_at

    // Determine next step - skip payment if already completed (free conversion promo)
    const nextStep = paymentAlreadyDone ? 3 : 2

    // Advance onboarding session
    // Preserve step_1_completed_at if already set so re-submissions don't reset it
    await supabase.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: nextStep,
        step_1_completed_at: existingSession?.step_1_completed_at ?? new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    // Send next steps email only on first submission - not on re-submissions from step 1
    if (isFirstSubmission) {
      const { data: userData } = await supabase
        .from('users')
        .select('preferred_first_name, first_name, email, campaign_token, mls_choice')
        .eq('id', prospect.id)
        .single()

      if (userData?.email && userData?.campaign_token) {
        const user = userData as { preferred_first_name: string; first_name: string; email: string; campaign_token: string; mls_choice: string | null }
        sendOnboardingNextStepsEmail({
          preferred_first_name: user.preferred_first_name || '',
          first_name: user.first_name || '',
          email: user.email,
          campaign_token: user.campaign_token,
          mls_choice: user.mls_choice || '',
        }).catch(err => console.error('Failed to send next steps email:', err))
      }
    }

    return NextResponse.json({ success: true, next_step: nextStep })
  } catch (error: any) {
    console.error('Submit join form error:', error)
    return NextResponse.json({ error: error.message || 'Failed to submit' }, { status: 500 })
  }
}