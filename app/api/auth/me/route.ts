import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)

    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (session.exp * 1000 < Date.now()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    // Verify session is still valid in database
    const { data: dbSession } = await supabaseAdmin
      .from('sessions')
      .select('is_valid')
      .eq('session_id', session.sessionId)
      .single()

    if (!dbSession?.is_valid) {
      return NextResponse.json({ error: 'Session invalidated' }, { status: 401 })
    }

    return NextResponse.json({ user: session.user })

  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}