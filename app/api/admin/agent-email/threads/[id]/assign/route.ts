import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  preferredDisplayName,
  getActiveAdmins,
  insertSystemNote,
} from '@/lib/agent-email'
import { writeInAppNotification } from '@/lib/agent-email-notifications'

export const dynamic = 'force-dynamic'

// POST - Assign a thread to another admin (non-urgent hand-off).
// Body: { toUserId: string, note: string }
//
// Preserves current status. Records an audit row, adds a system note, and
// writes an in-app notification for the target admin.
//
// Phase 2.1 change: no email is sent at assignment time. The target admin
// already received the original email (Reading A guarantees they were on
// To or CC), so an extra email would be noise. If the thread sits with no
// activity from the assignee for 48 hours, the stale-assignments cron
// reverts it to the New bucket where anyone can pick it up.
//
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
    const toUserId = String(body?.toUserId || '').trim()
    const note = String(body?.note || '').trim()

    if (!toUserId) return NextResponse.json({ error: 'toUserId is required' }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'A reason note is required' }, { status: 400 })

    // Verify target user is an active admin
    const admins = await getActiveAdmins()
    const target = admins.find(a => a.id === toUserId)
    if (!target) {
      return NextResponse.json({ error: 'Target user is not an active admin' }, { status: 400 })
    }

    // Load thread
    const { data: thread, error: tErr } = await supabaseAdmin
      .from('email_threads')
      .select('id, subject, agent_user_id, assigned_to_user_id, status')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const now = new Date().toISOString()

    // Audit row
    await supabaseAdmin.from('email_thread_assignments').insert({
      thread_id: threadId,
      assigned_from_user_id: thread.assigned_to_user_id,
      assigned_to_user_id: toUserId,
      reason_note: note,
      is_escalation: false,
      created_by_user_id: auth.user.id,
    })

    // Update thread (preserve status, move ownership, bump updated_at
    // so the stale-assignment cron uses this as the "clock started" point)
    await supabaseAdmin
      .from('email_threads')
      .update({
        assigned_to_user_id: toUserId,
        updated_at: now,
      })
      .eq('id', threadId)

    // System note
    const targetName = preferredDisplayName(target)
    const actorName = preferredDisplayName(auth.user as any)
    await insertSystemNote(
      threadId,
      `${actorName} assigned this thread to ${targetName}. "${note}"`
    )

    // In-app notification (no email; the target already has the original email)
    await writeInAppNotification({
      userId: toUserId,
      threadId,
      kind: 'assigned',
      actorUserId: auth.user.id,
      body: `${actorName} handed this off to you. "${note}"`,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('assign route error:', err)
    return NextResponse.json({ error: err?.message || 'Assign failed' }, { status: 500 })
  }
}
