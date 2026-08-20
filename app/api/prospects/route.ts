import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase, fetchAllRows } from '@/lib/supabase'
import { sendProspectWelcomeEmail, sendNewProspectNotification } from '@/lib/email'
import { requirePermission } from '@/lib/api-auth'
import { createFollowUpToken } from '@/lib/prospects/followUpToken'
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
  'how_heard',
]

// expectations, accountability, lead_generation and additional_info moved off
// this form. They are now asked after submission, on the success screen and in
// the welcome email, through /api/prospects/follow-up. They were never
// required for a prospect record to be complete.

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
        expectations: formData.expectations || null,
        accountability: formData.accountability || null,
        lead_generation: formData.lead_generation || null,
        additional_info: formData.additional_info || null,
        how_heard: formData.how_heard,
        how_heard_other: formData.how_heard_other || null,
        referring_agent: formData.referring_agent || null,
        joining_team: formData.joining_team || null,
        prospect_status: 'new',
        campaign_token,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      throw insertError
    }

    // Unified submission record so the prospective agent form appears in the
    // single submissions audit trail alongside all other forms.
    if (prospect?.id) {
      try {
        const { data: formRow } = await supabase
          .from('forms')
          .select('id')
          .eq('form_type', 'prospective-agent')
          .maybeSingle()
        await supabase.from('agent_form_submissions').insert({
          form_id: formRow?.id || null,
          agent_id: prospect.id,
          submitted_at: new Date().toISOString(),
          status: 'submitted',
          data: { ...formData, submission_mode: 'prospective-agent' },
          updated_at: new Date().toISOString(),
        })
      } catch (subErr) {
        console.error('Error writing submission record:', subErr)
        // Do not fail the prospect creation if the audit record fails.
      }
    }

    // Link the referring agent (momentum partner). If the prospect arrived via
    // an affiliate link, we already have a verified referring_agent_id and use
    // it directly. Otherwise fall back to matching the typed name.
    if (prospect) {
      let referrerId: string | null = null

      if (formData.referring_agent_id) {
        // Verify the id is a real licensed agent before trusting it.
        const { data: verified } = await supabase
          .from('users')
          .select('id')
          .eq('id', formData.referring_agent_id)
          .eq('is_licensed_agent', true)
          .maybeSingle()
        if (verified) referrerId = verified.id
      }

      if (!referrerId && formData.referring_agent) {
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
          if (referrer) referrerId = referrer.id
        }
      }

      if (referrerId) {
        await supabase
          .from('users')
          .update({ referring_agent_id: referrerId })
          .eq('id', prospect.id)
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://collectiveagentapp.com'
    const joinLink = `${appUrl}/onboard/${campaign_token}`

    // Scoped token for the optional follow-up questions. Minting must never
    // break the submission, so a failure here just means no follow-up link.
    let followUpToken = ''
    try {
      followUpToken = await createFollowUpToken(prospect.id)
    } catch (tokenError) {
      console.error('Error creating follow-up token:', tokenError)
    }

    const followUpLink = followUpToken
      ? `${appUrl}/prospective-agent-form/success` +
        `?name=${encodeURIComponent(prospect.preferred_first_name || '')}` +
        `&email=${encodeURIComponent(prospect.email)}` +
        `&type=${isReferralAgent ? 'referral' : 'standard'}` +
        `&t=${encodeURIComponent(followUpToken)}`
      : ''

    try {
      await sendProspectWelcomeEmail({
        preferred_first_name: prospect.preferred_first_name,
        email: prospect.email,
        join_link: joinLink,
        follow_up_link: followUpLink,
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
        form_data: formData,
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
      followUpToken,
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
    const prospects = await fetchAllRows(
      'users',
      '*',
      {
        filters: [{ type: 'eq', column: 'status', value: 'prospect' }],
        orderBy: { column: 'created_at', ascending: false },
      }
    )

    // Strip sensitive fields
    const safeProspects = prospects.map(
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