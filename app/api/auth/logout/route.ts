import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySessionToken, getSessionCookieOptions } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value

    if (sessionToken) {
      const session = await verifySessionToken(sessionToken)

      if (session?.sessionId) {
        // Invalidate session in database
        await supabaseAdmin
          .from('sessions')
          .update({ is_valid: false })
          .eq('session_id', session.sessionId)
      }
    }

    const response = NextResponse.json({ message: 'Logged out successfully' })
    response.cookies.delete('ca_session')
    return response
  } catch (error) {
    console.error('Logout error:', error)
    const response = NextResponse.json({ message: 'Logged out' })
    response.cookies.delete('ca_session')
    return response
  }
}
