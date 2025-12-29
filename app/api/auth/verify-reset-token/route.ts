import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required', valid: false },
        { status: 400 }
      )
    }

    // Find user by reset token
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, reset_token_expires')
      .eq('reset_token', token)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token', valid: false },
        { status: 400 }
      )
    }

    // Check if token is expired
    const expiryDate = new Date(user.reset_token_expires)
    if (expiryDate < new Date()) {
      return NextResponse.json(
        { error: 'Reset token has expired', valid: false },
        { status: 400 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Token verification error:', error)
    return NextResponse.json(
      { error: 'An error occurred while verifying the token', valid: false },
      { status: 500 }
    )
  }
}
