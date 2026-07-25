import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { THREAD_STATUSES, ThreadStatus, preferredDisplayName, insertSystemNote, getActiveAdmins } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// POST - Manually change thread status.
// Body: { status: ThreadStatus, waitingOnUserId?: string }
// If status is 'waiting_on_admin', waitingOnUserId is REQUIRED and must
// be an active admin. Otherwise waitingOnUserId is cleared.
// If status is 'closed', use /close instead (this route rejects it).
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
    const status = String(body?.status || '').trim() as ThreadStatus
    const waitingOnUserId = body?.waitingOnUserId ? String(body.waitingOnUserId).trim() : null

    if (!THREAD_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (status === 'closed') {
      return NextResponse.json({ error: 'Use /close to close a thread' }, { status: 400 })
    }

    if (status === 'waiting_on_admin') {
      if (!waitingOnUserId) {
        return NextResponse.json(
          { error: '"Waiting on admin" requires picking who you\'re waiting on' },
          { status: 400 }
        )
      }
      const admins = await getActiveAdmins()
      if (!admins.some(a => a.id === waitingOnUserId)) {
        return NextResponse.json(
          { error: 'Waiting-on user must be an active admin' },
          { status: 400 }
        )
      }
    }

    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      waiting_on_user_id: status === 'waiting_on_admin' ? waitingOnUserId : null,
      // Clear closed metadata since we already rejected status='closed' above
      closed_at: null,
      closed_by_user_id: null,
    }

    const { error } = await supabaseAdmin.from('email_threads').update(patch).eq('id', threadId)
    if (error) throw error

    const actorName = preferredDisplayName(auth.user as any)
    await insertSystemNote(
      threadId,
      `${actorName} set the status to "${statusLabel(status)}".`
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('status route error:', err)
    return NextResponse.json({ error: err?.message || 'Status change failed' }, { status: 500 })
  }
}

function statusLabel(s: ThreadStatus): string {
  switch (s) {
    case 'new':
      return 'New'
    case 'in_progress':
      return 'In progress'
    case 'waiting_on_agent':
      return 'Waiting on agent'
    case 'waiting_on_admin':
      return 'Waiting on admin'
    case 'closed':
      return 'Closed'
  }
}
