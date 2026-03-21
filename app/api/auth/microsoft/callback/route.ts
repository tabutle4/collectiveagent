import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createSessionToken, getSessionCookieOptions } from '@/lib/session'
import { randomUUID } from 'crypto'
import { SESSION_DURATION_MS, ADMIN_ROLES } from '@/lib/constants'

const CLIENT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ID
const CLIENT_SECRET = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
const TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.split('/')[3]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=microsoft_auth_failed`
    )
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      }
    )

    const tokens = await tokenResponse.json()

    if (!tokenResponse.ok) {
      throw new Error(tokens.error_description || 'Token exchange failed')
    }

    // Decode the id_token to get user info (it's a JWT)
    const idToken = tokens.id_token
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString())

    const microsoftEmail = payload.email || payload.preferred_username
    if (!microsoftEmail) {
      throw new Error('No email in Microsoft token')
    }

    // Look up user in your Supabase users table
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select(
        'id, email, role, is_active, first_name, last_name, preferred_first_name, preferred_last_name'
      )
      .eq('email', microsoftEmail.toLowerCase())
      .single()

    if (userError || !user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=not_authorized`
      )
    }

    if (!user.is_active) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=account_inactive`
      )
    }

    // Create session
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

    await supabaseAdmin.from('sessions').insert({
      user_id: user.id,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
      ip_address: request.headers.get('x-forwarded-for') || null,
      user_agent: request.headers.get('user-agent') || null,
    })

    const sessionToken = await createSessionToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        preferred_first_name: user.preferred_first_name,
        preferred_last_name: user.preferred_last_name,
      },
      sessionId
    )

    // Set cookie and redirect
    const { name, options } = getSessionCookieOptions()
    const userRole = (user.role || '').toLowerCase()
    const redirectTo = ADMIN_ROLES.includes(userRole as any)
      ? '/admin/dashboard'
      : '/agent/dashboard'

    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${redirectTo}`)
    response.cookies.set(name, sessionToken, options)

    return response
  } catch (error) {
    console.error('Microsoft auth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=server_error`)
  }
}
