import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { preferredDisplayName } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// GET - Thread detail: messages, assignments, notes, tags, agent context.
// Gated by can_view_agent_email.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  const threadId = params.id
  if (!threadId) {
    return NextResponse.json({ error: 'Missing thread id' }, { status: 400 })
  }

  try {
    // Thread row
    const { data: thread, error: threadErr } = await supabaseAdmin
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .maybeSingle()
    if (threadErr) throw threadErr
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    // Messages (chronological asc)
    const messages = await fetchAllRows<{
      id: string
      direction: string
      internet_message_id: string
      from_address: string
      from_name: string | null
      to_addresses: string[] | null
      cc_addresses: string[] | null
      subject: string | null
      body_html: string | null
      body_text: string | null
      received_at: string | null
      sent_at: string | null
      sent_via_dashboard: boolean
      sent_by_user_id: string | null
      has_attachments: boolean
    }>(
      'email_thread_messages',
      'id, direction, internet_message_id, from_address, from_name, to_addresses, cc_addresses, subject, body_html, body_text, received_at, sent_at, sent_via_dashboard, sent_by_user_id, has_attachments',
      {
        filters: [{ type: 'eq', column: 'thread_id', value: threadId }],
        orderBy: { column: 'received_at', ascending: true, nullsFirst: true },
      }
    )
    // Fallback secondary sort by sent_at for outbound (received_at may be null).
    messages.sort((a, b) => {
      const at = a.received_at || a.sent_at || ''
      const bt = b.received_at || b.sent_at || ''
      return at.localeCompare(bt)
    })

    // Notes
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

    // Assignments (audit)
    const assignments = await fetchAllRows<{
      id: string
      assigned_from_user_id: string | null
      assigned_to_user_id: string
      reason_note: string
      is_escalation: boolean
      created_at: string
      created_by_user_id: string | null
    }>(
      'email_thread_assignments',
      'id, assigned_from_user_id, assigned_to_user_id, reason_note, is_escalation, created_at, created_by_user_id',
      {
        filters: [{ type: 'eq', column: 'thread_id', value: threadId }],
        orderBy: { column: 'created_at', ascending: true },
      }
    )

    // Tags
    const { data: tags } = await supabaseAdmin
      .from('email_thread_tags')
      .select('id, tag, created_at, created_by_user_id')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    // Enrich users referenced anywhere
    const userIds = new Set<string>()
    userIds.add(thread.agent_user_id)
    if (thread.assigned_to_user_id) userIds.add(thread.assigned_to_user_id)
    if (thread.waiting_on_user_id) userIds.add(thread.waiting_on_user_id)
    if (thread.closed_by_user_id) userIds.add(thread.closed_by_user_id)
    for (const m of messages) if (m.sent_by_user_id) userIds.add(m.sent_by_user_id)
    for (const n of notes) if (n.created_by_user_id) userIds.add(n.created_by_user_id)
    for (const a of assignments) {
      if (a.assigned_from_user_id) userIds.add(a.assigned_from_user_id)
      if (a.assigned_to_user_id) userIds.add(a.assigned_to_user_id)
      if (a.created_by_user_id) userIds.add(a.created_by_user_id)
    }

    const usersRows = userIds.size
      ? await fetchAllRows<{
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          preferred_first_name: string | null
          preferred_last_name: string | null
          role: string | null
          phone: string | null
        }>(
          'users',
          'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, phone',
          { filters: [{ type: 'in', column: 'id', value: Array.from(userIds) }] }
        )
      : []
    const usersById = new Map(usersRows.map(u => [u.id, u]))

    // Agent context: pull a small set of extra columns from users for the sidebar.
    let agentContext: {
      id: string
      name: string
      email: string
      role: string | null
      phone: string | null
      status?: string | null
    } | null = null
    const agent = usersById.get(thread.agent_user_id)
    if (agent) {
      agentContext = {
        id: agent.id,
        name: preferredDisplayName(agent),
        email: agent.email,
        role: agent.role,
        phone: (agent as any).phone || null,
      }
    }

    const shape = (uid: string | null) => {
      if (!uid) return null
      const u = usersById.get(uid)
      if (!u) return null
      return { id: u.id, name: preferredDisplayName(u), email: u.email, role: u.role }
    }

    return NextResponse.json({
      thread: {
        id: thread.id,
        subject: thread.subject,
        status: thread.status,
        assignee: shape(thread.assigned_to_user_id),
        waiting_on: shape(thread.waiting_on_user_id),
        closed_at: thread.closed_at,
        closed_by: shape(thread.closed_by_user_id),
        last_message_at: thread.last_message_at,
        last_message_direction: thread.last_message_direction,
        graph_conversation_id: thread.graph_conversation_id,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
      },
      agent: agentContext,
      messages: messages.map(m => ({
        id: m.id,
        direction: m.direction,
        from_address: m.from_address,
        from_name: m.from_name,
        to_addresses: m.to_addresses || [],
        cc_addresses: m.cc_addresses || [],
        subject: m.subject,
        body_html: m.body_html,
        body_text: m.body_text,
        received_at: m.received_at,
        sent_at: m.sent_at,
        sent_via_dashboard: m.sent_via_dashboard,
        sent_by: shape(m.sent_by_user_id),
        has_attachments: m.has_attachments,
      })),
      notes: notes.map(n => ({
        id: n.id,
        body: n.body,
        is_system: n.is_system,
        created_at: n.created_at,
        author: shape(n.created_by_user_id),
      })),
      assignments: assignments.map(a => ({
        id: a.id,
        from: shape(a.assigned_from_user_id),
        to: shape(a.assigned_to_user_id),
        reason_note: a.reason_note,
        is_escalation: a.is_escalation,
        created_at: a.created_at,
        by: shape(a.created_by_user_id),
      })),
      tags: (tags || []).map(t => ({ id: t.id, tag: t.tag, created_at: t.created_at })),
    })
  } catch (err: any) {
    console.error('thread detail error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load thread' }, { status: 500 })
  }
}
