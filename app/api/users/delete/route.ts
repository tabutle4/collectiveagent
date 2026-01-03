import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { userId: targetUserId, requestingUserId } = body

    if (!targetUserId || !requestingUserId) {
      return NextResponse.json(
        { error: 'User ID and requesting user ID are required' },
        { status: 400 }
      )
    }

    // Verify requesting user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', requestingUserId)
      .single()

    // Check role (simple string, not array)
    if (userError || userData?.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Check if user is a prospect (has prospect_status)
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('prospect_status, role')
      .eq('id', targetUserId)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Only allow deleting prospects (users with prospect_status)
    // Don't allow deleting active agents or admins
    if (!targetUser.prospect_status && targetUser.role) {
      return NextResponse.json(
        { error: 'Cannot delete active users. Only prospective agents can be deleted.' },
        { status: 400 }
      )
    }

    // Delete the user
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', targetUserId)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    })

  } catch (error: any) {
    console.error('Error in delete user API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    )
  }
}

