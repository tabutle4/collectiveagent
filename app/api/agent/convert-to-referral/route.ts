import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Require authenticated user
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authResult.user.id

    // Get current user data
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, status, mls_choice, first_name, last_name, email, payload_payee_id')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if already a referral agent
    if (user.mls_choice === 'Referral Collective (No MLS)') {
      return NextResponse.json({ error: 'Already a Referral Collective agent' }, { status: 400 })
    }

    // Check if active agent (only active agents can convert)
    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Only active agents can convert to Referral Collective' }, { status: 400 })
    }

    // Generate new campaign token for onboarding
    const newCampaignToken = crypto.randomUUID()

    // Minimal changes - just start the conversion process
    // Payload cancellation and field clearing happen when Courtney signs
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        status: 'prospect',
        mls_choice: 'Referral Collective (No MLS)',
        campaign_token: newCampaignToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to update user:', updateError)
      return NextResponse.json({ error: 'Failed to convert agent' }, { status: 500 })
    }

    // Check if there's a conversion promotion active
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('referral_conversion_free_until, referral_conversion_discount, referral_annual_fee')
      .single()

    const now = new Date()
    const promoEndDate = settings?.referral_conversion_free_until 
      ? new Date(settings.referral_conversion_free_until) 
      : null
    const isPromoActive = promoEndDate && now <= promoEndDate
    const discountAmount = isPromoActive ? (settings?.referral_conversion_discount || 0) : 0
    const annualFee = settings?.referral_annual_fee || 299
    const isFreeConversion = discountAmount >= annualFee // Full discount = free

    // Create new onboarding session for referral flow
    // Start at step 1 so they can review their existing info
    // If full discount (free): mark step 2 (payment) as completed so it's skipped
    // Clear previous completion timestamps for fresh start
    const { error: sessionError } = await supabaseAdmin
      .from('onboarding_sessions')
      .upsert({
        user_id: userId,
        current_step: 1, // Always start at info review
        step_1_completed_at: null,
        step_2_completed_at: isFreeConversion ? new Date().toISOString() : null, // Skip payment only if fully free
        payment_waived: isFreeConversion, // Track that fee was fully waived
        discount_amount: discountAmount, // Track discount amount
        previous_mls_choice: user.mls_choice, // Store original MLS for cancel/revert
        step_3_completed_at: null,
        step_4_completed_at: null,
        step_5_completed_at: null,
        step_6_completed_at: null,
        step_7_completed_at: null,
        policy_ack_document_url: null,
        agent_signature_url: null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

    if (sessionError) {
      console.error('Failed to create onboarding session:', sessionError)
      // Don't fail the request, session will be created on first onboard page visit
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const onboardingUrl = `${appUrl}/onboard/${newCampaignToken}`

    return NextResponse.json({
      success: true,
      onboardingUrl,
      message: 'Conversion started. Please complete the Referral Collective onboarding.',
    })
  } catch (error: any) {
    console.error('Convert to referral error:', error)
    return NextResponse.json({ error: error.message || 'Conversion failed' }, { status: 500 })
  }
}
