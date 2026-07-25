import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { getActiveAdmins, preferredDisplayName } from '@/lib/agent-email'
import {
  parseMentions,
  writeInAppNotification,
  buildMentionEmail,
  sendNotificationEmail,
} from '@/lib/agent-email-notifications'
import { fetchAgentContext } from '@/lib/agent-email-context'

export const dynamic = 'force-dynamic'

// GET - List notes for a thread.
// Gated by can_view_agent_email.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const notes = await fetchAllRows<{
      id: string
      body: string
      mentioned_user_ids: string[] | null
      is_system: boolean
      created_at: string
      created_by_user_id: string | null
    }>(
      'email_thread_notes',
      'id, body, mentioned_user_ids, is_system, created_at, created_by_user_id',
      {
        filters: [{ type: 'eq', column: 'thread_id', value: threadId }],
        orderBy: { column: 'created_at', ascending: true },
      }
    )
    return NextResponse.json({ notes })
  } catch (err: any) {
    console.error('notes GET error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load notes' }, { status: 500 })
  }
}

// POST - Add a note. Parses @mentions and notifies mentioned admins.
// Body: { body: string }
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
    const noteBody = String(body?.body || '').trim()
    if (!noteBody) return NextResponse.json({ error: 'Note body is required' }, { status: 400 })

    // Parse @mentions against active admins
    const admins = await getActiveAdmins()
    const mentionedIds = await parseMentions(noteBody, admins)

    const { data: inserted, error } = await supabaseAdmin
      .from('email_thread_notes')
      .insert({
        thread_id: threadId,
        body: noteBody,
        mentioned_user_ids: mentionedIds.length > 0 ? mentionedIds : null,
        is_system: false,
        created_by_user_id: auth.user.id,
      })
      .select('id')
      .single()
    if (error) throw error

    // Bump the thread's updated_at so this note counts as recent activity.
    // The stale-assignment cron uses updated_at to decide when an assignment
    // has been idle for 48 hours; without this bump, adding notes wouldn't
    // count as "the assignee is on it" and the thread could revert to New
    // even though someone was actively working.
    await supabaseAdmin
      .from('email_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId)

    // Notify mentioned admins (skip self-mentions)
    const actorName = preferredDisplayName(auth.user as any)

    // Load thread + agent for context in the email
    const { data: thread } = await supabaseAdmin
      .from('email_threads')
      .select('id, subject, agent_user_id')
      .eq('id', threadId)
      .maybeSingle()
    const agentCtx = thread ? await fetchAgentContext(thread.agent_user_id) : null
    const agentName = agentCtx?.name || 'the agent'

    for (const mentionedId of mentionedIds) {
      if (mentionedId === auth.user.id) continue
      const target = admins.find(a => a.id === mentionedId)
      if (!target) continue

      // In-app
      await writeInAppNotification({
        userId: mentionedId,
        threadId,
        kind: 'mentioned',
        actorUserId: auth.user.id,
        body: `${actorName} mentioned you in a note. "${noteBody.slice(0, 200)}"`,
      })

      // Email (best-effort)
      try {
        const email = buildMentionEmail({
          actorName,
          actorEmail: auth.user.email,
          recipientEmail: target.email,
          agentName,
          threadId,
          threadSubject: (thread?.subject as string) || null,
          noteBody,
        })
        await sendNotificationEmail({
          fromUpn: auth.user.email,
          to: target.email,
          subject: email.subject,
          html: email.html,
        })
      } catch (e) {
        console.error('mention email failed (non-fatal):', e)
      }
    }

    return NextResponse.json({ success: true, id: inserted.id, mentionedCount: mentionedIds.length })
  } catch (err: any) {
    console.error('notes POST error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to add note' }, { status: 500 })
  }
}
