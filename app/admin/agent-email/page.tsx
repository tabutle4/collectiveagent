'use client'

/**
 * Agent Email Dashboard, Phase 3 shell.
 *
 * Three screens as top tabs, each scoped to exactly what that job needs:
 *   Triage    - the shared to-sort pile with AI suggestions, Accept/Adjust/Skip
 *   My Work   - threads assigned or escalated to me, reply from here
 *   Oversight - everyone's assignments grouped by person, aging highlighted
 *
 * Plus a Templates link (manager lives at /admin/agent-email/templates) and
 * a small settings control for the default screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox,
  ListChecks,
  Users,
  Settings,
  FileText,
  RefreshCcw,
  DownloadCloud,
  ChevronRight,
  ChevronDown,
  Check,
  SlidersHorizontal,
  SkipForward,
  Sparkles,
  X,
  Send,
  Hand,
} from 'lucide-react'
import {
  Admin,
  ThreadListItem,
  AiSuggestion,
  Template,
  ScreenKey,
  STATUS_META,
  Modal,
  AgingDot,
  ConfidenceDot,
  formatRelative,
  initials,
} from '@/components/agent-email/shared'
import MyWorkScreen, { AssignEscalateModal } from '@/components/agent-email/MyWorkScreen'

export default function AgentEmailDashboardPage() {
  const [screen, setScreen] = useState<ScreenKey | null>(null)
  const [defaultScreen, setDefaultScreen] = useState<ScreenKey>('triage')
  const [admins, setAdmins] = useState<Admin[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [tagsDefaults, setTagsDefaults] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [counts, setCounts] = useState<{ triage: number; my_work: number; oversight: number }>({
    triage: 0,
    my_work: 0,
    oversight: 0,
  })
  const [initialThreadId, setInitialThreadId] = useState<string | null>(null)

  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null)
  const toastTimerRef = useRef<any>(null)
  const flashToast = useCallback((text: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    setToast({ text, tone })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])

  // Boot: prefs, admins, templates, tags, deep link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const threadParam = params.get('thread')
    const screenParam = params.get('screen') as ScreenKey | null

    fetch('/api/admin/agent-email/prefs', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        const ds: ScreenKey =
          j?.prefs?.defaultScreen === 'my_work' || j?.prefs?.defaultScreen === 'oversight'
            ? j.prefs.defaultScreen
            : 'triage'
        setDefaultScreen(ds)
        if (threadParam) {
          // Deep link from a notification email: open the thread in My Work.
          setInitialThreadId(threadParam)
          setScreen('my_work')
        } else if (screenParam === 'triage' || screenParam === 'my_work' || screenParam === 'oversight') {
          setScreen(screenParam)
        } else {
          setScreen(ds)
        }
      })
      .catch(() => setScreen('triage'))

    fetch('/api/admin/agent-email/admins', { credentials: 'include' })
      .then(r => r.json())
      .then(j => setAdmins(j.admins || []))
      .catch(() => {})
    fetch('/api/admin/agent-email/templates', { credentials: 'include' })
      .then(r => r.json())
      .then(j => setTemplates(j.templates || []))
      .catch(() => {})
    fetch('/api/admin/agent-email/tags', { credentials: 'include' })
      .then(r => r.json())
      .then(j => setTagsDefaults(j.defaults || []))
      .catch(() => {})
  }, [])

  const refreshCounts = useCallback(async () => {
    try {
      const [t, m, o] = await Promise.all([
        fetch('/api/admin/agent-email/threads?screen=triage&limit=500', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/agent-email/threads?screen=my_work&limit=500', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/agent-email/threads?screen=oversight&limit=500', { credentials: 'include' }).then(r => r.json()),
      ])
      setCounts({
        triage: (t.threads || []).length,
        my_work: (m.threads || []).length,
        oversight: (o.threads || []).length,
      })
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    refreshCounts()
    const t = setInterval(refreshCounts, 60_000)
    return () => clearInterval(t)
  }, [refreshCounts])

  const saveDefaultScreen = useCallback(
    async (ds: ScreenKey) => {
      const res = await fetch('/api/admin/agent-email/prefs', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultScreen: ds }),
      })
      const json = await res.json()
      if (!res.ok) {
        flashToast(json?.error || 'Save failed', 'error')
        return
      }
      setDefaultScreen(ds)
      flashToast(`Default screen saved.`, 'ok')
    },
    [flashToast]
  )

  const TABS: Array<{ key: ScreenKey; label: string; icon: any; count: number; help: string }> = [
    { key: 'triage', label: 'Triage', icon: Inbox, count: counts.triage, help: 'Sort the shared pile' },
    { key: 'my_work', label: 'My Work', icon: ListChecks, count: counts.my_work, help: 'Reply to what is yours' },
    { key: 'oversight', label: 'Oversight', icon: Users, count: counts.oversight, help: 'See where everything stands' },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#EBEBEB]">
      {/* TOP TABS */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-luxury-gray-4 flex-shrink-0">
        {TABS.map(t => {
          const Icon = t.icon
          const active = screen === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setScreen(t.key)}
              title={t.help}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium ${
                active
                  ? 'bg-luxury-gray-1 text-white'
                  : 'text-luxury-gray-2 hover:bg-luxury-gray-5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              <span
                className={`text-[10.5px] tabular-nums px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-white bg-opacity-20' : 'bg-luxury-gray-5 text-luxury-gray-3'
                }`}
              >
                {t.count}
              </span>
            </button>
          )
        })}
        <div className="flex-1" />
        <a
          href="/admin/agent-email/templates"
          className="flex items-center gap-1 text-[12px] text-luxury-gray-3 hover:text-luxury-gray-1 px-2 py-1"
          title="Manage reply templates"
        >
          <FileText className="h-3.5 w-3.5" />
          Templates
        </a>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-luxury-gray-3 hover:text-luxury-gray-1 p-1.5"
          title="Dashboard settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* SCREEN */}
      <div className="flex-1 min-h-0">
        {screen === 'triage' && (
          <TriageScreen admins={admins} flashToast={flashToast} onChanged={refreshCounts} />
        )}
        {screen === 'my_work' && (
          <MyWorkScreen
            admins={admins}
            templates={templates}
            tagsDefaults={tagsDefaults}
            flashToast={flashToast}
            initialThreadId={initialThreadId}
          />
        )}
        {screen === 'oversight' && (
          <OversightScreen admins={admins} flashToast={flashToast} onChanged={refreshCounts} />
        )}
        {screen === null && (
          <div className="h-full flex items-center justify-center text-sm text-luxury-gray-3">Loading...</div>
        )}
      </div>

      {/* SETTINGS */}
      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} title="Dashboard settings">
          <label className="block text-[11px] uppercase tracking-wider text-luxury-gray-3 font-medium mb-2">
            Screen that opens by default
          </label>
          <div className="rounded-lg bg-luxury-gray-5 p-1 flex gap-1 text-sm">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => saveDefaultScreen(t.key)}
                className={`flex-1 py-2 rounded-md font-medium ${
                  defaultScreen === t.key
                    ? 'bg-white text-luxury-gray-1 shadow-sm'
                    : 'text-luxury-gray-3 hover:text-luxury-gray-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-luxury-gray-3 italic mt-2">
            Which screen you land on when you open the dashboard. You can always switch with the tabs.
          </p>
        </Modal>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-md ${
            toast.tone === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : toast.tone === 'warn'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-teal-50 text-teal-800 border border-teal-200'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SCREEN 1: TRIAGE
// ═══════════════════════════════════════════════════════════════════════

interface ExpandedInfo {
  loading: boolean
  lastMessage: { from: string; when: string | null; text: string } | null
  agentFacts: string[]
}

function TriageScreen({
  admins,
  flashToast,
  onChanged,
}: {
  admins: Admin[]
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
  onChanged: () => void
}) {
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<Record<string, AiSuggestion>>({})
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedInfo, setExpandedInfo] = useState<ExpandedInfo | null>(null)
  const [adjustFor, setAdjustFor] = useState<ThreadListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [backfillState, setBackfillState] = useState<'idle' | 'running'>('idle')
  const pollRef = useRef<any>(null)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/agent-email/threads?screen=triage&limit=200', {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load')
      setThreads(json.threads || [])
    } catch (e: any) {
      flashToast(e?.message || 'Failed to load triage pile', 'error')
    } finally {
      setLoading(false)
    }
  }, [flashToast])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  // Fetch AI suggestions in batches; poll while any are pending.
  const fetchSuggestions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      const res = await fetch('/api/admin/agent-email/ai/suggestions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadIds: ids }),
      })
      const json = await res.json()
      if (res.ok) {
        setSuggestions(prev => ({ ...prev, ...(json.suggestions || {}) }))
        setPendingIds(json.pending || [])
      }
    } catch {
      // non-fatal; rows show without AI
    }
  }, [])

  useEffect(() => {
    const ids = threads.map(t => t.id)
    if (ids.length > 0) fetchSuggestions(ids)
  }, [threads, fetchSuggestions])

  useEffect(() => {
    if (pendingIds.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => fetchSuggestions(pendingIds), 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pendingIds, fetchSuggestions])

  const loadExpanded = useCallback(async (thread: ThreadListItem) => {
    setExpandedInfo({ loading: true, lastMessage: null, agentFacts: [] })
    try {
      const [detailRes, ctxRes] = await Promise.all([
        fetch(`/api/admin/agent-email/threads/${thread.id}`, { credentials: 'include' }),
        fetch(`/api/admin/agent-email/threads/${thread.id}/agent-context`, { credentials: 'include' }),
      ])
      const detail = await detailRes.json()
      const ctxJson = await ctxRes.json()

      let lastMessage: ExpandedInfo['lastMessage'] = null
      if (detailRes.ok && Array.isArray(detail?.messages)) {
        const inbound = [...detail.messages].reverse().find((m: any) => m.direction === 'inbound')
        if (inbound) {
          lastMessage = {
            from: inbound.from_name || inbound.from_address || '',
            when: inbound.received_at || inbound.sent_at || null,
            text:
              (inbound.body_text as string) ||
              String(inbound.body_html || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
          }
        }
      }

      const facts: string[] = []
      const c = ctxJson?.context
      if (ctxRes.ok && c) {
        facts.push(`${c.name}${c.role ? ` , ${c.role}` : ''}${c.office ? ` , ${c.office}` : ''}`)
        if (c.commission_plan) facts.push(`Plan: ${c.commission_plan}`)
        const flags: string[] = []
        if (c.monthly_fee_status === 'past_due') flags.push('Monthly fee PAST DUE')
        if (c.unpaid_invoice_count > 0) flags.push(`${c.unpaid_invoice_count} unpaid invoice${c.unpaid_invoice_count === 1 ? '' : 's'}`)
        if (c.open_deals > 0) flags.push(`${c.open_deals} open deal${c.open_deals === 1 ? '' : 's'}`)
        if (flags.length > 0) facts.push(flags.join(' , '))
      }

      setExpandedInfo({ loading: false, lastMessage, agentFacts: facts })
    } catch {
      setExpandedInfo({ loading: false, lastMessage: null, agentFacts: [] })
    }
  }, [])

  const toggleExpand = useCallback(
    (thread: ThreadListItem) => {
      if (expandedId === thread.id) {
        setExpandedId(null)
        setExpandedInfo(null)
      } else {
        setExpandedId(thread.id)
        loadExpanded(thread)
      }
    },
    [expandedId, loadExpanded]
  )

  const slideOff = useCallback(
    (threadId: string) => {
      setLeavingIds(prev => new Set(prev).add(threadId))
      setTimeout(() => {
        setThreads(prev => prev.filter(t => t.id !== threadId))
        setLeavingIds(prev => {
          const next = new Set(prev)
          next.delete(threadId)
          return next
        })
        if (expandedId === threadId) {
          setExpandedId(null)
          setExpandedInfo(null)
        }
        onChanged()
      }, 250)
    },
    [expandedId, onChanged]
  )

  const acceptSuggestion = useCallback(
    async (thread: ThreadListItem) => {
      const s = suggestions[thread.id]
      if (!s || (!s.suggestedAssigneeUserId && !s.suggestedTag)) {
        flashToast('No AI suggestion yet for this one. Use Adjust.', 'warn')
        return
      }
      setBusyId(thread.id)
      try {
        if (s.suggestedTag) {
          await fetch(`/api/admin/agent-email/threads/${thread.id}/tags`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: s.suggestedTag }),
          })
        }
        if (s.suggestedAssigneeUserId) {
          const res = await fetch(`/api/admin/agent-email/threads/${thread.id}/assign`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toUserId: s.suggestedAssigneeUserId,
              note: `Accepted AI triage suggestion. ${s.assigneeReason || ''}`.trim(),
            }),
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error || 'Assign failed')
        }
        flashToast(
          s.suggestedAssigneeUserId
            ? `Sent to ${s.suggestedAssigneeName || 'assignee'}.`
            : 'Tagged.',
          'ok'
        )
        slideOff(thread.id)
      } catch (e: any) {
        flashToast(e?.message || 'Accept failed', 'error')
      } finally {
        setBusyId(null)
      }
    },
    [suggestions, flashToast, slideOff]
  )

  // Keyboard: j/k navigate, Enter expand, y accept, a adjust, s skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (adjustFor) return
      if (threads.length === 0) return
      if (e.key === 'j') {
        setCursor(c => Math.min(c + 1, threads.length - 1))
      } else if (e.key === 'k') {
        setCursor(c => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        const t = threads[cursor]
        if (t) toggleExpand(t)
      } else if (e.key === 'y') {
        const t = threads[cursor]
        if (t) acceptSuggestion(t)
      } else if (e.key === 'a') {
        const t = threads[cursor]
        if (t) setAdjustFor(t)
      } else if (e.key === 's') {
        setCursor(c => Math.min(c + 1, threads.length - 1))
      } else if (e.key === 'Escape') {
        setExpandedId(null)
        setExpandedInfo(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [threads, cursor, adjustFor, toggleExpand, acceptSuggestion])

  const runBackfill = useCallback(
    async (hours: number) => {
      if (backfillState === 'running') return
      const label = hours === 24 ? '24 hours' : hours === 72 ? '3 days' : '7 days'
      if (!confirm(`Backfill agent emails from the last ${label}? Existing threads will not be duplicated.`)) return
      setBackfillState('running')
      try {
        const res = await fetch(`/api/admin/agent-email/backfill?hours=${hours}`, {
          method: 'POST',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Backfill failed')
        const total = json?.report?.totalIngested ?? 0
        flashToast(`Backfill complete. ${total} new message${total === 1 ? '' : 's'} ingested.`, 'ok')
        await loadThreads()
        onChanged()
      } catch (e: any) {
        flashToast(`Backfill failed: ${e?.message || 'unknown error'}`, 'error')
      } finally {
        setBackfillState('idle')
      }
    },
    [backfillState, flashToast, loadThreads, onChanged]
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[16px] font-semibold text-luxury-gray-1">
              {loading ? 'Loading the pile...' : threads.length === 0 ? 'Pile is clear' : `${threads.length} to sort`}
            </h1>
            <p className="text-[11.5px] text-luxury-gray-3 italic mt-0.5">
              Accept applies the AI tag and hand-off in one click. Expand a row to read before deciding. Keys: j k move, Enter expand, y accept, a adjust, s skip.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadThreads}
              className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Refresh
            </button>
            <div className="relative group">
              <button
                type="button"
                disabled={backfillState === 'running'}
                className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1 disabled:opacity-50"
              >
                <DownloadCloud className="h-3.5 w-3.5" />
                {backfillState === 'running' ? 'Backfilling...' : 'Backfill'}
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border border-luxury-gray-4 rounded-md shadow-lg z-10 min-w-[140px]">
                {[24, 72, 168].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => runBackfill(h)}
                    disabled={backfillState === 'running'}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-luxury-gray-5 disabled:opacity-50 whitespace-nowrap"
                  >
                    Last {h === 24 ? '24 hours' : h === 72 ? '3 days' : '7 days'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {!loading && threads.length === 0 && (
          <div className="bg-white border border-luxury-gray-4 rounded-lg p-8 text-center">
            <div className="text-sm font-medium text-luxury-gray-1 mb-1">Nothing waiting to be sorted</div>
            <div className="text-xs text-luxury-gray-3">
              New agent emails land here for tagging and hand-off. Check My Work for what is already yours.
            </div>
          </div>
        )}

        <div className="space-y-2">
          {threads.map((t, i) => {
            const s = suggestions[t.id]
            const expanded = expandedId === t.id
            const leaving = leavingIds.has(t.id)
            const focused = i === cursor
            return (
              <div
                key={t.id}
                className={`bg-white border rounded-lg overflow-hidden transition-all duration-250 ${
                  leaving ? 'opacity-0 translate-x-6' : 'opacity-100'
                } ${focused ? 'border-[#C5A278] shadow-sm' : 'border-luxury-gray-4'}`}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(t)}
                    className="mt-0.5 text-luxury-gray-3 hover:text-luxury-gray-1 flex-shrink-0"
                    title={expanded ? 'Collapse' : 'Read the message'}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <AgingDot iso={t.last_message_at} />
                      <span className="text-[13px] font-medium text-luxury-gray-1 truncate">
                        {t.agent?.name || t.agent?.email || 'Unknown agent'}
                      </span>
                      <span className="text-[11px] text-luxury-gray-3 flex-shrink-0">
                        {formatRelative(t.last_message_at)}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-luxury-gray-1 truncate">{t.subject || '(no subject)'}</div>
                    {s?.summary ? (
                      <div className="flex items-center gap-1.5 mt-1 text-[12px] text-luxury-gray-2">
                        <Sparkles className="h-3 w-3 text-[#C5A278] flex-shrink-0" />
                        <span className="truncate">{s.summary}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1 text-[12px] text-luxury-gray-3 italic">
                        <Sparkles className="h-3 w-3 animate-pulse flex-shrink-0" />
                        Reading this one...
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {s?.suggestedTag && (
                        <span className="inline-flex items-center gap-1 bg-luxury-gray-5 text-luxury-gray-2 text-[10.5px] px-2 py-0.5 rounded">
                          <ConfidenceDot level={s.tagConfidence} />
                          {s.suggestedTag}
                        </span>
                      )}
                      {s?.suggestedAssigneeName && (
                        <span className="inline-flex items-center gap-1 bg-[#F0E7D6] text-[#5f4324] text-[10.5px] px-2 py-0.5 rounded">
                          <ConfidenceDot level={s.assigneeConfidence} />
                          {'>'} {s.suggestedAssigneeName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => acceptSuggestion(t)}
                      disabled={busyId === t.id || !s?.suggestedAssigneeUserId}
                      className="text-[12px] px-3 py-1.5 rounded-md bg-luxury-gray-1 text-white hover:bg-luxury-gray-2 disabled:opacity-40 flex items-center gap-1"
                      title="Apply the AI tag and hand-off"
                    >
                      <Check className="h-3 w-3" /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustFor(t)}
                      className="text-[12px] px-3 py-1.5 rounded-md border border-luxury-gray-4 hover:bg-luxury-gray-5 flex items-center gap-1"
                      title="Pick a different tag or person"
                    >
                      <SlidersHorizontal className="h-3 w-3" /> Adjust
                    </button>
                    <button
                      type="button"
                      onClick={() => setCursor(Math.min(i + 1, threads.length - 1))}
                      className="text-[12px] px-2 py-1.5 rounded-md text-luxury-gray-3 hover:bg-luxury-gray-5"
                      title="Leave it in the pile and move on"
                    >
                      <SkipForward className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-luxury-gray-5 bg-luxury-gray-5 bg-opacity-40 px-11 py-3">
                    {expandedInfo?.loading && (
                      <div className="text-[12px] text-luxury-gray-3 italic">Loading message...</div>
                    )}
                    {!expandedInfo?.loading && expandedInfo?.agentFacts && expandedInfo.agentFacts.length > 0 && (
                      <div className="text-[11.5px] text-luxury-gray-3 mb-2">
                        {expandedInfo.agentFacts.join('  |  ')}
                      </div>
                    )}
                    {!expandedInfo?.loading && s?.assigneeReason && (
                      <div className="flex items-start gap-1.5 text-[11.5px] text-[#5f4324] bg-[#F0E7D6] border border-[#E4D0A9] rounded px-2.5 py-1.5 mb-2">
                        <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{s.assigneeReason}</span>
                      </div>
                    )}
                    {!expandedInfo?.loading && expandedInfo?.lastMessage && (
                      <div className="bg-white border border-luxury-gray-4 rounded-md p-3">
                        <div className="text-[11px] text-luxury-gray-3 mb-1.5">
                          {expandedInfo.lastMessage.from}
                          {expandedInfo.lastMessage.when ? ` , ${formatRelative(expandedInfo.lastMessage.when)}` : ''}
                        </div>
                        <div className="text-[12.5px] text-luxury-gray-1 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                          {expandedInfo.lastMessage.text}
                        </div>
                      </div>
                    )}
                    {!expandedInfo?.loading && !expandedInfo?.lastMessage && (
                      <div className="text-[12px] text-luxury-gray-3 italic">No message body found.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {adjustFor && (
        <AdjustModal
          thread={adjustFor}
          suggestion={suggestions[adjustFor.id] || null}
          admins={admins}
          onClose={() => setAdjustFor(null)}
          onDone={async () => {
            const id = adjustFor.id
            setAdjustFor(null)
            slideOff(id)
          }}
          flashToast={flashToast}
        />
      )}
    </div>
  )
}

function AdjustModal({
  thread,
  suggestion,
  admins,
  onClose,
  onDone,
  flashToast,
}: {
  thread: ThreadListItem
  suggestion: AiSuggestion | null
  admins: Admin[]
  onClose: () => void
  onDone: () => Promise<void>
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
}) {
  const [tag, setTag] = useState(suggestion?.suggestedTag || '')
  const [assigneeId, setAssigneeId] = useState(suggestion?.suggestedAssigneeUserId || '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!assigneeId) {
      flashToast('Pick who this goes to.', 'warn')
      return
    }
    setBusy(true)
    try {
      const cleanTag = tag.trim().toLowerCase()
      if (cleanTag) {
        await fetch(`/api/admin/agent-email/threads/${thread.id}/tags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: cleanTag }),
        })
      }
      const res = await fetch(`/api/admin/agent-email/threads/${thread.id}/assign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: assigneeId,
          note: note.trim() || 'Triaged from the shared pile.',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Assign failed')
      flashToast('Sorted.', 'ok')
      await onDone()
    } catch (e: any) {
      flashToast(e?.message || 'Adjust failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Sort this thread">
      <div className="text-[12px] text-luxury-gray-3 mb-3 truncate">
        {thread.agent?.name || 'Agent'} , {thread.subject || '(no subject)'}
      </div>
      <div className="mb-3">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">Tag</label>
        <input
          type="text"
          value={tag}
          onChange={e => setTag(e.target.value.toLowerCase())}
          placeholder="billing, license, transaction, systems, general..."
          className="w-full text-[13px] px-3 py-2 border border-luxury-gray-4 rounded-md"
        />
      </div>
      <div className="mb-3">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">Hand off to</label>
        <div className="border border-luxury-gray-4 rounded-md max-h-[180px] overflow-y-auto">
          {admins.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAssigneeId(a.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px] border-b border-luxury-gray-5 last:border-0 ${
                assigneeId === a.id ? 'bg-[#F0E7D6]' : 'hover:bg-luxury-gray-5'
              }`}
            >
              <div className="h-6 w-6 rounded-full bg-luxury-gray-5 flex items-center justify-center text-[10px] font-semibold text-luxury-gray-2 flex-shrink-0">
                {initials(a.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-luxury-gray-1">{a.name}</div>
              </div>
              <div className="text-[10px] uppercase text-luxury-gray-3 tracking-wide">{a.role || ''}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything they should know"
          className="w-full text-[13px] px-3 py-2 border border-luxury-gray-4 rounded-md"
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
          className="text-[13px] px-4 py-2 bg-luxury-gray-1 text-white rounded hover:bg-luxury-gray-2 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SCREEN 3: OVERSIGHT
// ═══════════════════════════════════════════════════════════════════════

function OversightScreen({
  admins,
  flashToast,
  onChanged,
}: {
  admins: Admin[]
  flashToast: (text: string, tone?: 'ok' | 'warn' | 'error') => void
  onChanged: () => void
}) {
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<Record<string, AiSuggestion>>({})
  const [reassignFor, setReassignFor] = useState<ThreadListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/agent-email/threads?screen=oversight&limit=300', {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load')
      const list: ThreadListItem[] = json.threads || []
      setThreads(list)
      // Summaries only: reuse the cached AI suggestions, no forced generation
      // beyond what the endpoint does per call.
      if (list.length > 0) {
        fetch('/api/admin/agent-email/ai/suggestions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadIds: list.map(t => t.id) }),
        })
          .then(r => r.json())
          .then(j => setSuggestions(prev => ({ ...prev, ...(j.suggestions || {}) })))
          .catch(() => {})
      }
    } catch (e: any) {
      flashToast(e?.message || 'Failed to load oversight', 'error')
    } finally {
      setLoading(false)
    }
  }, [flashToast])

  useEffect(() => {
    load()
  }, [load])

  const nudge = useCallback(
    async (thread: ThreadListItem) => {
      if (!thread.assignee) return
      setBusyId(thread.id)
      try {
        const firstName = thread.assignee.name.split(/\s+/)[0]
        const res = await fetch(`/api/admin/agent-email/threads/${thread.id}/notes`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: `@${firstName} nudge from oversight: checking in on this one. Where does it stand?`,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Nudge failed')
        flashToast(`Nudged ${thread.assignee.name}. They got an email.`, 'ok')
      } catch (e: any) {
        flashToast(e?.message || 'Nudge failed', 'error')
      } finally {
        setBusyId(null)
      }
    },
    [flashToast]
  )

  const takeOver = useCallback(
    async (thread: ThreadListItem) => {
      if (!confirm(`Take over this thread from ${thread.assignee?.name || 'the current assignee'}?`)) return
      setBusyId(thread.id)
      try {
        // Find self: the admins list includes everyone; the server enforces
        // identity, we just need own id. Fetch prefs? Simpler: the assign
        // route uses toUserId; we get own id from the admins list by asking
        // the server who we are via the threads my_work trick is heavy.
        // Cleanest available: /api/admin/agent-email/prefs does not return
        // id, so use a dedicated lightweight call to admins and match is not
        // possible without id. We use the me endpoint below.
        const meRes = await fetch('/api/session', { credentials: 'include' })
        const meJson = await meRes.json().catch(() => null)
        const myId = meJson?.user?.id
        if (!myId) throw new Error('Could not resolve your user id')
        const res = await fetch(`/api/admin/agent-email/threads/${thread.id}/assign`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId: myId, note: 'Taking over from oversight.' }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Take over failed')
        flashToast('It is yours now. Find it in My Work.', 'ok')
        await load()
        onChanged()
      } catch (e: any) {
        flashToast(e?.message || 'Take over failed', 'error')
      } finally {
        setBusyId(null)
      }
    },
    [flashToast, load, onChanged]
  )

  // Group by assignee
  const groups = useMemo(() => {
    const byAssignee = new Map<string, { name: string; threads: ThreadListItem[] }>()
    for (const t of threads) {
      const key = t.assignee?.id || 'unknown'
      const name = t.assignee?.name || 'Unknown'
      if (!byAssignee.has(key)) byAssignee.set(key, { name, threads: [] })
      byAssignee.get(key)!.threads.push(t)
    }
    return Array.from(byAssignee.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.threads.length - a.threads.length)
  }, [threads])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[16px] font-semibold text-luxury-gray-1">
              {loading ? 'Loading...' : `${threads.length} in flight across ${groups.length} ${groups.length === 1 ? 'person' : 'people'}`}
            </h1>
            <p className="text-[11.5px] text-luxury-gray-3 italic mt-0.5">
              Yellow dot: quiet for a day. Red dot: quiet for two. Nudge sends them a note and an email; take over moves it to your desk.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 flex items-center gap-1"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {!loading && threads.length === 0 && (
          <div className="bg-white border border-luxury-gray-4 rounded-lg p-8 text-center">
            <div className="text-sm font-medium text-luxury-gray-1 mb-1">Nothing in flight</div>
            <div className="text-xs text-luxury-gray-3">
              Once threads get assigned, this is where you watch them move.
            </div>
          </div>
        )}

        {groups.map(g => (
          <div key={g.id} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full bg-luxury-gray-5 flex items-center justify-center text-[10px] font-semibold text-luxury-gray-2">
                {initials(g.name)}
              </div>
              <span className="text-[13px] font-medium text-luxury-gray-1">{g.name}</span>
              <span className="text-[11px] text-luxury-gray-3">
                {g.threads.length} thread{g.threads.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-1.5">
              {g.threads.map(t => {
                const m = STATUS_META[t.status]
                const s = suggestions[t.id]
                return (
                  <div
                    key={t.id}
                    className="bg-white border border-luxury-gray-4 rounded-lg px-4 py-2.5 flex items-center gap-3"
                  >
                    <AgingDot iso={t.updated_at} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-medium text-luxury-gray-1 truncate">
                          {t.agent?.name || 'Unknown agent'}
                        </span>
                        <span className="text-[12px] text-luxury-gray-3 truncate">
                          {t.subject || '(no subject)'}
                        </span>
                      </div>
                      {s?.summary && (
                        <div className="text-[11.5px] text-luxury-gray-3 truncate mt-0.5">{s.summary}</div>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border flex-shrink-0 ${m.pillClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${m.dotClass}`} />
                      {m.label}
                    </span>
                    <span className="text-[10.5px] text-luxury-gray-3 flex-shrink-0 w-16 text-right">
                      {formatRelative(t.last_message_at)}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => nudge(t)}
                        disabled={busyId === t.id || !t.assignee}
                        className="text-[11px] px-2 py-1 rounded border border-luxury-gray-4 hover:bg-luxury-gray-5 disabled:opacity-40 flex items-center gap-1"
                        title="Send them a checking-in note and email"
                      >
                        <Send className="h-2.5 w-2.5" /> Nudge
                      </button>
                      <button
                        type="button"
                        onClick={() => setReassignFor(t)}
                        disabled={busyId === t.id}
                        className="text-[11px] px-2 py-1 rounded border border-luxury-gray-4 hover:bg-luxury-gray-5 disabled:opacity-40"
                        title="Move it to someone else"
                      >
                        Reassign
                      </button>
                      <button
                        type="button"
                        onClick={() => takeOver(t)}
                        disabled={busyId === t.id}
                        className="text-[11px] px-2 py-1 rounded border border-luxury-gray-4 hover:bg-luxury-gray-5 disabled:opacity-40 flex items-center gap-1"
                        title="Assign it to yourself"
                      >
                        <Hand className="h-2.5 w-2.5" /> Take over
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {reassignFor && (
        <AssignEscalateModal
          mode="assign"
          threadId={reassignFor.id}
          admins={admins}
          currentAssigneeId={reassignFor.assignee?.id || null}
          onClose={() => setReassignFor(null)}
          onDone={async () => {
            setReassignFor(null)
            flashToast('Reassigned.', 'ok')
            await load()
            onChanged()
          }}
          flashToast={flashToast}
        />
      )}
    </div>
  )
}
