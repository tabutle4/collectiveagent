import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { avalaraConfigured, companyIdFor, createAndSendW9 } from '@/lib/avalara/w9'

export const dynamic = 'force-dynamic'

// Portal route -- authenticated by pm_session cookie
//
// Asks Avalara to email the landlord a W-9 request. Avalara owns the email and the
// signing page; the app reads the result back with getW9FormStatus.
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('pm_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: session } = await supabaseAdmin
      .from('pm_sessions')
      .select('user_id, user_type, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    if (session.user_type !== 'landlord') {
      return NextResponse.json({ error: 'Only landlords can request W-9' }, { status: 403 })
    }

    const landlordId = session.user_id

    const { data: landlord, error: fetchError } = await supabaseAdmin
      .from('landlords')
      .select('id, first_name, last_name, email, w9_status')
      .eq('id', landlordId)
      .single()

    if (fetchError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    if (landlord.w9_status === 'completed') {
      return NextResponse.json({ error: 'W-9 already completed' }, { status: 400 })
    }

    const companyId = companyIdFor(false)

    if (!avalaraConfigured() || !companyId) {
      return NextResponse.json({
        error: 'W-9 service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true,
      }, { status: 503 })
    }

    if (!landlord.email) {
      return NextResponse.json({ error: 'No email address on file' }, { status: 400 })
    }

    const name = [landlord.first_name, landlord.last_name].filter(Boolean).join(' ').trim()

    const result = await createAndSendW9({
      email: landlord.email,
      name: name || landlord.email,
      companyId,
      referenceId: landlord.id,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Failed to send W-9 request. Please try again or contact support.' },
        { status: 500 }
      )
    }

    await supabaseAdmin
      .from('landlords')
      .update({
        w9_status: 'pending',
        track1099_form_request_id: result.formId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    return NextResponse.json({ success: true, emailed: true, form_id: result.formId })
  } catch (error: any) {
    console.error('request-w9 error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
