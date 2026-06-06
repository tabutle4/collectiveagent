import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// Portal route -- authenticated by pm_session cookie
// Called after Track1099 W-9 widget callback fires
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
      return NextResponse.json({ error: 'Only landlords can complete W-9' }, { status: 403 })
    }

    const landlordId = session.user_id

    const { data: landlord, error: landlordError } = await supabaseAdmin
      .from('landlords')
      .select('id, email, first_name, last_name')
      .eq('id', landlordId)
      .single()

    if (landlordError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    const body = await request.json()
    const { tin_match_status, signed_at } = body

    const { error: updateError } = await supabaseAdmin
      .from('landlords')
      .update({
        w9_status: 'completed',
        w9_tin_match_status: tin_match_status || null,
        w9_signed_at: signed_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    if (updateError) {
      console.error('Error updating landlord W-9 status:', updateError)
      return NextResponse.json({ error: 'Failed to update W-9 status' }, { status: 500 })
    }

    console.log(`W-9 completed for landlord ${landlord.email}:`, { tin_match_status, signed_at })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('w9-complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
