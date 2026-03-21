import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      email,
      password,
      first_name,
      last_name,
      preferred_first_name,
      preferred_last_name,
      roles,
      is_active,
    } = await request.json()

    if (
      !email ||
      !password ||
      !first_name ||
      !last_name ||
      !preferred_first_name ||
      !preferred_last_name
    ) {
      return NextResponse.json(
        { error: 'Email, password, and all name fields are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        first_name,
        last_name,
        preferred_first_name,
        preferred_last_name,
        roles: (roles || ['agent']).map((r: string) => r.toLowerCase()),
        role: (roles || ['agent']).some((r: string) => r.toLowerCase() === 'admin')
          ? 'Admin'
          : 'Agent',
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single()

    if (insertError) {
      console.error('User creation error:', insertError)
      throw insertError
    }

    const { password_hash: _, reset_token, reset_token_expires, ...userData } = newUser

    return NextResponse.json({
      user: userData,
      message: 'User created successfully',
    })
  } catch (error: any) {
    console.error('User creation error:', error)
    return NextResponse.json(
      { error: error?.message || 'An error occurred during user creation' },
      { status: 500 }
    )
  }
}
