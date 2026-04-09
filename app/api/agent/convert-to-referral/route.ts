import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Cancel active Payload billing schedules for a customer
async function cancelPayloadSubscription(payloadCustomerId: string): Promise<boolean> {
  try {
    // Find active billing schedules for this customer
    const schedRes = await fetch(
      `https://api.payload.com/billing_schedules/?customer_id=${payloadCustomerId}&limit=10`,
      { headers: { Authorization: authHeader() } }
    )
    
    if (!schedRes.ok) {
      console.error('Failed to fetch billing schedules:', await schedRes.text())
      return false
    }
    
    const schedData = await schedRes.json()
    const schedules = schedData.values || []
    
    if (schedules.length === 0) {
      console.log('No billing schedules found for customer:', payloadCustomerId)
      return true
    }
    
    // Delete each billing schedule
    for (const schedule of schedules) {
      const deleteRes = await fetch(
        `https://api.payload.com/billing_schedules/${schedule.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: authHeader() },
        }
      )
      
      if (deleteRes.ok) {
        console.log('Cancelled billing schedule:', schedule.id)
      } else {
        console.error('Failed to cancel billing schedule:', schedule.id, await deleteRes.text())
      }
    }
    
    return true
  } catch (error) {
    console.error('Error cancelling Payload subscription:', error)
    return false
  }
}

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

    // Cancel Payload monthly subscription if customer exists
    if (user.payload_payee_id) {
      const cancelled = await cancelPayloadSubscription(user.payload_payee_id)
      if (!cancelled) {
        console.warn('Could not cancel Payload subscription for user:', userId)
        // Don't fail the conversion - just log the warning
      }
    }

    // Generate new campaign token for onboarding
    const newCampaignToken = uuidv4()

    // Update user to prospect status with referral mls_choice
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        status: 'prospect',
        mls_choice: 'Referral Collective (No MLS)',
        campaign_token: newCampaignToken,
        monthly_fee_waived: true, // Referral agents don't pay monthly fees
        // Clear ICA fields - they need to sign new Referral ICA
        independent_contractor_agreement_signed: false,
        ica_signed_at: null,
        ica_document_url: null,
        // Clear commission plan fields - referral agents have fixed splits
        commission_plan: null,
        commission_plan_agreement_signed: false,
        commission_plan_agreement_signed_at: null,
        commission_plan_agreement_url: null,
        // Keep debts (they carry over)
        // Keep personal info, W-9 status, etc.
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to update user:', updateError)
      return NextResponse.json({ error: 'Failed to convert agent' }, { status: 500 })
    }

    // Check if there's a free conversion promotion active
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('referral_conversion_free_until')
      .single()

    const now = new Date()
    const promoEndDate = settings?.referral_conversion_free_until 
      ? new Date(settings.referral_conversion_free_until) 
      : null
    const isFreeConversion = promoEndDate && now <= promoEndDate

    // Create new onboarding session for referral flow
    // Start at step 1 so they can review their existing info
    // If free promotion: mark step 2 (payment) as completed so it's skipped
    // Clear previous completion timestamps for fresh start
    const { error: sessionError } = await supabaseAdmin
      .from('onboarding_sessions')
      .upsert({
        user_id: userId,
        current_step: 1, // Always start at info review
        step_1_completed_at: null,
        step_2_completed_at: isFreeConversion ? new Date().toISOString() : null, // Skip payment if free
        payment_waived: isFreeConversion, // Track that fee was waived
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
