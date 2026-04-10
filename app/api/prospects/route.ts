import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendProspectWelcomeEmail, sendNewProspectNotification } from '@/lib/email'
import { requirePermission } from '@/lib/api-auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// POST is intentionally public - this is the prospective agent form
export async function POST(request: NextRequest) {
  try {
    const formData = await request.json()

    const isReferralAgent = formData.mls_choice === 'Referral Collective (No MLS)'

    const requiredFields = [
      'first_name',
      'last_name',
      'preferred_first_name',
      'preferred_last_name',
      'email',
      'phone',
      'location',
      'mls_choice',
      'expectations',
      'accountability',
      'lead_generation',
      'additional_info',
      'how_heard',
    ]

    // Association status only required for non-referral agents
    if (!isReferralAgent) {
      requiredFields.push('association_status')
    }

    for (const field of requiredFields) {
      if (!formData[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: 'Phone number must be exactly 10 digits' }, { status: 400 })
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', formData.email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered in our system' },
        { status: 409 }
      )
    }

    // Generate a unique onboarding token for this prospect
    const campaign_token = crypto.randomBytes(24).toString('hex')

    const { data: prospect, error: insertError } = await supabase
      .from('users')
      .insert({
        email: formData.email.toLowerCase(),
        password_hash: '',
        first_name: formData.first_name,
        last_name: formData.last_name,
        preferred_first_name: formData.preferred_first_name,
        preferred_last_name: formData.preferred_last_name,
        status: 'prospect',
        is_active: false,
        roles: [],
        phone: phoneDigits,
        location: formData.location,
        instagram_handle: formData.instagram_handle || null,
        mls_choice: formData.mls_choice,
        association_status_on_join: formData.association_status,
        previous_brokerage: formData.previous_brokerage || null,
        expectations: formData.expectations,
        accountability: formData.accountability,
        lead_generation: formData.lead_generation,
        additional_info: formData.additional_info,
        how_heard: formData.how_heard,
        how_heard_other: formData.how_heard_other || null,
        referring_agent: formData.referring_agent || null,
        joining_team: formData.joining_team || null,
        prospect_status: 'new',
        campaign_token,
        // Referral agents don't pay monthly fees
        monthly_fee_waived: isReferralAgent,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      throw insertError
    }

    // If a referring agent name was provided, look up their user ID and link it
    if (formData.referring_agent && prospect) {
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://collectiveagentapp.com'
    const joinLink = `${appUrl}/onboard/${campaign_token}`

    try {
      await sendProspectWelcomeEmail({
        preferred_first_name: prospect.preferred_first_name,
        email: prospect.email,
        join_link: joinLink,
        mls_choice: prospect.mls_choice,
      })
    } catch (emailError) {
      console.error('Error sending prospect email:', emailError)
    }

    try {
      await sendNewProspectNotification({
        id: prospect.id,
        first_name: prospect.first_name,
        last_name: prospect.last_name,
        email: prospect.email,
        phone: prospect.phone,
        location: prospect.location,
        mls_choice: prospect.mls_choice,
      })
    } catch (notifyError) {
      console.error('Error sending prospect notification:', notifyError)
    }

    return NextResponse.json({
      message: 'Prospect submitted successfully',
      prospect: {
        id: prospect.id,
        preferred_first_name: prospect.preferred_first_name,
        email: prospect.email,
      },
    })
  } catch (error) {
    console.error('Prospect submission error:', error)
    return NextResponse.json(
      { error: 'An error occurred while submitting your information' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Require permission to view all agents (which includes prospects)
  const auth = await requirePermission(request, 'can_view_all_agents')
  if (auth.error) return auth.error

  try {
    const { data: prospects, error } = await supabase
      .from('users')
      .select('*')
      .eq('status', 'prospect')
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (error) throw error

    // Strip sensitive fields
    const safeProspects = (prospects || []).map(
      ({ password_hash, reset_token, reset_token_expires, ...p }: any) => p
    )

    return NextResponse.json({ prospects: safeProspects })
  } catch (error) {
    console.error('Get prospects error:', error)
    return NextResponse.json(
      { error: 'An error occurred while fetching prospects' },
      { status: 500 }
    )
  }
}