import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { ThreadStatus, THREAD_STATUSES, ThreadView, preferredDisplayName } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// GET - List threads with filters.
// Query params:
//   screen=triage|my_work|oversight   (Phase 3 primary filter)
//   view=my|all       (legacy; kept for compatibility)
//   status=<status>   (optional; one of THREAD_STATUSES)
//   limit=<n>         (default 100, max 500)
//
// Screen semantics:
//   triage    = unassigned, not closed (the shared to-sort pile)
//   my_work   = assigned to me or waiting on me, not closed
//   oversight = assigned to anyone, not closed (grouped client-side)
//
// Gated by can_view_agent_email.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const screen = searchParams.get('screen') as 'triage' | 'my_work' | 'oversight' | null
    const view: ThreadView = (searchParams.get('view') as ThreadView) === 'my' ? 'my' : 'all'
    const statusFilter = searchParams.get('status') as ThreadStatus | null
    const limitRaw = parseInt(searchParams.get('limit') || '100', 10)
    const limit = Math.max(1, Math.min(500, isNaN(limitRaw) ? 100 : limitRaw))

    if (statusFilter && !THREAD_STATUSES.includes(statusFilter)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('email_threads')
      .select(
        `id, subject, status, last_message_at, last_message_direction,
         assigned_to_user_id, waiting_on_user_id, agent_user_id, updated_at, created_at`
      )
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (screen === 'triage') {
      query = query.is('assigned_to_user_id', null).neq('status', 'closed')
    } else if (screen === 'my_work') {
      query = query
        .or(`assigned_to_user_id.eq.${auth.user.id},waiting_on_user_id.eq.${auth.user.id}`)
        .neq('status', 'closed')
    } else if (screen === 'oversight') {
      query = query.not('assigned_to_user_id', 'is', null).neq('status', 'closed')
    } else if (view === 'my') {
      // Legacy path
      query = query.or(
        `assigned_to_user_id.eq.${auth.user.id},waiting_on_user_id.eq.${auth.user.id}`
      )
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data: threads, error } = await query
    if (error) throw error

    if (!threads || threads.length === 0) {
      return NextResponse.json({ threads: [], counts: await getCounts(auth.user.id) })
    }

    // Enrich with agent + assignee display info (fetch once, not per-thread).
    const agentIds = new Set<string>()
    const userIds = new Set<string>()
    for (const t of threads) {
      if (t.agent_user_id) agentIds.add(t.agent_user_id)
      if (t.assigned_to_user_id) userIds.add(t.assigned_to_user_id)
      if (t.waiting_on_user_id) userIds.add(t.waiting_on_user_id)
    }
    const allIds = Array.from(new Set([...agentIds, ...userIds]))

    let usersById = new Map<
      string,
      {
        id: string
        email: string
        first_name: string | null
        last_name: string | null
        preferred_first_name: string | null
        preferred_last_name: string | null
        role: string | null
      }
    >()
    if (allIds.length > 0) {
      // Use fetchAllRows because allIds can theoretically exceed 1000.
      const users = await fetchAllRows<{
        id: string
        email: string
        first_name: string | null
        last_name: string | null
        preferred_first_name: string | null
        preferred_last_name: string | null
        role: string | null
      }>(
        'users',
        'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role',
        {
          filters: [{ type: 'in', column: 'id', value: allIds }],
        }
      )
      usersById = new Map(users.map(u => [u.id, u]))
    }

    // Snippet: most recent inbound message body preview.
    const threadIds = threads.map(t => t.id)
    let snippetByThread = new Map<string, string>()
    if (threadIds.length > 0) {
      const { data: snippetRows } = await supabaseAdmin
        .from('email_thread_messages')
        .select('thread_id, body_text, body_html, direction, received_at, sent_at')
        .in('thread_id', threadIds)
        .order('received_at', { ascending: false, nullsFirst: false })
        .limit(500)
      if (snippetRows) {
        for (const row of snippetRows) {
          if (snippetByThread.has(row.thread_id)) continue
          const raw =
            (row.body_text as string | null) ||
            stripHtml((row.body_html as string | null) || '') ||
            ''
          snippetByThread.set(row.thread_id, raw.slice(0, 200))
        }
      }
    }

    const enriched = threads.map(t => {
      const agent = t.agent_user_id ? usersById.get(t.agent_user_id) : null
      const assignee = t.assigned_to_user_id ? usersById.get(t.assigned_to_user_id) : null
      const waitingOn = t.waiting_on_user_id ? usersById.get(t.waiting_on_user_id) : null
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        last_message_at: t.last_message_at,
        last_message_direction: t.last_message_direction,
        updated_at: t.updated_at,
        created_at: t.created_at,
        agent: agent
          ? {
              id: agent.id,
              email: agent.email,
              name: preferredDisplayName(agent),
              role: agent.role,
            }
          : null,
        assignee: assignee
          ? { id: assignee.id, name: preferredDisplayName(assignee), email: assignee.email }
          : null,
        waiting_on: waitingOn
          ? {
              id: waitingOn.id,
              name: preferredDisplayName(waitingOn),
              email: waitingOn.email,
            }
          : null,
        snippet: snippetByThread.get(t.id) || '',
      }
    })

    return NextResponse.json({
      threads: enriched,
      counts: await getCounts(auth.user.id),
    })
  } catch (err: any) {
    console.error('threads list error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load threads' }, { status: 500 })
  }
}

// Counts for the filter rail.
async function getCounts(userId: string): Promise<{
  all: number
  new: number
  in_progress: number
  waiting_on_agent: number
  waiting_on_admin: number
  closed: number
  mine: number
}> {
  const counts = {
    all: 0,
    new: 0,
    in_progress: 0,
    waiting_on_agent: 0,
    waiting_on_admin: 0,
    closed: 0,
    mine: 0,
  }

  const { data, error } = await supabaseAdmin
    .from('email_threads')
    .select('status, assigned_to_user_id, waiting_on_user_id')
  if (error || !data) return counts

  for (const row of data) {
    const s = row.status as ThreadStatus
    counts.all += 1
    if (s === 'new') counts.new += 1
    else if (s === 'in_progress') counts.in_progress += 1
    else if (s === 'waiting_on_agent') counts.waiting_on_agent += 1
    else if (s === 'waiting_on_admin') counts.waiting_on_admin += 1
    else if (s === 'closed') counts.closed += 1

    if (row.assigned_to_user_id === userId || row.waiting_on_user_id === userId) {
      counts.mine += 1
    }
  }
  return counts
}

// Extremely lightweight HTML-to-text conversion for snippet display.
function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
