import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    // Validate PM session (same pattern as request-w9)
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('pm_session')?.value
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createClient()

    // Verify session
    const { data: session } = await supabase
      .from('pm_sessions')
      .select('user_id, user_type, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    if (session.user_type !== 'landlord') {
      return NextResponse.json({ error: 'Only landlords can complete W9' }, { status: 403 })
    }

    const landlordId = session.user_id
    
    // Get landlord
    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .select('id, email, first_name, last_name')
      .eq('id', landlordId)
      .single()

    if (landlordError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    const body = await request.json()
    const { tin_match_status, signed_at, signed_pdf } = body

    // Update landlord with W9 completion info
    const { error: updateError } = await supabase
      .from('landlords')
      .update({
        w9_status: 'completed',
        w9_tin_match_status: tin_match_status || null,
        w9_signed_at: signed_at || new Date().toISOString(),
        w9_pdf_url: signed_pdf || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    if (updateError) {
      console.error('Error updating landlord W9 status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update W9 status' },
        { status: 500 }
      )
    }

    console.log(`W9 completed for landlord ${landlord.email}:`, {
      tin_match_status,
      signed_at
    })

    return NextResponse.json({
      success: true,
      message: 'W9 status updated'
    })
  } catch (error) {
    console.error('W9 complete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}