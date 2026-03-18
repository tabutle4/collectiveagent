import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyPassword } from '@/lib/auth'
import { createSessionToken, getSessionCookieOptions } from '@/lib/session'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, is_active, password_hash, first_name, last_name, preferred_first_name, preferred_last_name')
      .eq('email', email.toLowerCase())
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account is inactive. Please contact support.' },
        { status: 403 }
      )
    }

    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Create session in database
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)

    await supabaseAdmin.from('sessions').insert({ is_valid: true,
      user_id: user.id,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
      ip_address: request.headers.get('x-forwarded-for') || null,
      user_agent: request.headers.get('user-agent') || null,
    })

    const sessionToken = await createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      preferred_first_name: user.preferred_first_name,
      preferred_last_name: user.preferred_last_name,
    }, sessionId)

    const { name, options } = getSessionCookieOptions()
    const userRole = user.role || ''
    const redirectPath = userRole === 'admin' || userRole === 'broker' || userRole === 'operations' || userRole === 'tc'
      ? '/admin/dashboard'
      : '/agent/dashboard'

    const response = NextResponse.json({
      message: 'Login successful',
      redirectTo: redirectPath,
    })

    response.cookies.set(name, sessionToken, options)
    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}