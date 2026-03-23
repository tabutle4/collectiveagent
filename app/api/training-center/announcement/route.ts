import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch current announcement (public, no auth required)
export async function GET() {
  try {
    const { data: announcement } = await supabase
      .from('training_center_announcements')
      .select(`
        id,
        content,
        created_at,
        created_by,
        users:created_by (first_name, last_name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!announcement) {
      return NextResponse.json({ announcement: null })
    }

    const user = announcement.users as any
    return NextResponse.json({
      announcement: {
        id: announcement.id,
        content: announcement.content,
        created_at: announcement.created_at,
        created_by_name: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
      },
    })
  } catch {
    return NextResponse.json({ announcement: null })
  }
}

// POST - Create or update announcement
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // Check if user has permission (tc, operations, broker, support)
    const allowedRoles = ['tc', 'operations', 'broker', 'support']
    if (!allowedRoles.includes(auth.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { content } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // Deactivate any existing announcements
    await supabase
      .from('training_center_announcements')
      .update({ is_active: false })
      .eq('is_active', true)

    // Create new announcement
    const { data: announcement, error } = await supabase
      .from('training_center_announcements')
      .insert({
        content: content.trim(),
        created_by: auth.user.id,
        is_active: true,
      })
      .select(`
        id,
        content,
        created_at,
        users:created_by (first_name, last_name)
      `)
      .single()

    if (error) throw error

    const user = announcement.users as any
    return NextResponse.json({
      announcement: {
        id: announcement.id,
        content: announcement.content,
        created_at: announcement.created_at,
        created_by_name: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
      },
    })
  } catch (error: any) {
    console.error('Failed to save announcement:', error)
    return NextResponse.json({ error: 'Failed to save announcement' }, { status: 500 })
  }
}

// DELETE - Remove announcement
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // Check if user has permission
    const allowedRoles = ['tc', 'operations', 'broker', 'support']
    if (!allowedRoles.includes(auth.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Deactivate all announcements
    await supabase
      .from('training_center_announcements')
      .update({ is_active: false })
      .eq('is_active', true)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete announcement:', error)
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 })
  }
}