import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('pm_session')?.value

    if (sessionToken) {
      const supabase = createClient()

      // Get session info for logging
      const { data: session } = await supabase
        .from('pm_sessions')
        .select('user_type, user_id, email')
        .eq('session_token', sessionToken)
        .single()

      // Delete session
      await supabase.from('pm_sessions').delete().eq('session_token', sessionToken)

      // Log logout
      if (session) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
        const userAgent = request.headers.get('user-agent') || 'unknown'

        await supabase.from('pm_access_log').insert({
          user_type: session.user_type,
          user_id: session.user_id,
          email: session.email,
          action: 'logout',
          ip_address: ip,
          user_agent: userAgent,
        })
      }
    }

    // Clear cookie and redirect to login
    const response = NextResponse.json({ success: true })
    response.cookies.delete('pm_session')

    return response
  } catch (error: any) {
    console.error('Error in PM auth logout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
