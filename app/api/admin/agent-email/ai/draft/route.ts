import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { generateReplyDraft } from '@/lib/agent-email-ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST - Get (or generate) an AI reply draft for a thread, in the current
// user's voice. Only produced when the current user is the thread's
// assignee or the person it's waiting on; drafts are for the person doing
// the replying, nobody else.
// Body: { threadId: string }
// Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const threadId = String(body?.threadId || '').trim()
    if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })

    const { data: thread } = await supabaseAdmin
      .from('email_threads')
      .select('id, assigned_to_user_id, waiting_on_user_id, status')
      .eq('id', threadId)
      .maybeSingle()
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const isMine =
      thread.assigned_to_user_id === auth.user.id ||
      thread.waiting_on_user_id === auth.user.id
    if (!isMine) {
      return NextResponse.json(
        { error: 'Drafts are only generated for the assignee of a thread' },
        { status: 403 }
      )
    }

    const result = await generateReplyDraft(threadId, auth.user.id)
    if (!result) {
      return NextResponse.json({ error: 'Draft generation failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true, draft: result.draft, generatedAt: result.generatedAt })
  } catch (err: any) {
    console.error('ai draft route error:', err)
    return NextResponse.json({ error: err?.message || 'Draft failed' }, { status: 500 })
  }
}
