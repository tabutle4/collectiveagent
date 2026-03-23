import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('pm_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const supabase = createClient()

    // Find the session
    const { data: session, error: sessionError } = await supabase
      .from('pm_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      // Delete expired session
      await supabase.from('pm_sessions').delete().eq('id', session.id)
      return NextResponse.json({ authenticated: false, reason: 'expired' }, { status: 401 })
    }

    // Update last accessed
    await supabase
      .from('pm_sessions')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', session.id)

    // Fetch user data based on type
    let user = null
    if (session.user_type === 'landlord') {
      const { data } = await supabase
        .from('landlords')
        .select('id, first_name, last_name, email, phone, status, w9_status, bank_status')
        .eq('id', session.user_id)
        .single()
      user = data
    } else {
      const { data } = await supabase
        .from('tenants')
        .select('id, first_name, last_name, email, phone, status')
        .eq('id', session.user_id)
        .single()
      user = data
    }

    if (!user) {
      return NextResponse.json({ authenticated: false, reason: 'user_not_found' }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user_type: session.user_type,
      user_id: session.user_id,
      email: session.email,
      user,
    })
  } catch (error: any) {
    console.error('Error in PM auth session:', error)
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 })
  }
}
