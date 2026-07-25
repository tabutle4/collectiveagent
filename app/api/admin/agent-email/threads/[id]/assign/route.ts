import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  preferredDisplayName,
  getActiveAdmins,
  insertSystemNote,
} from '@/lib/agent-email'
import {
  fetchAgentContext,
  contextToEmailLines,
} from '@/lib/agent-email-context'
import {
  buildAssignmentEmail,
  sendNotificationEmail,
  writeInAppNotification,
} from '@/lib/agent-email-notifications'

export const dynamic = 'force-dynamic'

// POST - Assign a thread to another admin (non-urgent hand-off).
// Body: { toUserId: string, note: string }
// Preserves current status. Notifies via email + in-app.
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

    // Update thread (preserve status, just move ownership)
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

    // In-app notification
    await writeInAppNotification({
      userId: toUserId,
      threadId,
      kind: 'assigned',
      actorUserId: auth.user.id,
      body: `${actorName} handed this off to you. "${note}"`,
    })

    // Email notification (best-effort, does not fail the request)
    try {
      const ctx = await fetchAgentContext(thread.agent_user_id)
      const agentName = ctx?.name || 'the agent'
      const agentContextLines = ctx ? contextToEmailLines(ctx) : []

      const { data: latestMsg } = await supabaseAdmin
        .from('email_thread_messages')
        .select('body_text, body_html, subject')
        .eq('thread_id', threadId)
        .eq('direction', 'inbound')
        .order('received_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      const preview =
        (latestMsg?.body_text as string) ||
        stripHtml((latestMsg?.body_html as string) || '') ||
        ''

      const email = buildAssignmentEmail({
        actorName,
        actorEmail: auth.user.email,
        recipientEmail: target.email,
        agentName,
        agentContextLines,
        reasonNote: note,
        latestMessagePreview: preview.slice(0, 400),
        threadId,
        threadSubject: thread.subject as string | null,
      })

      await sendNotificationEmail({
        fromUpn: auth.user.email,
        to: target.email,
        subject: email.subject,
        html: email.html,
      })
    } catch (e) {
      console.error('assign email send failed (non-fatal):', e)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('assign route error:', err)
    return NextResponse.json({ error: err?.message || 'Assign failed' }, { status: 500 })
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
