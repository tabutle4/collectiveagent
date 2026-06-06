import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Public route -- authenticated by campaign_token
// Creates a Track1099 form_request server-side and returns it to the client
// so the client-side SDK can render the embedded W-9 widget
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, mls_choice')
      .eq('campaign_token', token)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const apiToken = process.env.TRACK1099_API_TOKEN
    const teamId = process.env.TRACK1099_TEAM_API_ID
    const isReferral = prospect.mls_choice === 'Referral Collective (No MLS)'
    const companyId = isReferral
      ? process.env.TRACK1099_RC_COMPANY_ID
      : process.env.TRACK1099_CRC_COMPANY_ID

    if (!apiToken || !teamId || !companyId) {
      return NextResponse.json({ error: 'W-9 service not configured' }, { status: 503 })
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
            reference_id: prospect.id,
          },
        },
      }),
    })

    const responseData = await res.json()

    if (!res.ok) {
      console.error('Track1099 form_request failed:', responseData)
      return NextResponse.json(
        { error: 'Failed to create W-9 request. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, form_request: responseData.data })
  } catch (error: any) {
    console.error('create-w9-request error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
