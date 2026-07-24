'use client'

/**
 * Agent Email Dashboard , Phase 1 (READ-ONLY SHELL).
 *
 * This page exists so you can VERIFY that emails from active agents
 * are landing in the DB correctly after ingest goes live. It shows the
 * thread list and a right-side pane with the messages of the selected
 * thread. No reply, no assign, no escalate, no notes, no tags yet ,
 * those ship in Phase 2.
 *
 * Helper text is embedded throughout so the interface teaches itself.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCcw, Filter, Inbox, User, ChevronRight, DownloadCloud } from 'lucide-react'

type StatusKey = 'new' | 'in_progress' | 'waiting_on_agent' | 'waiting_on_admin' | 'closed'

interface ThreadListItem {
  id: string
  subject: string | null
  status: StatusKey
  last_message_at: string | null
  last_message_direction: 'inbound' | 'outbound' | null
  agent: { id: string; email: string; name: string; role: string | null } | null
  assignee: { id: string; name: string; email: string } | null
  waiting_on: { id: string; name: string; email: string } | null
  snippet: string
}

interface Counts {
  all: number
  new: number
  in_progress: number
  waiting_on_agent: number
  waiting_on_admin: number
  closed: number
  mine: number
}

interface ThreadDetail {
  thread: {
    id: string
    subject: string | null
    status: StatusKey
    assignee: { id: string; name: string; email: string } | null
    waiting_on: { id: string; name: string; email: string } | null
    last_message_at: string | null
    last_message_direction: 'inbound' | 'outbound' | null
  }
  agent: {
    id: string
    name: string
    email: string
    role: string | null
    phone: string | null
  } | null
  messages: Array<{
    id: string
    direction: 'inbound' | 'outbound'
    from_address: string
    from_name: string | null
    to_addresses: string[]
    cc_addresses: string[]
    subject: string | null
    body_html: string | null
    body_text: string | null
    received_at: string | null
    sent_at: string | null
    sent_via_dashboard: boolean
    sent_by: { id: string; name: string; email: string } | null
  }>
  notes: Array<{
    id: string
    body: string
    is_system: boolean
    created_at: string
    author: { id: string; name: string; email: string } | null
  }>
  assignments: Array<{
    id: string
    from: { id: string; name: string } | null
    to: { id: string; name: string } | null
    reason_note: string
    is_escalation: boolean
    created_at: string
  }>
  tags: Array<{ id: string; tag: string }>
}

const STATUS_META: Record<
  StatusKey,
  { label: string; pillClass: string; dotClass: string }
> = {
  new: {
    label: 'New',
    pillClass: 'bg-blue-50 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  in_progress: {
    label: 'In progress',
    pillClass: 'bg-teal-50 text-teal-800 border-teal-200',
    dotClass: 'bg-teal-500',
  },
  waiting_on_agent: {
    label: 'Waiting on agent',
    pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  waiting_on_admin: {
    label: 'Waiting on admin',
    pillClass: 'bg-purple-50 text-purple-800 border-purple-200',
    dotClass: 'bg-purple-500',
  },
  closed: {
    label: 'Closed',
    pillClass: 'bg-luxury-gray-5 text-luxury-gray-2 border-luxury-gray-4',
    dotClass: 'bg-luxury-gray-3',
  },
}

const EMPTY_COUNTS: Counts = {
  all: 0,
  new: 0,
  in_progress: 0,
  waiting_on_agent: 0,
  waiting_on_admin: 0,
  closed: 0,
  mine: 0,
}

export default function AgentEmailDashboardPage() {
  const [view, setView] = useState<'my' | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [backfillState, setBackfillState] = useState<'idle' | 'running'>('idle')
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const qp = new URLSearchParams()
      qp.set('view', view)
      if (statusFilter) qp.set('status', statusFilter)
      qp.set('limit', '200')
      const res = await fetch(`/api/admin/agent-email/threads?${qp.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load threads')
      setThreads(json.threads || [])
      setCounts(json.counts || EMPTY_COUNTS)
      // If the selected thread is no longer in the list, clear it.
      if (selectedId && !(json.threads || []).find((t: ThreadListItem) => t.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load threads')
    } finally {
      setLoadingList(false)
    }
  }, [view, statusFilter, selectedId])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/agent-email/threads/${id}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load thread')
      setDetail(json)
    } catch (e: any) {
      setDetail(null)
      alert(e?.message || 'Failed to load thread')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const runBackfill = useCallback(
    async (hours: number) => {
      if (backfillState === 'running') return
      const label = hours === 24 ? '24 hours' : hours === 72 ? '3 days' : `${hours} hours`
      if (!confirm(`Backfill agent emails from the last ${label}? Existing threads will not be duplicated.`)) return
      setBackfillState('running')
      setBackfillMessage(`Running backfill for the last ${label}. This takes a minute...`)
      try {
        const res = await fetch(`/api/admin/agent-email/backfill?hours=${hours}`, {
          method: 'POST',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Backfill failed')
        const total = json?.report?.totalIngested ?? 0
        const errors = (json?.report?.perMailbox || []).reduce(
          (a: number, m: any) => a + (m.errors?.length || 0),
          0
        )
        setBackfillMessage(
          `Backfill complete. ${total} new message${total === 1 ? '' : 's'} ingested` +
            (errors > 0 ? ` (${errors} error${errors === 1 ? '' : 's'} logged in console).` : '.')
        )
        if (errors > 0) console.log('Backfill errors:', JSON.stringify(json.report, null, 2))
        await loadList()
      } catch (e: any) {
        setBackfillMessage(`Backfill failed: ${e?.message || 'unknown error'}`)
      } finally {
        setBackfillState('idle')
      }
    },
    [backfillState, loadList]
  )

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#EBEBEB]">
      {/* LEFT RAIL */}
      <aside className="w-[220px] border-r border-luxury-gray-4 bg-white overflow-y-auto flex-shrink-0">
        <div className="px-3 pt-4 pb-2">
          <div className="rounded-lg bg-luxury-gray-5 p-1 flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setView('my')}
              className={`flex-1 py-1.5 rounded-md font-medium ${
                view === 'my'
                  ? 'bg-white text-luxury-gray-1 shadow-sm'
                  : 'text-luxury-gray-3 hover:text-luxury-gray-2'
              }`}
            >
              My queue
            </button>
            <button
              type="button"
              onClick={() => setView('all')}
              className={`flex-1 py-1.5 rounded-md font-medium ${
                view === 'all'
                  ? 'bg-white text-luxury-gray-1 shadow-sm'
                  : 'text-luxury-gray-3 hover:text-luxury-gray-2'
              }`}
            >
              All queue
            </button>
          </div>
          <p className="text-[10px] text-luxury-gray-3 italic mt-2 leading-snug px-1">
            {view === 'my'
              ? 'Threads assigned or escalated to you.'
              : 'Everything across the team.'}
          </p>
        </div>

        <div className="px-3 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium px-2 pt-2 pb-1">
            Filters
          </div>
          <FilterRow
            active={statusFilter === null}
            onClick={() => setStatusFilter(null)}
            label="Everything"
            count={view === 'my' ? counts.mine : counts.all}
          />
          <FilterRow
            active={statusFilter === 'new'}
            onClick={() => setStatusFilter('new')}
            label="New"
            count={counts.new}
          />
          <FilterRow
            active={statusFilter === 'in_progress'}
            onClick={() => setStatusFilter('in_progress')}
            label="In progress"
            count={counts.in_progress}
          />
          <FilterRow
            active={statusFilter === 'waiting_on_agent'}
            onClick={() => setStatusFilter('waiting_on_agent')}
            label="Waiting on agent"
            count={counts.waiting_on_agent}
          />
          <FilterRow
            active={statusFilter === 'waiting_on_admin'}
            onClick={() => setStatusFilter('waiting_on_admin')}
            label="Waiting on admin"
            count={counts.waiting_on_admin}
          />
          <FilterRow
            active={statusFilter === 'closed'}
            onClick={() => setStatusFilter('closed')}
            label="Closed"
            count={counts.closed}
          />
        </div>

        <div className="mt-6 px-3">
          <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium px-2 pb-1">
            Phase 1
          </div>
          <div className="px-2 py-2 text-[11px] text-luxury-gray-3 italic leading-relaxed">
            Read-only preview. Reply, assign, escalate, notes, and tags land in Phase 2.
          </div>
        </div>
      </aside>

      {/* THREAD LIST */}
      <section className="w-[360px] border-r border-luxury-gray-4 bg-white overflow-hidden flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-luxury-gray-4">
          <div className="flex items-center gap-2 text-luxury-gray-2">
            <Inbox className="h-4 w-4" />
            <h1 className="text-sm font-semibold">Agent Email</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadList}
              className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1"
              title="Refresh"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <div className="relative group">
              <button
                type="button"
                disabled={backfillState === 'running'}
                className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Pull recent agent emails from admin mailboxes"
              >
                <DownloadCloud className="h-3.5 w-3.5" />
                {backfillState === 'running' ? 'Backfilling...' : 'Backfill'}
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border border-luxury-gray-4 rounded-md shadow-lg z-10 min-w-[140px]">
                <button
                  type="button"
                  onClick={() => runBackfill(24)}
                  disabled={backfillState === 'running'}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-luxury-gray-5 disabled:opacity-50"
                >
                  Last 24 hours
                </button>
                <button
                  type="button"
                  onClick={() => runBackfill(72)}
                  disabled={backfillState === 'running'}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-luxury-gray-5 disabled:opacity-50"
                >
                  Last 3 days
                </button>
                <button
                  type="button"
                  onClick={() => runBackfill(168)}
                  disabled={backfillState === 'running'}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-luxury-gray-5 disabled:opacity-50"
                >
                  Last 7 days
                </button>
              </div>
            </div>
          </div>
        </div>
        {backfillMessage && (
          <div className="px-4 py-2 text-[11px] text-luxury-gray-2 bg-[#F0E7D6] border-b border-luxury-gray-4 flex items-center justify-between">
            <span>{backfillMessage}</span>
            <button
              type="button"
              onClick={() => setBackfillMessage(null)}
              className="text-luxury-gray-3 hover:text-luxury-gray-1"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-4 py-2 text-[11px] text-luxury-gray-3 border-b border-luxury-gray-5">
          {loadingList
            ? 'Loading...'
            : `${threads.length} thread${threads.length === 1 ? '' : 's'}${
                statusFilter ? ` · ${STATUS_META[statusFilter].label}` : ''
              }`}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded m-3">
              {error}
            </div>
          )}
          {!loadingList && threads.length === 0 && !error && (
            <div className="p-6 text-center">
              <div className="text-sm font-medium text-luxury-gray-1 mb-1">
                Nothing here yet
              </div>
              <div className="text-xs text-luxury-gray-3 leading-relaxed">
                Once ingest is live and an active agent emails an admin, threads
                will appear here. Try Refresh, or check the reconciliation job
                ran.
              </div>
            </div>
          )}
          {threads.map(t => (
            <ThreadRow
              key={t.id}
              thread={t}
              active={selectedId === t.id}
              onClick={() => setSelectedId(t.id)}
            />
          ))}
        </div>
      </section>

      {/* DETAIL PANE */}
      <main className="flex-1 overflow-y-auto bg-white">
        {!selectedId && (
          <div className="h-full flex items-center justify-center px-8">
            <div className="text-center max-w-sm">
              <div className="text-sm font-medium text-luxury-gray-1 mb-1">
                Pick a thread on the left
              </div>
              <div className="text-xs text-luxury-gray-3 leading-relaxed">
                You'll see the full conversation, agent context, and any system
                notes here. This is Phase 1 (read-only). Reply and hand-off
                arrive in Phase 2.
              </div>
            </div>
          </div>
        )}
        {selectedId && loadingDetail && (
          <div className="p-8 text-sm text-luxury-gray-3">Loading thread...</div>
        )}
        {selectedId && !loadingDetail && detail && <ThreadDetailView detail={detail} />}
      </main>
    </div>
  )
}

// ─── Left rail filter row ────────────────────────────────────────────────

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 text-[13px] rounded-md ${
        active
          ? 'bg-luxury-gray-5 text-luxury-gray-1 font-medium'
          : 'text-luxury-gray-2 hover:bg-luxury-gray-5'
      }`}
    >
      <span>{label}</span>
      <span className="text-[11px] text-luxury-gray-3 tabular-nums">{count}</span>
    </button>
  )
}

// ─── Thread row ──────────────────────────────────────────────────────────

function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: ThreadListItem
  active: boolean
  onClick: () => void
}) {
  const meta = STATUS_META[thread.status]
  const agentName = thread.agent?.name || thread.agent?.email || 'Unknown agent'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-luxury-gray-5 ${
        active ? 'bg-[#F0E7D6]' : 'hover:bg-luxury-gray-5'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] font-medium text-luxury-gray-1 truncate">
          {agentName}
        </div>
        <div className="text-[11px] text-luxury-gray-3 flex-shrink-0 ml-2">
          {formatRelative(thread.last_message_at)}
        </div>
      </div>
      <div className="text-[12.5px] text-luxury-gray-1 truncate mb-1">
        {thread.subject || '(no subject)'}
      </div>
      <div className="text-[12px] text-luxury-gray-3 line-clamp-2 leading-snug mb-1.5">
        {thread.snippet || '(no preview)'}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border ${meta.pillClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
          {meta.label}
        </span>
        {thread.assignee && (
          <span className="text-[10.5px] text-luxury-gray-3">
            → {thread.assignee.name}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Thread detail ───────────────────────────────────────────────────────

function ThreadDetailView({ detail }: { detail: ThreadDetail }) {
  const meta = STATUS_META[detail.thread.status]
  return (
    <div className="flex h-full">
      {/* Messages column */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 py-4 border-b border-luxury-gray-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-medium text-luxury-gray-1 truncate">
                {detail.thread.subject || '(no subject)'}
              </h2>
              <div className="text-[12px] text-luxury-gray-3 mt-1">
                {detail.agent?.name || detail.agent?.email || 'Unknown agent'}
                {detail.agent?.email && ` · ${detail.agent.email}`}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${meta.pillClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
              {meta.label}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {detail.messages.length === 0 && (
            <div className="text-[13px] text-luxury-gray-3 italic">
              No messages yet on this thread.
            </div>
          )}
          {detail.messages.map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {detail.notes.length > 0 && (
            <div className="pt-4 border-t border-luxury-gray-5 mt-6">
              <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2">
                Internal notes (not visible to the agent)
              </div>
              {detail.notes.map(n => (
                <div
                  key={n.id}
                  className={`text-[12.5px] mb-2 p-2 rounded ${
                    n.is_system
                      ? 'bg-[#F0E7D6] text-[#5f4324] border border-[#E4D0A9]'
                      : 'bg-luxury-gray-5 text-luxury-gray-1'
                  }`}
                >
                  <div>{n.body}</div>
                  <div className="text-[10.5px] text-luxury-gray-3 mt-1">
                    {n.author?.name || 'System'} · {formatFull(n.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent context sidebar */}
      <aside className="w-[260px] border-l border-luxury-gray-4 bg-white overflow-y-auto p-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-full bg-luxury-gray-5 flex items-center justify-center text-luxury-gray-2">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-luxury-gray-1 truncate">
              {detail.agent?.name || '(unknown)'}
            </div>
            <div className="text-[11px] text-luxury-gray-3 truncate">
              {detail.agent?.role || 'Agent'}
            </div>
          </div>
        </div>
        <KV label="Email" value={detail.agent?.email || '-'} />
        <KV label="Phone" value={detail.agent?.phone || '-'} />

        {(detail.thread.assignee || detail.thread.waiting_on) && (
          <div className="mt-4 pt-3 border-t border-luxury-gray-5">
            <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2">
              Ownership
            </div>
            {detail.thread.assignee && (
              <KV label="Assigned to" value={detail.thread.assignee.name} />
            )}
            {detail.thread.waiting_on && (
              <KV label="Waiting on" value={detail.thread.waiting_on.name} />
            )}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-luxury-gray-5">
          <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2">
            Full context arrives in Phase 2
          </div>
          <div className="text-[11px] text-luxury-gray-3 italic leading-relaxed">
            Commission plan, license, team, unpaid invoices, deals, and other
            profile fields will appear here once we wire the profile fetch in
            the next phase.
          </div>
        </div>
      </aside>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[12px] gap-2">
      <span className="text-luxury-gray-3">{label}</span>
      <span className="text-luxury-gray-1 font-medium text-right truncate max-w-[60%]">
        {value}
      </span>
    </div>
  )
}

function MessageBubble({
  message,
}: {
  message: ThreadDetail['messages'][number]
}) {
  const isOutbound = message.direction === 'outbound'
  const when = message.received_at || message.sent_at || null
  const bodyHtml = message.body_html || null
  const bodyText = message.body_text || ''

  return (
    <div
      className={`border rounded-lg p-3 ${
        isOutbound
          ? 'bg-luxury-gray-5 border-luxury-gray-4'
          : 'bg-white border-luxury-gray-4'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12.5px] font-medium text-luxury-gray-1 truncate">
          {message.from_name || message.from_address}
          {isOutbound && message.sent_via_dashboard && (
            <span className="text-[10px] text-luxury-gray-3 font-normal ml-2">
              via dashboard
            </span>
          )}
          {isOutbound && !message.sent_via_dashboard && (
            <span className="text-[10px] text-purple-800 font-normal ml-2">
              sent from Outlook
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-luxury-gray-3 flex-shrink-0">
          {when ? formatFull(when) : ','}
        </div>
      </div>
      <div className="text-[10.5px] text-luxury-gray-3 mb-2">
        To: {message.to_addresses.join(', ') || '-'}
        {message.cc_addresses.length > 0 && ' · Cc: ' + message.cc_addresses.join(', ')}
      </div>
      {bodyHtml ? (
        <div
          className="text-[13px] text-luxury-gray-1 leading-relaxed prose-sm max-w-none"
          // Body html comes from Graph. It renders inside our page but does
          // not have access to sensitive tokens. For Phase 1 we render it
          // as-is. Phase 2 will add DOMPurify sanitization for defense in depth.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        <div className="text-[13px] text-luxury-gray-1 leading-relaxed whitespace-pre-wrap">
          {bodyText}
        </div>
      )}
    </div>
  )
}

// ─── Formatters ──────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFull(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
