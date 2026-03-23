import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return redirectToLogin('Missing token')
    }

    const supabase = createClient()

    // Find the token
    const { data: authToken, error: tokenError } = await supabase
      .from('pm_auth_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenError || !authToken) {
      return redirectToLogin('Invalid or expired link')
    }

    // Check if expired
    if (new Date(authToken.expires_at) < new Date()) {
      return redirectToLogin('This link has expired. Please request a new one.')
    }

    // Check if already used
    if (authToken.used_at) {
      return redirectToLogin('This link has already been used. Please request a new one.')
    }

    // Get IP and user agent
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Mark token as used
    await supabase
      .from('pm_auth_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', authToken.id)

    // Create session (7 days)
    const { data: session, error: sessionError } = await supabase
      .from('pm_sessions')
      .insert({
        user_type: authToken.user_type,
        user_id: authToken.user_id,
        email: authToken.email,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('session_token')
      .single()

    if (sessionError || !session) {
      console.error('Failed to create session:', sessionError)
      return redirectToLogin('Failed to create session')
    }

    // Log successful login
    await supabase.from('pm_access_log').insert({
      user_type: authToken.user_type,
      user_id: authToken.user_id,
      email: authToken.email,
      action: 'login_success',
      ip_address: ip,
      user_agent: userAgent,
    })

    // Determine redirect URL
    const dashboardUrl = authToken.user_type === 'landlord' 
      ? '/pm/landlord/dashboard' 
      : '/pm/tenant/dashboard'

    // Create response with redirect
    const response = NextResponse.redirect(new URL(dashboardUrl, request.url))

    // Set httpOnly cookie (7 days)
    response.cookies.set('pm_session', session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('Error in PM auth verify:', error)
    return redirectToLogin('An error occurred')
  }
}

function redirectToLogin(error: string) {
  const loginUrl = new URL('/pm/login', process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com')
  loginUrl.searchParams.set('error', error)
  return NextResponse.redirect(loginUrl)
}
