import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_reset_passwords')
  if (auth.error) return auth.error

  try {
    const { userId, newPassword } = await request.json()

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId and newPassword are required' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Hash the new password
    const password_hash = await hashPassword(newPassword)

    // Update user's password
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ password_hash })
      .eq('id', userId)

    if (updateError) {
      console.error('Error resetting password:', updateError)
      return NextResponse.json(
        { error: 'Failed to reset password', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    })
  } catch (error: any) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'An error occurred while resetting the password', details: error.message },
      { status: 500 }
    )
  }
}
