import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  // Require can_manage_agents permission to delete users
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { userId: targetUserId } = body

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if user is a prospect (has prospect_status)
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('prospect_status, role, status')
      .eq('id', targetUserId)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only allow deleting prospects or inactive users
    // Don't allow deleting active agents or admins
    if (targetUser.status === 'active' && !targetUser.prospect_status) {
      return NextResponse.json(
        { error: 'Cannot delete active users. Only prospective agents or inactive users can be deleted.' },
        { status: 400 }
      )
    }

    // Delete the user
    const { error: deleteError } = await supabase.from('users').delete().eq('id', targetUserId)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    })
  } catch (error: any) {
    console.error('Error in delete user API:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete user' }, { status: 500 })
  }
}
