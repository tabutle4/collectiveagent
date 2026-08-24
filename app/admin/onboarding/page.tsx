'use client'

/**
 * Ops-facing onboarding tracker - rebuilt on OPEN onboarding_sessions
 * (fully_completed_at IS NULL) joined to users of ANY status. Co-sign flips
 * status to 'active' mid-onboarding, which is why the old active-users list
 * made mid-step agents vanish; open sessions are the real population.
 *
 * This screen shows STATUS and office controls only. The agent-facing W-9
 * step and its copy are untouched - agents keep the check-email
 * instructions; there is no retry UI or auto-check messaging on their side.
 *
 * W-9 status: for agents sitting at the W-9 step this page reads the live
 * Avalara form state (GET /w9/forms/{id}, behind the check_w9_status action)
 * and advances anyone Avalara reports as signed, through the same shared
 * helper the manual Advance past W-9 button uses. A check needs a stored
 * users.w9_form_id, which today no agent has - Send W-9 request is what
 * creates one.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  ExternalLink,
  RotateCcw,
  FileText,
  CheckCircle2,
  Circle,
  RefreshCw,
  Send,
} from 'lucide-react'

const STEP_SHORT_LABELS = ['Info', 'Payment', 'ICA', 'Plan', 'Policy', 'W-9', 'TREC']

const fmtDate = (d: string | null | undefined) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const daysSince = (d: string | null | undefined) => {
  if (!d) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000))
}

// Avalara's IRS name/TIN match status, shown as returned rather than mapped
// through a guessed list. Only the two values worth colouring are matched on,
// case-insensitively: the retired v1 API returned lower case, v2 returns
// 'Matched'. Anything else is real and unrecognised, which is exactly the
// case worth flagging - a failed match in August is a January filing problem.
const tinMatchLabel = (v: string | null | undefined) => (v ? String(v) : 'not reported yet')

const tinMatchClass = (v: string | null | undefined) => {
  const s = String(v || '').toLowerCase()
  if (!s) return 'bg-luxury-gray-5/40 border-luxury-gray-5 text-luxury-gray-2'
  if (s === 'matched') return 'bg-green-50 border-green-200 text-green-800'
  if (s === 'pending') return 'bg-amber-50 border-amber-200 text-amber-800'
  return 'bg-red-50 border-red-200 text-red-800'
}

export default function AdminOnboardingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  // Resolved through the same shared resolver the API gate uses, so the
  // controls on this page match what the routes will actually allow. Role
  // alone is not enough - the app has per-user permission overrides.
  const [permissions, setPermissions] = useState<string[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [adminTasks, setAdminTasks] = useState<any[]>([])
  const [adminCompletions, setAdminCompletions] = useState<Record<string, Record<string, any>>>({})
  // The agent's own 32-item checklist, so the office can tick on their
  // behalf. Expanded per agent to keep the row compact.
  const [checklistItems, setChecklistItems] = useState<any[]>([])
  const [checklistCompletions, setChecklistCompletions] = useState<Record<string, Record<string, any>>>({})
  const [openChecklist, setOpenChecklist] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // Confirm dialog for "Advance past W-9" - the click must not fire the
  // advance (office email + agent email) until the office confirms.
  const [advanceW9Agent, setAdvanceW9Agent] = useState<any | null>(null)
  // Reset-a-step dialog. The route it calls clears onboarding_fee_paid,
  // onboarding_fee_paid_date and ica_signed_at and sends the agent a reset
  // email, so the step is picked from a list and then confirmed.
  const [resetAgent, setResetAgent] = useState<any | null>(null)
  const [resetStep, setResetStep] = useState<number | null>(null)
  // Grant/revoke full app access. Granting emails the office to run the
  // welcome sequence, so it is confirmed in a dialog too.
  const [navAccessAgent, setNavAccessAgent] = useState<any | null>(null)
  // Live Avalara W-9 state per agent, keyed by user id. Held in page state
  // rather than persisted: the only durable W-9 fact is users.w9_form_id,
  // and a status is only ever as fresh as the last read.
  const [w9ById, setW9ById] = useState<Record<string, any>>({})
  // Avalara emails the W-9 request itself, so this one is confirmed too.
  const [sendW9Agent, setSendW9Agent] = useState<any | null>(null)
  // Agents already auto-checked this page load. Without it the effect would
  // re-check on every reload the checks themselves trigger.
  const autoCheckedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { router.push('/auth/login'); return }
        const data = await res.json()
        setUser(data.user)
        setPermissions(Array.isArray(data.permissions) ? data.permissions : [])
      } catch { router.push('/auth/login') }
    }
    fetchUser()
  }, [router])

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setAgents(data.agents || [])
      setAdminTasks(data.adminTasks || [])
      const compMap: Record<string, Record<string, any>> = {}
      for (const c of data.adminTaskCompletions || []) {
        if (!compMap[c.user_id]) compMap[c.user_id] = {}
        compMap[c.user_id][c.task_id] = c
      }
      setAdminCompletions(compMap)
      setChecklistItems(data.checklistItems || [])
      const clMap: Record<string, Record<string, any>> = {}
      for (const c of data.checklistCompletions || []) {
        if (!clMap[c.user_id]) clMap[c.user_id] = {}
        clMap[c.user_id][c.checklist_item_id] = c
      }
      setChecklistCompletions(clMap)
      return data.agents || []
    } catch (e) {
      console.error('Error loading data:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user) { loadData() } }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-agent derived state ────────────────────────────────────────────
  const w9StepFor = (a: any) => (a.is_referral ? 5 : 6)
  const isAtW9 = (a: any) =>
    a.session && a.session.current_step === w9StepFor(a) && !a.w9_completed
  const isAwaitingCoSign = (a: any) => !!a.ica_signed_at && !a.broker_signed_at
  const stepStartedAt = (a: any) => {
    const s = a.session
    if (!s) return null
    const prev = s.current_step - 1
    return (prev >= 1 && s[`step_${prev}_completed_at`]) || s.created_at
  }

  const canManage = permissions.includes('can_manage_onboarding')

  // ── W-9 status, read live from Avalara ─────────────────────────────────
  // One agent at a time. The route answers 200 with a `w9` object whenever
  // the request was valid, including when Avalara is unreachable, so only a
  // non-2xx is treated as a failure of the action itself.
  //
  // When the route advances someone (Avalara reported the form signed) the
  // tracker reloads, because their step, badge and available buttons all
  // change. `auto` only suppresses the alert - a background check must not
  // throw a dialog at someone who did not click anything.
  const checkW9 = useCallback(async (agentId: string, auto = false) => {
    setW9ById(prev => ({
      ...prev,
      [agentId]: { ...(prev[agentId] || {}), loading: true, error: null },
    }))
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_w9_status', user_id: agentId }),
      })
      const d = await res.json()
      if (!res.ok) {
        setW9ById(prev => ({
          ...prev,
          [agentId]: { loading: false, error: d.error || 'Status check failed' },
        }))
        if (!auto) alert(d.error || 'Status check failed')
        return
      }
      const w9 = d.w9 || {}
      setW9ById(prev => ({
        ...prev,
        // Keep the payload's own error: an Avalara lookup that failed comes
        // back 200 with ok:false and a message, and that message is the
        // whole answer.
        [agentId]: { ...w9, loading: false, error: w9.error || null, checked: true },
      }))
      if (w9.advanced) await loadData()
    } catch (e: any) {
      setW9ById(prev => ({
        ...prev,
        [agentId]: { loading: false, error: e?.message || 'Status check failed' },
      }))
      if (!auto) alert(e?.message || 'Status check failed')
    }
  }, [loadData])

  // Auto-check every agent sitting at the W-9 step who has a stored form id.
  // Sequential on purpose: this is a handful of agents against a third-party
  // API, and a burst of parallel reads buys nothing.
  useEffect(() => {
    if (!canManage || !agents.length) return
    const due = agents.filter(
      (a: any) => isAtW9(a) && a.w9_form_id && !autoCheckedRef.current.has(a.id)
    )
    if (!due.length) return
    due.forEach((a: any) => autoCheckedRef.current.add(a.id))
    ;(async () => {
      for (const a of due) await checkW9(a.id, true)
    })()
  }, [agents, canManage, checkW9]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fires only from the send dialog's confirm button. Avalara creates the
  // form, emails the agent, and returns the id we store - which is what
  // makes a later status check possible.
  const sendW9Request = async (a: any) => {
    setSendW9Agent(null)
    setBusy(`w9send-${a.id}`)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_w9_request', user_id: a.id }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Could not send the W-9 request'); return }
      // Clearing the auto-check mark lets the effect read the brand-new
      // form's status once loadData brings back the stored id.
      autoCheckedRef.current.delete(a.id)
      setW9ById(prev => ({ ...prev, [a.id]: { has_form: true } }))
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Could not send the W-9 request')
    } finally {
      setBusy(null)
    }
  }

  // Fires only from the confirm dialog's Advance button - never directly
  // from the row button, which opens the dialog instead.
  const advancePastW9 = async (a: any) => {
    setAdvanceW9Agent(null)
    setBusy(`adv-${a.id}`)
    try {
      const res = await fetch('/api/prospects/advance-past-w9', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: a.id }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Advance failed'); return }
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Advance failed')
    } finally {
      setBusy(null)
    }
  }

  // Fires only from the reset dialog's confirm button. The step comes from
  // a picked option, never a free-text parse: this route clears the
  // onboarding fee flags and the ICA signature and emails the agent.
  const resetAStep = async (a: any, step: number) => {
    setResetAgent(null)
    setResetStep(null)
    setBusy(`reset-${a.id}`)
    try {
      const res = await fetch('/api/prospects/reset-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: a.id, steps: [step] }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Reset failed'); return }
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Reset failed')
    } finally {
      setBusy(null)
    }
  }

  // Grant/revoke full app access. This is the ONLY caller of the route's
  // toggle_nav_access action, which also fires the "send welcome emails"
  // office reminder on grant — removing this control from the tracker would
  // strand new agents with no way to receive access.
  // Fires only from the access dialog's confirm button.
  const toggleNavAccess = async (a: any) => {
    const granting = !a.full_nav_access
    setNavAccessAgent(null)
    setBusy(`nav-${a.id}`)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_nav_access', user_id: a.id, current: a.full_nav_access }),
      })
      if (!res.ok) throw new Error('Failed to update access')
      setAgents(prev => prev.map((x: any) => x.id === a.id ? { ...x, full_nav_access: granting } : x))
    } catch (e: any) { alert(e?.message || 'Failed to update access') } finally { setBusy(null) }
  }

  const toggleAdminTask = async (agentId: string, task: any) => {
    const key = `task-${agentId}-${task.id}`
    if (busy === key) return
    setBusy(key)
    try {
      const isCompleted = !!adminCompletions[agentId]?.[task.id]
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_admin_task',
          user_id: agentId,
          task_id: task.id,
          completing: !isCompleted,
        }),
      })
      if (!res.ok) throw new Error('Failed to toggle task')
      setAdminCompletions(prev => {
        const next = { ...prev, [agentId]: { ...(prev[agentId] || {}) } }
        if (isCompleted) delete next[agentId][task.id]
        else next[agentId][task.id] = { user_id: agentId, task_id: task.id, completed_at: new Date().toISOString(), completed_by: user?.id, notes: null }
        return next
      })
    } catch (e) { console.error(e) } finally { setBusy(null) }
  }

  // Tick an agent's own checklist item on their behalf. Same action the
  // page has always sent; the agent-facing /agent/checklist screen writes
  // the same rows.
  const toggleChecklistItem = async (agentId: string, item: any) => {
    const key = `cl-${agentId}-${item.id}`
    if (busy === key) return
    setBusy(key)
    try {
      const isCompleted = !!checklistCompletions[agentId]?.[item.id]
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_checklist',
          user_id: agentId,
          checklist_item_id: item.id,
          completing: !isCompleted,
        }),
      })
      if (!res.ok) throw new Error('Failed to toggle checklist item')
      setChecklistCompletions(prev => {
        const next = { ...prev, [agentId]: { ...(prev[agentId] || {}) } }
        if (isCompleted) delete next[agentId][item.id]
        else next[agentId][item.id] = { user_id: agentId, checklist_item_id: item.id, completed_at: new Date().toISOString(), completed_by: user?.id }
        return next
      })
    } catch (e: any) { alert(e?.message || 'Failed to toggle checklist item') } finally { setBusy(null) }
  }

  const getName = (a: any) =>
    `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()

  const filtered = agents.filter((a: any) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return getName(a).toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q)
  })

  const counts = {
    open: agents.length,
    atW9: agents.filter(isAtW9).length,
    coSign: agents.filter(isAwaitingCoSign).length,
  }
  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-2">ONBOARDING</h1>

      {/* Header counts line */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <p className="text-xs text-luxury-gray-3">
          {counts.open} open onboarding{counts.open !== 1 ? 's' : ''} · {counts.atW9} waiting at W-9 · {counts.coSign} awaiting co-signature
        </p>
      </div>

      {/* Search */}
      <div className="container-card mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
            className="input-luxury pl-8"
          />
        </div>
      </div>

      {/* Agent cards */}
      <div className="space-y-3">
        {filtered.map((a: any) => {
          const s = a.session || {}
          const currentStep = Math.min(Math.max(s.current_step || 1, 1), 7)
          const atW9 = isAtW9(a)
          const w9 = w9ById[a.id] || {}
          const awaitingCoSign = isAwaitingCoSign(a)
          const postCoSign = !!a.broker_signed_at
          const stuckDays = daysSince(stepStartedAt(a))
          const initials = `${(a.preferred_first_name || a.first_name || '?')[0] || ''}${(a.preferred_last_name || a.last_name || '')[0] || ''}`.toUpperCase()
          const statusLabel = a.status === 'active' ? 'Active user' : a.status === 'prospect' ? 'Prospect' : (a.status || '')
          const variant = a.is_referral ? 'referral' : 'standard'
          const officeTasks = adminTasks.filter(
            (t: any) => !t.agent_variant || t.agent_variant === variant
          )
          const agentTaskCompletions = adminCompletions[a.id] || {}

          return (
            <div key={a.id} className="container-card">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F5EDE2] text-luxury-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-luxury-gray-1">{getName(a)}</p>
                    {atW9 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                        At W-9 · {stuckDays} day{stuckDays !== 1 ? 's' : ''}
                      </span>
                    ) : awaitingCoSign ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#F5EDE2] border border-luxury-accent text-luxury-accent">
                        Awaiting co-signature
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-luxury-gray-5/40 border border-luxury-gray-5 text-luxury-gray-2">
                        Step {currentStep} · {STEP_SHORT_LABELS[currentStep - 1]} · {stuckDays} day{stuckDays !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-luxury-gray-3 truncate">
                    Started {fmtDate(s.created_at)} · {statusLabel}
                    {a.is_referral ? ' · Referral Collective' : ''}
                    {postCoSign && a.broker_signed_at ? ` · Co-signed ${fmtDate(a.broker_signed_at)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                  {atW9 && canManage && a.w9_form_id && (
                    <button
                      onClick={() => checkW9(a.id)}
                      disabled={!!w9.loading}
                      className="btn btn-secondary text-xs px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                      title="Read this agent's W-9 status from Avalara now"
                    >
                      <RefreshCw size={11} /> {w9.loading ? 'Checking...' : 'Check W-9 status'}
                    </button>
                  )}
                  {atW9 && canManage && (
                    <button
                      onClick={() => setSendW9Agent(a)}
                      disabled={busy === `w9send-${a.id}`}
                      className="btn btn-secondary text-xs px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                      title="Have Avalara email this agent a new W-9 request"
                    >
                      <Send size={11} /> {busy === `w9send-${a.id}` ? 'Sending...' : 'Send W-9 request'}
                    </button>
                  )}
                  {atW9 && (
                    <button
                      onClick={() => setAdvanceW9Agent(a)}
                      disabled={busy === `adv-${a.id}`}
                      className="btn btn-secondary text-xs px-2.5 py-1 disabled:opacity-50"
                    >
                      {busy === `adv-${a.id}` ? 'Advancing...' : 'Advance past W-9'}
                    </button>
                  )}
                  {awaitingCoSign && (
                    <a href={`/sign/${a.id}`} className="btn btn-primary text-xs px-2.5 py-1">
                      Open signing page
                    </a>
                  )}
                  <button
                    onClick={() => { setResetAgent(a); setResetStep(null) }}
                    disabled={busy === `reset-${a.id}`}
                    className="btn btn-secondary text-xs px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                    title="Send this agent back to redo an onboarding step"
                  >
                    <RotateCcw size={11} /> {busy === `reset-${a.id}` ? 'Working...' : 'Reset a step'}
                  </button>
                  <a
                    href={`/admin/users/${a.id}`}
                    className="text-luxury-gray-3 hover:text-luxury-gray-1"
                    title="View profile"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <a
                    href={`/admin/audit-trail/${a.id}`}
                    className="text-luxury-gray-3 hover:text-luxury-gray-1"
                    title="Audit trail"
                  >
                    <FileText size={13} />
                  </a>
                </div>
              </div>

              {/* 7-segment progress bar */}
              <div className="mt-3">
                <div className="flex gap-1">
                  {STEP_SHORT_LABELS.map((label, i) => {
                    const stepNum = i + 1
                    const done = stepNum < currentStep
                    const isCurrent = stepNum === currentStep
                    const fill = done
                      ? 'bg-[#C5A278]'
                      : isCurrent
                        ? atW9
                          ? 'bg-amber-400'
                          : 'bg-[#C5A278]'
                        : 'bg-luxury-gray-5'
                    return <div key={label} className={`h-1.5 flex-1 rounded ${fill}`} />
                  })}
                </div>
                <div className="flex gap-1 mt-1">
                  {STEP_SHORT_LABELS.map((label, i) => {
                    const stepNum = i + 1
                    const isCurrent = stepNum === currentStep
                    const cls = isCurrent
                      ? atW9
                        ? 'text-amber-700 font-medium'
                        : 'text-luxury-accent font-medium'
                      : 'text-luxury-gray-3'
                    return (
                      <span key={label} className={`flex-1 text-center text-[11px] ${cls}`}>
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* W-9 status, straight from Avalara. Only for agents actually
                  sitting at the W-9 step - anywhere else it is old news. */}
              {atW9 && canManage && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">
                  <p className="text-[11px] text-luxury-gray-3 uppercase tracking-widest mb-1.5">
                    W-9 status
                  </p>
                  {!a.w9_form_id ? (
                    <p className="text-xs text-luxury-gray-3">
                      No W-9 request on file for this agent, so there is nothing to check.
                      Send W-9 request to create one.
                    </p>
                  ) : w9.loading ? (
                    <p className="text-xs text-luxury-gray-3">Reading the status from Avalara...</p>
                  ) : w9.error ? (
                    <p className="text-xs text-red-700">{w9.error}</p>
                  ) : w9.ok === false ? (
                    <p className="text-xs text-red-700">
                      {w9.error || 'Could not read the W-9 status from Avalara'}
                    </p>
                  ) : w9.checked ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs text-luxury-gray-2">
                        {w9.signed
                          ? `Signed${w9.signed_date ? ` ${fmtDate(w9.signed_date)}` : ''}`
                          : `Not signed yet${w9.status ? ` (${w9.status})` : ''}`}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${tinMatchClass(w9.tin_match_status)}`}>
                        IRS name/TIN match: {tinMatchLabel(w9.tin_match_status)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-luxury-gray-3">
                      Not checked yet. Use Check W-9 status.
                    </p>
                  )}
                </div>
              )}

              {/* After co-sign: office setup tasks, filtered by agent variant */}
              {postCoSign && officeTasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] text-luxury-gray-3 uppercase tracking-widest">
                      After co-sign · office setup
                    </p>
                    <button
                      onClick={() => setNavAccessAgent(a)}
                      disabled={busy === `nav-${a.id}`}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                        a.full_nav_access
                          ? 'bg-green-50 border-green-200 text-green-700 hover:border-red-300'
                          : 'btn-primary'
                      }`}
                      title={a.full_nav_access ? 'Access granted - click to revoke' : 'Grant full app access and trigger the welcome email reminder'}
                    >
                      {busy === `nav-${a.id}` ? 'Working...' : a.full_nav_access ? 'Access granted' : 'Grant full app access'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {officeTasks.map((task: any) => {
                      const isCompleted = !!agentTaskCompletions[task.id]
                      return (
                        <button
                          key={task.id}
                          onClick={() => toggleAdminTask(a.id, task)}
                          className="flex items-center gap-1.5 text-xs text-luxury-gray-2 hover:text-luxury-gray-1"
                        >
                          <span
                            className={`w-3 h-3 rounded-sm border flex-shrink-0 ${isCompleted ? 'bg-luxury-accent border-luxury-accent' : 'border-luxury-gray-4'}`}
                          />
                          <span className={isCompleted ? 'line-through text-luxury-gray-3' : ''}>
                            {task.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* The agent's own checklist. The office keeps the ability to
                  tick an item on their behalf - agents tick the same rows
                  from /agent/checklist. */}
              {checklistItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">
                  <button
                    onClick={() => setOpenChecklist(openChecklist === a.id ? null : a.id)}
                    className="flex items-center justify-between w-full"
                  >
                    <span className="text-[11px] text-luxury-gray-3 uppercase tracking-widest">
                      Agent checklist · {Object.keys(checklistCompletions[a.id] || {}).length} of {checklistItems.length} complete
                    </span>
                    <span className="text-[11px] text-luxury-accent">
                      {openChecklist === a.id ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {openChecklist === a.id && (
                    <div className="mt-2 space-y-1">
                      {checklistItems.map((item: any) => {
                        const done = !!checklistCompletions[a.id]?.[item.id]
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleChecklistItem(a.id, item)}
                            disabled={busy === `cl-${a.id}-${item.id}`}
                            className="flex items-center gap-2 w-full text-left px-1 py-0.5 rounded hover:bg-luxury-light disabled:opacity-50"
                          >
                            {done ? (
                              <CheckCircle2 size={13} className="text-green-600 flex-shrink-0" />
                            ) : (
                              <Circle size={13} className="text-luxury-gray-3 flex-shrink-0" />
                            )}
                            <span className={`text-xs ${done ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>
                              {item.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="container-card text-center py-12">
            <p className="text-sm text-luxury-gray-3">No open onboardings found</p>
          </div>
        )}
      </div>

      {/* ── Advance past W-9 confirm dialog ──────────────────────────────── */}
      {advanceW9Agent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">
                Advance {getName(advanceW9Agent)} past W-9?
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-luxury-gray-2">
                This will email the office and send {getName(advanceW9Agent)} a &apos;You&apos;re Almost There&apos; email.
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => advancePastW9(advanceW9Agent)}
                className="btn btn-primary text-xs flex-1"
              >
                Advance
              </button>
              <button
                onClick={() => setAdvanceW9Agent(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Send W-9 request confirm dialog ──────────────────────────────── */}
      {sendW9Agent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">
                Send {getName(sendW9Agent)} a new W-9 request?
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-luxury-gray-2">
                Avalara will email {getName(sendW9Agent)} a W-9 request and host the signing
                page. {sendW9Agent.w9_form_id
                  ? 'This replaces the form currently on file for them.'
                  : 'This also stores the form id, which is what makes a status check possible.'}
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => sendW9Request(sendW9Agent)}
                className="btn btn-primary text-xs flex-1"
              >
                Send request
              </button>
              <button
                onClick={() => setSendW9Agent(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset a step confirm dialog ──────────────────────────────────── */}
      {resetAgent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">
                Reset a step for {getName(resetAgent)}?
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-luxury-gray-2">
                This sends {getName(resetAgent)} back to redo the step and emails them about it.
                Resetting Payment also clears their onboarding fee record, and resetting the ICA
                clears their signature.
              </p>
              <div>
                <label className="field-label">Step to reset</label>
                <select
                  value={resetStep ?? ''}
                  onChange={e => setResetStep(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="input-luxury text-xs w-full"
                >
                  <option value="">Choose a step</option>
                  {STEP_SHORT_LABELS.slice(0, 6).map((label, i) => (
                    <option key={label} value={i + 1}>
                      {i + 1} · {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => resetAStep(resetAgent, resetStep as number)}
                disabled={!resetStep}
                className="btn btn-primary text-xs flex-1 disabled:opacity-50"
              >
                Reset step
              </button>
              <button
                onClick={() => { setResetAgent(null); setResetStep(null) }}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grant / revoke access confirm dialog ─────────────────────────── */}
      {navAccessAgent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">
                {navAccessAgent.full_nav_access ? 'Revoke' : 'Grant'} full app access for {getName(navAccessAgent)}?
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-luxury-gray-2">
                {navAccessAgent.full_nav_access
                  ? 'They will lose access to the rest of the app until it is granted again.'
                  : 'This emails the office to run the welcome email sequence.'}
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => toggleNavAccess(navAccessAgent)}
                className="btn btn-primary text-xs flex-1"
              >
                {navAccessAgent.full_nav_access ? 'Revoke access' : 'Grant access'}
              </button>
              <button
                onClick={() => setNavAccessAgent(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
