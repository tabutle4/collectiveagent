import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createSessionToken, getSessionCookieOptions } from '@/lib/session'
import { randomUUID } from 'crypto'
import { SESSION_DURATION_MS, ADMIN_ROLES } from '@/lib/constants'
import { encryptMsToken } from '@/lib/microsoft-graph'

const CLIENT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ID
const CLIENT_SECRET = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
const TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.split('/')[3]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  // Parse redirect from state if present
  let customRedirect: string | null = null
  if (state) {
    try {
      const decoded = Buffer.from(state, 'base64url').toString()
      const colonIndex = decoded.indexOf(':')
      if (colonIndex > 0) {
        customRedirect = decoded.substring(colonIndex + 1)
        // Validate it's a safe internal path
        if (!customRedirect.startsWith('/') || customRedirect.includes('//')) {
          customRedirect = null
        }
      }
    } catch {
      // Invalid state, ignore
    }
  }

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

    // oid is the stable Microsoft identity — email can change in Entra
    const oid = payload.oid as string | undefined
    const microsoftEmail = payload.email || payload.preferred_username

    if (!microsoftEmail) {
      throw new Error('No email in Microsoft token')
    }

    const userSelect = 'id, email, role, is_active, status, first_name, last_name, preferred_first_name, preferred_last_name, ms_oid'

    // Look up by oid first (stable), fall back to email for existing users
    let user: any = null
    if (oid) {
      const { data } = await supabaseAdmin
        .from('users')
        .select(userSelect)
        .eq('ms_oid', oid)
        .maybeSingle()
      user = data
    }

    if (!user) {
      const { data } = await supabaseAdmin
        .from('users')
        .select(userSelect)
        .eq('email', microsoftEmail.toLowerCase())
        .maybeSingle()
      user = data
    }

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=not_authorized`
      )
    }

    // Check both is_active AND status
    if (!user.is_active || user.status !== 'active') {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=account_inactive`
      )
    }

    // Store encrypted refresh token for delegated Graph operations (e.g. group calendar writes)
    // Requires MS_TOKEN_ENCRYPTION_KEY env var. Silently skips if key not set.
    if (tokens.refresh_token && process.env.MS_TOKEN_ENCRYPTION_KEY) {
      try {
        const updates: Record<string, string> = {
          ms_refresh_token: encryptMsToken(tokens.refresh_token),
        }
        // Backfill ms_oid if not already stored (stable Microsoft identity key)
        if (oid && !user.ms_oid) {
          updates.ms_oid = oid
        }
        await supabaseAdmin
          .from('users')
          .update(updates)
          .eq('id', user.id)
      } catch (e) {
        console.error('Microsoft callback - failed to store refresh token / ms_oid:', e)
        // Non-fatal: session creation continues
      }
    } else if (oid && !user.ms_oid) {
      // Backfill ms_oid even if no encryption key is set
      supabaseAdmin
        .from('users')
        .update({ ms_oid: oid })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('Microsoft callback - failed to backfill ms_oid:', error)
        })
    }

    // Create session
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

    await supabaseAdmin.from('sessions').insert({
      is_valid: true,
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

    // Determine redirect based on role
    const userRole = (user.role || '').toLowerCase()
    const isAdminRole = ADMIN_ROLES.includes(userRole as any)
    const defaultRedirect = isAdminRole ? '/admin/dashboard' : '/agent/profile'

    // Validate customRedirect matches user's role - don't send agents to /admin or admins to /agent
    let redirectTo = defaultRedirect
    if (customRedirect) {
      const isAdminPath = customRedirect.startsWith('/admin')
      const isAgentPath = customRedirect.startsWith('/agent')
      
      if (isAdminRole && !isAgentPath) {
        // Admin can go to /admin paths or shared paths, but not /agent
        redirectTo = customRedirect
      } else if (!isAdminRole && !isAdminPath) {
        // Agent can go to /agent paths or shared paths, but not /admin
        redirectTo = customRedirect
      }
      // Otherwise use defaultRedirect (role mismatch)
    }

    // Set cookie and redirect
    const { name, options } = getSessionCookieOptions()
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${redirectTo}`)
    response.cookies.set(name, sessionToken, options)
    return response
  } catch (error) {
    console.error('Microsoft auth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=server_error`)
  }
}