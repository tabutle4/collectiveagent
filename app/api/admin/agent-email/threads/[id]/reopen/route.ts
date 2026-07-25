import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { preferredDisplayName, insertSystemNote } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// POST - Manually reopen a closed thread. Status returns to 'in_progress'
// (not 'new'), and assignment/waiting stays as-is.
// Gated by can_manage_agent_email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const { data: thread, error: tErr } = await supabaseAdmin
      .from('email_threads')
      .select('id, status')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    if (thread.status !== 'closed') {
      return NextResponse.json(
        { error: 'Thread is not closed, nothing to reopen' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('email_threads')
      .update({
        status: 'in_progress',
        closed_at: null,
        closed_by_user_id: null,
        updated_at: now,
      })
      .eq('id', threadId)
    if (error) throw error

    await insertSystemNote(
      threadId,
      `${preferredDisplayName(auth.user as any)} reopened this thread.`
    )
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('reopen route error:', err)
    return NextResponse.json({ error: err?.message || 'Reopen failed' }, { status: 500 })
  }
}
