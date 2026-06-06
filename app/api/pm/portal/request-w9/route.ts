import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// Portal route -- authenticated by pm_session cookie
// Creates a Track1099 form_request server-side for a landlord
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

    const apiToken = process.env.TRACK1099_API_TOKEN
    const teamId = process.env.TRACK1099_TEAM_API_ID
    const companyId = process.env.TRACK1099_CRC_COMPANY_ID

    if (!apiToken || !teamId || !companyId) {
      return NextResponse.json({
        error: 'W-9 service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true,
      }, { status: 503 })
    }

    const res = await fetch(`https://www.track1099.com/api/v1/${teamId}/form_requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'form_request',
          attributes: {
            form_type: 'W-9',
            company_id: parseInt(companyId),
            reference_id: landlord.id,
          },
        },
      }),
    })

    const responseData = await res.json()

    if (!res.ok) {
      console.error('Track1099 form_request failed:', responseData)
      return NextResponse.json(
        { error: 'Failed to create W-9 request. Please try again or contact support.' },
        { status: 500 }
      )
    }

    await supabaseAdmin
      .from('landlords')
      .update({
        w9_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    return NextResponse.json({ success: true, form_request: responseData.data })
  } catch (error: any) {
    console.error('request-w9 error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
