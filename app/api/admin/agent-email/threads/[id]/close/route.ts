import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { preferredDisplayName, insertSystemNote } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// POST - Close a thread. Records who closed it and when.
// Auto-reopen (via webhook on new inbound) still applies afterwards.
// Gated by can_manage_agent_email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('email_threads')
      .update({
        status: 'closed',
        closed_at: now,
        closed_by_user_id: auth.user.id,
        waiting_on_user_id: null,
        updated_at: now,
      })
      .eq('id', threadId)
    if (error) throw error

    await insertSystemNote(
      threadId,
      `${preferredDisplayName(auth.user as any)} closed this thread.`
    )
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('close route error:', err)
    return NextResponse.json({ error: err?.message || 'Close failed' }, { status: 500 })
  }
}
