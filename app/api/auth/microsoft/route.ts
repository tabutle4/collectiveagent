import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createSessionToken, getSessionCookieOptions } from '@/lib/session'
import { randomUUID } from 'crypto'

const MICROSOFT_TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
const CLIENT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ID
const CLIENT_SECRET = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`

export async function GET(request: NextRequest) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email',
    state: randomUUID(),
  })

  return NextResponse.redirect(
    `${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`
  )
}