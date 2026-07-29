'use client'

/**
 * Agent Email Dashboard, Screen 2: My Work.
 *
 * Only threads assigned to me or waiting on me. Three panes: thread list,
 * conversation + composer, agent context sidebar. The Reply modal
 * pre-populates with an AI draft written in my voice; I edit and send.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCcw,
  User,
  Reply,
  Flag,
  UserPlus,
  X,
  Circle,
  MessageSquare,
  Tag as TagIcon,
  ChevronDown,
  Send,
  Eye,
  Plus,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import {
  Admin,
  ThreadListItem,
  Template,
  StatusKey,
  STATUS_META,
  Modal,
  AgingDot,
  formatRelative,
  formatFull,
  formatDateShort,
  formatMoney,
  initials,
  htmlToPlain,
  sanitizeEmailHtml,
} from '@/components/agent-email/shared'

interface ThreadDetail {
  thread: {
    id: string
    subject: string | null
    status: StatusKey
    assignee: { id: string; name: string; email: string } | null
    waiting_on: { id: string; name: string; email: string } | null
    last_message_at: string | null
    last_message_direction: 'inbound' | 'outbound' | null
    closed_at: string | null
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

interface AgentContext {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  is_active: boolean
  office: string | null
  division: string | null
  mls_choice: string | null
  license_number: string | null
  license_expiration: string | null
  commission_plan: string | null
  lease_commission_plan: string | null
  monthly_fee_paid_through: string | null
  monthly_fee_status: 'current' | 'past_due' | 'unknown'
  team_name: string | null
  team_lead_name: string | null
  unpaid_invoice_count: number
  unpaid_invoice_total: number
  credits_balance: number
  open_deals: number
  closed_ytd_count: number
  closed_ytd_volume: number
  pending_cda_count: number
  onboarding_complete: boolean
  join_date: string | null
  is_referral: boolean
}

interface Viewer {
  userId: string
  name: string
  activity: string
  heartbeatAt: string
}

export default function MyWorkScreen({
  admins,
  templates,
  tagsDefaults,
  flashToast,
  initialThreadId,
}: {
  admins: Admin[]
  templates: Template[]
  tagsDefaults: string[]
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
  initialThreadId?: string | null
}) {
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId || null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null)
  const [viewers, setViewers] = useState<Viewer[]>([])

  const [replyOpen, setReplyOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [waitingOnPickerOpen, setWaitingOnPickerOpen] = useState<StatusKey | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/agent-email/threads?screen=my_work&limit=200`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load threads')
      setThreads(json.threads || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load threads')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadDetail = useCallback(
    async (id: string) => {
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
        flashToast(e?.message || 'Failed to load thread', 'error')
      } finally {
        setLoadingDetail(false)
      }
    },
    [flashToast]
  )

  const loadAgentContext = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/admin/agent-email/threads/${threadId}/agent-context`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok) setAgentContext(json.context)
      else setAgentContext(null)
    } catch {
      setAgentContext(null)
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId)
      loadAgentContext(selectedId)
    } else {
      setDetail(null)
      setAgentContext(null)
    }
  }, [selectedId, loadDetail, loadAgentContext])

  // Collision heartbeat
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    const beat = async (activity: 'viewing' | 'composing') => {
      try {
        const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/viewers`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity }),
        })
        const json = await res.json()
        if (!cancelled && res.ok) setViewers(json.others || [])
      } catch {
        // ignore
      }
    }
    const activity = replyOpen ? 'composing' : 'viewing'
    beat(activity)
    const t = setInterval(() => beat(activity), 10_000)
    return () => {
      cancelled = true
      clearInterval(t)
      fetch(`/api/admin/agent-email/threads/${selectedId}/viewers`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {})
    }
  }, [selectedId, replyOpen])

  const changeStatus = useCallback(
    async (status: StatusKey, waitingOnUserId?: string) => {
      if (!selectedId) return
      if (status === 'closed') {
        const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/close`, {
          method: 'POST',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) {
          flashToast(json?.error || 'Close failed', 'error')
          return
        }
        flashToast('Thread closed.', 'ok')
      } else {
        const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/status`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, waitingOnUserId }),
        })
        const json = await res.json()
        if (!res.ok) {
          flashToast(json?.error || 'Status change failed', 'error')
          return
        }
        flashToast(`Status set to "${STATUS_META[status].label}".`, 'ok')
      }
      setStatusMenuOpen(false)
      setWaitingOnPickerOpen(null)
      await loadDetail(selectedId)
      await loadList()
    },
    [selectedId, flashToast, loadDetail, loadList]
  )

  const reopenThread = useCallback(async () => {
    if (!selectedId) return
    const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/reopen`, {
      method: 'POST',
      credentials: 'include',
    })
    const json = await res.json()
    if (!res.ok) {
      flashToast(json?.error || 'Reopen failed', 'error')
      return
    }
    flashToast('Thread reopened.', 'ok')
    await loadDetail(selectedId)
    await loadList()
  }, [selectedId, flashToast, loadDetail, loadList])

  const addNote = useCallback(async () => {
    if (!selectedId || !noteInput.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Add note failed', 'error')
        return
      }
      const mentions = json?.mentionedCount || 0
      flashToast(
        mentions > 0
          ? `Note added. Notified ${mentions} teammate${mentions === 1 ? '' : 's'}.`
          : 'Note added.',
        'ok'
      )
      setNoteInput('')
      await loadDetail(selectedId)
    } finally {
      setSavingNote(false)
    }
  }, [selectedId, noteInput, flashToast, loadDetail])

  const addTag = useCallback(
    async (tag: string) => {
      if (!selectedId || !tag) return
      const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/tags`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Add tag failed', 'error')
        return
      }
      setTagInput('')
      setTagPickerOpen(false)
      await loadDetail(selectedId)
    },
    [selectedId, flashToast, loadDetail]
  )

  const removeTag = useCallback(
    async (tag: string) => {
      if (!selectedId) return
      const res = await fetch(`/api/admin/agent-email/threads/${selectedId}/tags`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Remove tag failed', 'error')
        return
      }
      await loadDetail(selectedId)
    },
    [selectedId, flashToast, loadDetail]
  )

  const isClosed = detail?.thread.status === 'closed'
  const meta = detail ? STATUS_META[detail.thread.status] : null

  return (
    <div className="flex h-full">
      {/* THREAD LIST */}
      <section className="w-[340px] border-r border-luxury-gray-4 bg-white overflow-hidden flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-luxury-gray-4">
          <div className="text-[13px] font-semibold text-luxury-gray-1">
            {loadingList ? 'Loading...' : `${threads.length} thread${threads.length === 1 ? '' : 's'} on your desk`}
          </div>
          <button
            type="button"
            onClick={loadList}
            className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded m-3">
              {error}
            </div>
          )}
          {!loadingList && threads.length === 0 && !error && (
            <div className="p-6 text-center">
              <div className="text-sm font-medium text-luxury-gray-1 mb-1">Nothing assigned to you</div>
              <div className="text-xs text-luxury-gray-3 leading-relaxed">
                Threads assigned or escalated to you land here. Check Triage to pick some up.
              </div>
            </div>
          )}
          {threads.map(t => {
            const m = STATUS_META[t.status]
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-luxury-gray-5 ${
                  selectedId === t.id ? 'bg-[#F0E7D6]' : 'hover:bg-luxury-gray-5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[13px] font-medium text-luxury-gray-1 truncate flex items-center gap-1.5">
                    <AgingDot iso={t.updated_at} />
                    {t.agent?.name || t.agent?.email || 'Unknown agent'}
                  </div>
                  <div className="text-[11px] text-luxury-gray-3 flex-shrink-0 ml-2">
                    {formatRelative(t.last_message_at)}
                  </div>
                </div>
                <div className="text-[12.5px] text-luxury-gray-1 truncate mb-1">
                  {t.subject || '(no subject)'}
                </div>
                <div className="text-[12px] text-luxury-gray-3 line-clamp-2 leading-snug mb-1.5">
                  {t.snippet || '(no preview)'}
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border ${m.pillClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dotClass}`} />
                  {m.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* DETAIL */}
      <main className="flex-1 overflow-y-auto bg-white flex">
        {!selectedId && (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="text-center max-w-sm">
              <div className="text-sm font-medium text-luxury-gray-1 mb-1">Pick a thread on the left</div>
              <div className="text-xs text-luxury-gray-3 leading-relaxed">
                Reply, escalate, or hand off from here. The AI drafts a reply in your voice when you open the composer.
              </div>
            </div>
          </div>
        )}
        {selectedId && loadingDetail && (
          <div className="p-8 text-sm text-luxury-gray-3">Loading thread...</div>
        )}
        {selectedId && !loadingDetail && detail && meta && (
          <>
            <div className="flex-1 min-w-0 overflow-y-auto">
              {viewers.length > 0 && (
                <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 text-amber-800 text-xs border-b border-amber-200">
                  <Circle className="h-2 w-2 fill-amber-500 text-amber-500 animate-pulse" />
                  {viewers.length === 1
                    ? `${viewers[0].name} is ${viewers[0].activity} right now. Wait or coordinate first.`
                    : `${viewers.length} others are on this thread right now. Coordinate before acting.`}
                </div>
              )}
              <div className="px-6 py-4 border-b border-luxury-gray-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-medium text-luxury-gray-1 truncate">
                      {detail.thread.subject || '(no subject)'}
                    </h2>
                    <div className="text-[12px] text-luxury-gray-3 mt-1">
                      {detail.agent?.name || detail.agent?.email || 'Unknown agent'}
                      {detail.agent?.email && ` , ${detail.agent.email}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                      className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md border ${meta.pillClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                      {meta.label}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                    {statusMenuOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-luxury-gray-4 rounded-md shadow-lg z-20 min-w-[220px] p-1">
                        {(
                          ['new', 'in_progress', 'waiting_on_agent', 'waiting_on_admin'] as StatusKey[]
                        ).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              if (s === 'waiting_on_admin') {
                                setWaitingOnPickerOpen(s)
                                setStatusMenuOpen(false)
                              } else {
                                changeStatus(s)
                              }
                            }}
                            className="w-full text-left px-2 py-2 hover:bg-luxury-gray-5 rounded"
                          >
                            <div className="flex items-center gap-2 text-[13px] text-luxury-gray-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dotClass}`} />
                              {STATUS_META[s].label}
                            </div>
                            <div className="text-[11px] text-luxury-gray-3 italic mt-0.5 ml-3.5">
                              {STATUS_META[s].help}
                            </div>
                          </button>
                        ))}
                        <div className="border-t border-luxury-gray-5 my-1" />
                        <button
                          type="button"
                          onClick={() => changeStatus('closed')}
                          className="w-full text-left px-2 py-2 hover:bg-luxury-gray-5 rounded"
                        >
                          <div className="flex items-center gap-2 text-[13px] text-luxury-gray-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META.closed.dotClass}`} />
                            {STATUS_META.closed.label}
                          </div>
                          <div className="text-[11px] text-luxury-gray-3 italic mt-0.5 ml-3.5">
                            {STATUS_META.closed.help}
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {detail.thread.assignee && (
                    <span className="text-[11px] text-luxury-gray-3 flex items-center gap-1">
                      <User className="h-3 w-3" /> {detail.thread.assignee.name}
                    </span>
                  )}
                  {detail.thread.waiting_on && (
                    <span className="text-[11px] text-purple-800 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Waiting on {detail.thread.waiting_on.name}
                    </span>
                  )}
                  <div className="flex-1" />

                  {!isClosed && (
                    <>
                      <button
                        type="button"
                        onClick={() => setReplyOpen(true)}
                        className="text-[12px] px-3 py-1.5 rounded-md bg-luxury-gray-1 text-white hover:bg-luxury-gray-2 flex items-center gap-1"
                      >
                        <Reply className="h-3 w-3" /> Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignOpen(true)}
                        className="text-[12px] px-3 py-1.5 rounded-md border border-luxury-gray-4 hover:bg-luxury-gray-5 flex items-center gap-1"
                      >
                        <UserPlus className="h-3 w-3" /> Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => setEscalateOpen(true)}
                        className="text-[12px] px-3 py-1.5 rounded-md bg-[#F0E7D6] text-[#6a3906] border border-[#EAB980] hover:bg-[#EAD9BA] flex items-center gap-1"
                      >
                        <Flag className="h-3 w-3" /> Escalate
                      </button>
                      <button
                        type="button"
                        onClick={() => changeStatus('closed')}
                        className="text-[12px] px-3 py-1.5 rounded-md border border-luxury-gray-4 hover:bg-luxury-gray-5 flex items-center gap-1"
                        title="Nothing needed, mark handled"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Handled
                      </button>
                    </>
                  )}
                  {isClosed && (
                    <button
                      type="button"
                      onClick={reopenThread}
                      className="text-[12px] px-3 py-1.5 rounded-md border border-luxury-gray-4 hover:bg-luxury-gray-5"
                    >
                      Reopen
                    </button>
                  )}
                </div>

                {/* Tags */}
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  {detail.tags.map(t => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 bg-luxury-gray-5 text-luxury-gray-2 text-[10.5px] px-2 py-0.5 rounded"
                    >
                      {t.tag}
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => removeTag(t.tag)}
                          className="text-luxury-gray-3 hover:text-red-800"
                          title="Remove tag"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {!isClosed && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTagPickerOpen(!tagPickerOpen)}
                        className="inline-flex items-center gap-1 border border-dashed border-luxury-gray-4 text-luxury-gray-3 hover:text-luxury-gray-1 hover:border-luxury-gray-3 text-[10.5px] px-2 py-0.5 rounded"
                      >
                        <TagIcon className="h-2.5 w-2.5" /> Add tag
                      </button>
                      {tagPickerOpen && (
                        <div className="absolute left-0 top-full mt-1 bg-white border border-luxury-gray-4 rounded-md shadow-lg z-20 min-w-[200px] p-2">
                          <div className="text-[10px] uppercase text-luxury-gray-3 mb-1">Common</div>
                          {tagsDefaults.map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => addTag(t)}
                              className="w-full text-left text-[12px] px-2 py-1 hover:bg-luxury-gray-5 rounded"
                            >
                              {t}
                            </button>
                          ))}
                          <div className="border-t border-luxury-gray-5 my-2" />
                          <input
                            type="text"
                            placeholder="New tag..."
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value.toLowerCase())}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && tagInput) addTag(tagInput)
                            }}
                            className="w-full text-[12px] px-2 py-1 border border-luxury-gray-4 rounded"
                          />
                          <p className="text-[10px] text-luxury-gray-3 italic mt-1">
                            Lowercase letters, digits, dashes.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 space-y-3">
                {detail.messages.length === 0 && (
                  <div className="text-[13px] text-luxury-gray-3 italic">No messages yet on this thread.</div>
                )}
                {detail.messages.map(m => (
                  <MessageBubble key={m.id} message={m} />
                ))}

                {(detail.notes.length > 0 || !isClosed) && (
                  <div className="pt-4 border-t border-luxury-gray-5 mt-6">
                    <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Internal notes (not visible to the agent)
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
                          {n.author?.name || 'System'} , {formatFull(n.created_at)}
                        </div>
                      </div>
                    ))}
                    {!isClosed && (
                      <>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            placeholder="Add a note or @mention an admin..."
                            value={noteInput}
                            onChange={e => setNoteInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                addNote()
                              }
                            }}
                            className="flex-1 bg-luxury-gray-5 border border-luxury-gray-4 rounded-md px-3 py-2 text-[12.5px]"
                          />
                          <button
                            type="button"
                            onClick={addNote}
                            disabled={savingNote || !noteInput.trim()}
                            className="text-[12px] px-3 py-1.5 rounded-md bg-luxury-gray-1 text-white hover:bg-luxury-gray-2 disabled:opacity-50"
                          >
                            Add note
                          </button>
                        </div>
                        <p className="text-[11px] text-luxury-gray-3 italic mt-1">
                          Notes stay with the thread. Type @firstname to notify a teammate.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <AgentContextSidebar context={agentContext} />

            {replyOpen && (
              <ReplyModal
                threadId={detail.thread.id}
                agentEmail={detail.agent?.email || ''}
                templates={templates}
                onClose={() => setReplyOpen(false)}
                onSent={async () => {
                  setReplyOpen(false)
                  await loadDetail(selectedId!)
                  await loadList()
                  flashToast('Reply sent. Status set to "Waiting on agent".', 'ok')
                }}
                flashToast={flashToast}
              />
            )}
            {assignOpen && (
              <AssignEscalateModal
                mode="assign"
                threadId={detail.thread.id}
                admins={admins}
                currentAssigneeId={detail.thread.assignee?.id || null}
                onClose={() => setAssignOpen(false)}
                onDone={async () => {
                  setAssignOpen(false)
                  setSelectedId(null)
                  await loadList()
                  flashToast('Thread handed off.', 'ok')
                }}
                flashToast={flashToast}
              />
            )}
            {escalateOpen && (
              <AssignEscalateModal
                mode="escalate"
                threadId={detail.thread.id}
                admins={admins}
                currentAssigneeId={detail.thread.assignee?.id || null}
                onClose={() => setEscalateOpen(false)}
                onDone={async () => {
                  setEscalateOpen(false)
                  await loadDetail(selectedId!)
                  await loadList()
                  flashToast('Escalated. They got an email right away.', 'ok')
                }}
                flashToast={flashToast}
              />
            )}
            {waitingOnPickerOpen && (
              <WaitingOnPickerModal
                admins={admins}
                onClose={() => setWaitingOnPickerOpen(null)}
                onPick={async uid => {
                  await changeStatus('waiting_on_admin', uid)
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Reply modal (composer + AI draft + preview) ─────────────────────────

function ReplyModal({
  threadId,
  agentEmail,
  templates,
  onClose,
  onSent,
  flashToast,
}: {
  threadId: string
  agentEmail: string
  templates: Template[]
  onClose: () => void
  onSent: () => Promise<void>
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
}) {
  const [bodyText, setBodyText] = useState('')
  const [step, setStep] = useState<'compose' | 'preview'>('compose')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewMeta, setPreviewMeta] = useState<{
    fromUpn: string
    toAddresses: string[]
    ccAddresses: string[]
    subject: string
    hasSignature: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [draftState, setDraftState] = useState<'loading' | 'ready' | 'none'>('loading')

  // Fetch AI draft on open. Pre-populates the composer only if the user
  // hasn't typed anything yet (never overwrite their words).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/agent-email/ai/draft`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId }),
        })
        const json = await res.json()
        if (cancelled) return
        if (res.ok && json?.draft) {
          setBodyText(prev => (prev.trim() ? prev : json.draft))
          setDraftState('ready')
        } else {
          setDraftState('none')
        }
      } catch {
        if (!cancelled) setDraftState('none')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  const applyTemplate = (t: Template) => {
    setBodyText(htmlToPlain(t.html_content))
  }

  const runPreview = async () => {
    if (!bodyText.trim()) {
      flashToast('Write something before previewing.', 'warn')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/agent-email/threads/${threadId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText, previewOnly: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Preview failed', 'error')
        return
      }
      setPreviewHtml(json?.preview?.html || '')
      setPreviewMeta(json.preview)
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  const runSend = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/agent-email/threads/${threadId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Send failed', 'error')
        return
      }
      await onSent()
    } finally {
      setBusy(false)
    }
  }

  const saveAsTemplate = async () => {
    const name = templateName.trim() || prompt('Template name?')?.trim()
    if (!name) return
    setSavingTemplate(true)
    try {
      const res = await fetch(`/api/admin/agent-email/templates`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subjectLine: 'Reply template', bodyText }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Save template failed', 'error')
        return
      }
      flashToast(`Saved template "${name}".`, 'ok')
      setTemplateName('')
    } finally {
      setSavingTemplate(false)
    }
  }

  return (
    <Modal onClose={onClose} title={step === 'compose' ? 'Reply' : 'Preview and send'} wide>
      {step === 'compose' && (
        <>
          <div className="text-[11px] text-luxury-gray-3 mb-2">To: {agentEmail}</div>
          {draftState === 'loading' && (
            <div className="flex items-center gap-2 text-[12px] text-luxury-gray-3 bg-luxury-gray-5 border border-luxury-gray-4 rounded-md px-3 py-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Drafting a reply in your voice...
            </div>
          )}
          {draftState === 'ready' && (
            <div className="flex items-center gap-2 text-[12px] text-[#5f4324] bg-[#F0E7D6] border border-[#E4D0A9] rounded-md px-3 py-2 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              AI drafted this from the conversation and your writing style. Edit freely; anything in [CHECK: ...] needs your eyes.
            </div>
          )}
          <textarea
            className="w-full min-h-[220px] border border-luxury-gray-4 rounded-md p-3 text-[13.5px] font-sans"
            placeholder={draftState === 'loading' ? 'AI draft incoming...' : 'Write your reply...'}
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
          />
          {templates.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase text-luxury-gray-3 font-medium mb-1">Templates</div>
              <div className="flex flex-wrap gap-1">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-[11px] px-2.5 py-1 bg-luxury-gray-5 hover:bg-luxury-gray-4 rounded-full border border-luxury-gray-4"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] text-luxury-gray-3 italic mt-1">
                Clicking a template replaces the current draft.
              </p>
            </div>
          )}
          <p className="text-[11px] text-luxury-gray-3 italic mt-2">
            Your saved signature is attached automatically. Preview shows the final email before anything sends.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              placeholder="Name to save current as template"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="flex-1 text-[12px] px-2 py-1 border border-luxury-gray-4 rounded"
            />
            <button
              type="button"
              onClick={saveAsTemplate}
              disabled={savingTemplate || !bodyText.trim()}
              className="text-[12px] px-3 py-1.5 border border-luxury-gray-4 rounded hover:bg-luxury-gray-5 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Save as template
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] px-4 py-2 border border-luxury-gray-4 rounded hover:bg-luxury-gray-5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runPreview}
              disabled={busy || !bodyText.trim()}
              className="text-[13px] px-4 py-2 bg-luxury-gray-1 text-white rounded hover:bg-luxury-gray-2 disabled:opacity-50 flex items-center gap-1"
            >
              <Eye className="h-3.5 w-3.5" /> Preview and send
            </button>
          </div>
        </>
      )}
      {step === 'preview' && previewMeta && (
        <>
          <div className="bg-luxury-gray-5 p-4 rounded-lg border border-luxury-gray-4 mb-3">
            <div className="text-[11px] text-luxury-gray-3 mb-2">
              From: {previewMeta.fromUpn} , To: {previewMeta.toAddresses.join(', ')}
              {previewMeta.ccAddresses.length > 0 && ` , Cc: ${previewMeta.ccAddresses.join(', ')}`}
            </div>
            <div className="text-[15px] font-medium text-luxury-gray-1 pb-2 border-b border-luxury-gray-4 mb-3">
              {previewMeta.subject}
            </div>
            <div
              className="text-[13.5px] text-luxury-gray-1 leading-relaxed prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            {!previewMeta.hasSignature && (
              <div className="mt-3 pt-3 border-t border-luxury-gray-4 text-[11px] text-amber-800 italic">
                No saved signature found. The email sends without one. Set one up in your profile if needed.
              </div>
            )}
          </div>
          <p className="text-[11px] text-luxury-gray-3 italic">
            Preview shows exactly what the agent will see. Check the signature and formatting.
          </p>
          <div className="mt-6 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep('compose')}
              className="text-[13px] px-4 py-2 border border-luxury-gray-4 rounded hover:bg-luxury-gray-5"
            >
              Back to edit
            </button>
            <button
              type="button"
              onClick={runSend}
              disabled={busy}
              className="text-[13px] px-4 py-2 bg-luxury-gray-1 text-white rounded hover:bg-luxury-gray-2 disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="h-3.5 w-3.5" /> Send now
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Assign / Escalate modal (exported for Oversight reuse) ───────────────

export function AssignEscalateModal({
  mode,
  threadId,
  admins,
  currentAssigneeId,
  onClose,
  onDone,
  flashToast,
}: {
  mode: 'assign' | 'escalate'
  threadId: string
  admins: Admin[]
  currentAssigneeId: string | null
  onClose: () => void
  onDone: () => Promise<void>
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
}) {
  const [toUserId, setToUserId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isEscalate = mode === 'escalate'
  const submit = async () => {
    if (!toUserId) {
      flashToast('Pick who to send this to.', 'warn')
      return
    }
    if (!note.trim()) {
      flashToast(isEscalate ? 'Say what you need from them.' : 'Say why you are handing this off.', 'warn')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/agent-email/threads/${threadId}/${isEscalate ? 'escalate' : 'assign'}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId, note: note.trim() }),
        }
      )
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || (isEscalate ? 'Escalate failed' : 'Assign failed'), 'error')
        return
      }
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEscalate ? 'Ask for a decision' : 'Hand this thread to someone else'}
      accent={isEscalate ? 'gold' : undefined}
    >
      <p className="text-[12.5px] text-luxury-gray-3 mb-4">
        {isEscalate
          ? 'Status changes to "Waiting on [person]" and they get an email right away.'
          : 'Not urgent, just a better fit for them. Status carries over. They see it in-app; a nudge email goes out only if it sits untouched for a day.'}
      </p>
      <div className="mb-3">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">
          {isEscalate ? 'Escalate to' : 'Assign to'}
        </label>
        <div className="border border-luxury-gray-4 rounded-md max-h-[200px] overflow-y-auto">
          {admins.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setToUserId(a.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px] border-b border-luxury-gray-5 last:border-0 ${
                toUserId === a.id ? 'bg-[#F0E7D6]' : 'hover:bg-luxury-gray-5'
              }`}
            >
              <div className="h-6 w-6 rounded-full bg-luxury-gray-5 flex items-center justify-center text-[10px] font-semibold text-luxury-gray-2 flex-shrink-0">
                {initials(a.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-luxury-gray-1">{a.name}</div>
                <div className="text-[10.5px] text-luxury-gray-3 truncate">{a.email}</div>
              </div>
              <div className="text-[10px] uppercase text-luxury-gray-3 tracking-wide">{a.role || ''}</div>
              {currentAssigneeId === a.id && <span className="text-[10px] text-teal-800">current</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">
          {isEscalate ? 'What do you need from them (required)' : 'Why (required)'}
        </label>
        <textarea
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full border border-luxury-gray-4 rounded-md px-3 py-2 text-[13px]"
          placeholder={
            isEscalate
              ? 'Be specific about the decision. Goes straight into their email.'
              : 'A short reason so they know why you are passing it to them.'
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] px-4 py-2 border border-luxury-gray-4 rounded hover:bg-luxury-gray-5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className={`text-[13px] px-4 py-2 rounded flex items-center gap-1 disabled:opacity-50 ${
            isEscalate
              ? 'bg-[#C5A278] text-white hover:bg-[#B69161]'
              : 'bg-luxury-gray-1 text-white hover:bg-luxury-gray-2'
          }`}
        >
          {isEscalate ? <Flag className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
          {isEscalate ? 'Escalate' : 'Assign'}
        </button>
      </div>
    </Modal>
  )
}

function WaitingOnPickerModal({
  admins,
  onClose,
  onPick,
}: {
  admins: Admin[]
  onClose: () => void
  onPick: (uid: string) => Promise<void>
}) {
  return (
    <Modal onClose={onClose} title="Waiting on which admin?">
      <p className="text-[12.5px] text-luxury-gray-3 mb-3">
        Pick who you are waiting on. They will not get an email (that is what Escalate does).
      </p>
      <div className="border border-luxury-gray-4 rounded-md max-h-[240px] overflow-y-auto">
        {admins.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => onPick(a.id)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px] border-b border-luxury-gray-5 last:border-0 hover:bg-luxury-gray-5"
          >
            <div className="h-6 w-6 rounded-full bg-luxury-gray-5 flex items-center justify-center text-[10px] font-semibold text-luxury-gray-2">
              {initials(a.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-luxury-gray-1">{a.name}</div>
              <div className="text-[10.5px] text-luxury-gray-3 truncate">{a.email}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ─── Agent context sidebar ───────────────────────────────────────────────

function AgentContextSidebar({ context }: { context: AgentContext | null }) {
  return (
    <aside className="w-[280px] border-l border-luxury-gray-4 bg-white overflow-y-auto p-4 flex-shrink-0">
      {!context && (
        <div className="text-[12px] text-luxury-gray-3 italic">Loading agent context...</div>
      )}
      {context && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-full bg-luxury-gray-5 flex items-center justify-center text-luxury-gray-2 text-[11px] font-semibold">
              {initials(context.name)}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-luxury-gray-1 truncate flex items-center gap-1">
                {context.name}
                {context.is_referral && (
                  <span className="text-[9px] bg-[#F0E7D6] text-[#5f4324] px-1.5 py-0.5 rounded-full">RC</span>
                )}
                {context.is_active && (
                  <span className="text-[9px] bg-teal-50 text-teal-800 px-1.5 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <div className="text-[11px] text-luxury-gray-3 truncate">
                {context.role} {context.office ? `, ${context.office}` : ''}
              </div>
            </div>
          </div>
          <KV label="Phone" value={context.phone || '-'} />
          <KV label="Email" value={context.email} />
          {context.division && <KV label="Division" value={context.division} />}
          {context.team_name && (
            <KV
              label="Team"
              value={`${context.team_name}${context.team_lead_name ? ` (${context.team_lead_name})` : ''}`}
            />
          )}

          {(context.license_number || context.mls_choice) && (
            <Section title="Licensing">
              {context.license_number && <KV label="License #" value={context.license_number} />}
              {context.license_expiration && (
                <KV
                  label="Expires"
                  value={formatDateShort(context.license_expiration)}
                  tone={isExpiringSoon(context.license_expiration) ? 'warn' : 'ok'}
                />
              )}
              {context.mls_choice && <KV label="MLS" value={context.mls_choice} />}
            </Section>
          )}

          {(context.commission_plan || context.monthly_fee_status !== 'unknown') && (
            <Section title="Financial">
              {context.commission_plan && <KV label="Plan" value={context.commission_plan} />}
              {context.lease_commission_plan &&
                context.lease_commission_plan !== context.commission_plan && (
                  <KV label="Lease plan" value={context.lease_commission_plan} />
                )}
              {context.monthly_fee_status !== 'unknown' && (
                <KV
                  label="Monthly fee"
                  value={context.monthly_fee_status === 'current' ? 'Current' : 'Past due'}
                  tone={context.monthly_fee_status === 'current' ? 'ok' : 'error'}
                />
              )}
              {context.unpaid_invoice_count > 0 && (
                <KV
                  label="Unpaid"
                  value={`${context.unpaid_invoice_count} - $${context.unpaid_invoice_total.toFixed(2)}`}
                  tone="warn"
                />
              )}
              {context.credits_balance > 0 && (
                <KV label="Credits" value={`$${context.credits_balance.toFixed(2)}`} />
              )}
            </Section>
          )}

          {(context.open_deals > 0 || context.closed_ytd_count > 0 || context.pending_cda_count > 0) && (
            <Section title="Deals">
              {context.open_deals > 0 && <KV label="Open" value={String(context.open_deals)} />}
              {context.closed_ytd_count > 0 && (
                <KV
                  label="Closed YTD"
                  value={`${context.closed_ytd_count} - $${formatMoney(context.closed_ytd_volume)}`}
                />
              )}
              {context.pending_cda_count > 0 && (
                <KV label="Pending CDA" value={String(context.pending_cda_count)} tone="warn" />
              )}
            </Section>
          )}

          <Section title="Onboarding">
            <KV
              label="Status"
              value={context.onboarding_complete ? 'Complete' : 'In progress'}
              tone={context.onboarding_complete ? 'ok' : 'warn'}
            />
            {context.join_date && <KV label="Joined" value={formatDateShort(context.join_date)} />}
          </Section>
        </>
      )}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 pt-3 border-t border-luxury-gray-5">
      <div className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2">{title}</div>
      {children}
    </div>
  )
}

function KV({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'error'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-teal-800'
      : tone === 'warn'
        ? 'text-amber-800'
        : tone === 'error'
          ? 'text-red-800'
          : 'text-luxury-gray-1'
  return (
    <div className="flex justify-between py-1 text-[12px] gap-2">
      <span className="text-luxury-gray-3">{label}</span>
      <span className={`font-medium text-right truncate max-w-[60%] ${toneClass}`}>{value}</span>
    </div>
  )
}

function MessageBubble({ message }: { message: ThreadDetail['messages'][number] }) {
  const isOutbound = message.direction === 'outbound'
  const when = message.received_at || message.sent_at || null
  const bodyHtml = message.body_html ? sanitizeEmailHtml(message.body_html) : null
  const bodyText = message.body_text || ''

  return (
    <div
      className={`border rounded-lg p-3 ${
        isOutbound ? 'bg-luxury-gray-5 border-luxury-gray-4' : 'bg-white border-luxury-gray-4'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12.5px] font-medium text-luxury-gray-1 truncate">
          {message.from_name || message.from_address}
          {isOutbound && message.sent_via_dashboard && (
            <span className="text-[10px] text-luxury-gray-3 font-normal ml-2">via dashboard</span>
          )}
          {isOutbound && !message.sent_via_dashboard && (
            <span className="text-[10px] text-purple-800 font-normal ml-2">sent from Outlook</span>
          )}
        </div>
        <div className="text-[10.5px] text-luxury-gray-3 flex-shrink-0">
          {when ? formatFull(when) : '-'}
        </div>
      </div>
      <div className="text-[10.5px] text-luxury-gray-3 mb-2">
        To: {message.to_addresses.join(', ') || '-'}
        {message.cc_addresses.length > 0 && ' , Cc: ' + message.cc_addresses.join(', ')}
      </div>
      {bodyHtml ? (
        <div
          className="text-[13px] text-luxury-gray-1 leading-relaxed prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        <div className="text-[13px] text-luxury-gray-1 leading-relaxed whitespace-pre-wrap">{bodyText}</div>
      )}
    </div>
  )
}

function isExpiringSoon(iso: string | null): boolean {
  if (!iso) return false
  try {
    const d = new Date(iso).getTime()
    const days = (d - Date.now()) / (24 * 60 * 60 * 1000)
    return days < 60
  } catch {
    return false
  }
}
