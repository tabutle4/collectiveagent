import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    console.log('AUTH ME: cookie present:', !!sessionToken)

    if (!sessionToken) {
      console.log('AUTH ME: no cookie')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    console.log('AUTH ME: session verified:', !!session)

    if (!session) {
      console.log('AUTH ME: verification failed')
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (session.exp * 1000 < Date.now()) {
      console.log('AUTH ME: expired')
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const { data: dbSession } = await supabaseAdmin
      .from('sessions')
      .select('is_valid')
      .eq('session_id', session.sessionId)
      .single()

    console.log('AUTH ME: db session:', JSON.stringify(dbSession))

    if (!dbSession?.is_valid) {
      console.log('AUTH ME: db session invalid')
      return NextResponse.json({ error: 'Session invalidated' }, { status: 401 })
    }

    return NextResponse.json({ user: session.user })

  } catch (error) {
    console.error('AUTH ME ERROR:', error)
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
