import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      preferred_first_name,
      preferred_last_name,
    } = await request.json()

    // Validation
    if (!email || !password || !first_name || !last_name || !preferred_first_name || !preferred_last_name) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Check if any users exist
    const { data: existingUsers, error: countError } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (countError) {
      throw countError
    }

    // If users exist, don't allow registration
    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'Registration is closed. Please contact an administrator.' },
        { status: 403 }
      )
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      )
    }

    // Hash password
    const password_hash = await hashPassword(password)

    // Create first user with admin role
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        first_name,
        last_name,
        preferred_first_name,
        preferred_last_name,
        role: 'Admin', // First user gets Admin role (simple string, not array)
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    // Remove sensitive data
    const { password_hash: _, reset_token, reset_token_expires, ...userData } = newUser

    return NextResponse.json({
      user: userData,
      message: 'Registration successful',
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    )
  }
}
