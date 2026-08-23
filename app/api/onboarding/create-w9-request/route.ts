import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { avalaraConfigured, companyIdFor, createAndSendW9 } from '@/lib/avalara/w9'

export const dynamic = 'force-dynamic'

// Public route -- authenticated by campaign_token
//
// Asks Avalara to email the prospect a W-9 request. Avalara owns the email and the
// signing page, so there is no embedded widget here: the prospect completes the form
// on Avalara's side and the app reads the result back with getW9FormStatus.
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, mls_choice')
      .eq('campaign_token', token)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    if (!prospect.email) {
      return NextResponse.json({ error: 'No email address on file' }, { status: 400 })
    }

    const isReferral = prospect.mls_choice === 'Referral Collective (No MLS)'
    const companyId = companyIdFor(isReferral)

    if (!avalaraConfigured() || !companyId) {
      return NextResponse.json({ error: 'W-9 service not configured' }, { status: 503 })
    }

    const name = [
      prospect.preferred_first_name || prospect.first_name,
      prospect.preferred_last_name || prospect.last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim()

    const result = await createAndSendW9({
      email: prospect.email,
      name: name || prospect.email,
      companyId,
      referenceId: prospect.id,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Failed to send W-9 request. Please try again.' },
        { status: 500 }
      )
    }

    // Store the form id so the onboarding tracker can read status back later.
    await supabaseAdmin
      .from('users')
      .update({ w9_form_id: result.formId, updated_at: new Date().toISOString() })
      .eq('id', prospect.id)

    return NextResponse.json({ success: true, emailed: true, form_id: result.formId })
  } catch (error: any) {
    console.error('create-w9-request error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
