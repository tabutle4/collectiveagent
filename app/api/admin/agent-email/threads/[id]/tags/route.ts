import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Small allowlist of default tags. Additional tags are allowed (create-on-fly).
const DEFAULT_TAGS = ['billing', 'license', 'transaction', 'systems', 'general']

// POST - Add a tag to a thread. Body: { tag: string }
// Gated by can_manage_agent_email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const raw = String(body?.tag || '').trim().toLowerCase()
    // Basic validation: lowercase letters, numbers, hyphens, underscores. 32 char max.
    if (!raw || !/^[a-z0-9_-]{1,32}$/.test(raw)) {
      return NextResponse.json(
        { error: 'Tag must be 1-32 lowercase letters, digits, dashes, or underscores' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin.from('email_thread_tags').insert({
      thread_id: threadId,
      tag: raw,
      created_by_user_id: auth.user.id,
    })
    // Unique violation is fine, means the tag already exists on this thread
    if (error && (error as any).code !== '23505') {
      throw error
    }

    return NextResponse.json({ success: true, tag: raw })
  } catch (err: any) {
    console.error('tag POST error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to add tag' }, { status: 500 })
  }
}

// DELETE - Remove a tag from a thread. Body: { tag: string }
// Gated by can_manage_agent_email.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const raw = String(body?.tag || '').trim().toLowerCase()
    if (!raw) return NextResponse.json({ error: 'Tag is required' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('email_thread_tags')
      .delete()
      .eq('thread_id', threadId)
      .eq('tag', raw)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('tag DELETE error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to remove tag' }, { status: 500 })
  }
}

// Also export the default tag list for the UI to display.
export const DEFAULT_TAG_LIST = DEFAULT_TAGS
