'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Search, ExternalLink } from 'lucide-react'

interface Agent {
  id: string
  first_name: string
  last_name: string
  preferred_first_name: string
  preferred_last_name: string
  email: string
  status: string
  full_nav_access: boolean
  onboarding_fee_paid: boolean
  accepted_trec: boolean
  independent_contractor_agreement_signed: boolean
  w9_completed: boolean
}

interface ChecklistItem {
  id: string
  section: string
  section_title: string
  item_key: string
  label: string
  priority: string
  display_order: number
}

interface Completion {
  user_id: string
  checklist_item_id: string
  completed_at: string
  completed_by: string
}

interface AdminTask {
  id: string
  label: string
  display_order: number
}

interface AdminTaskCompletion {
  user_id: string
  task_id: string
  completed_at: string
  completed_by: string
  notes: string | null
}

type StageFilter = 'all' | 'setup' | 'onboarding' | 'complete'

const STAGE_LABELS: Record<string, { label: string; description: string; className: string }> = {
  setup: {
    label: 'Admin Setup',
    description: 'Complete your tasks and grant access',
    className: 'bg-orange-50 border-orange-200 text-orange-700',
  },
  onboarding: {
    label: 'Agent Onboarding',
    description: 'Agent is completing their checklist',
    className: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  complete: {
    label: 'Complete',
    description: 'All done',
    className: 'bg-green-50 border-green-200 text-green-700',
  },
}

const PRE_ACCESS_FIELDS = [
  { field: 'onboarding_fee_paid', label: 'Onboarding Fee Paid' },
  { field: 'accepted_trec', label: 'TREC Invitation Accepted' },
  { field: 'independent_contractor_agreement_signed', label: 'ICA Signed' },
  { field: 'w9_completed', label: 'W-9 Completed' },
]

export default function AdminOnboardingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [completions, setCompletions] = useState<Record<string, Record<string, Completion>>>({})
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([])
  const [adminCompletions, setAdminCompletions] = useState<Record<string, Record<string, AdminTaskCompletion>>>({})
  const [loading, setLoading] = useState(true)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StageFilter>('all')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { router.push('/auth/login'); return }
        const data = await res.json()
        setUser(data.user)
      } catch { router.push('/auth/login') }
    }
    fetchUser()
  }, [router])

  useEffect(() => { if (user) loadData() }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()

      setAgents(data.users || [])
      setItems(data.checklistItems || [])
      setAdminTasks(data.adminTasks || [])

      const compMap: Record<string, Record<string, Completion>> = {}
      for (const c of data.checklistCompletions || []) {
        if (!compMap[c.user_id]) compMap[c.user_id] = {}
        compMap[c.user_id][c.checklist_item_id] = c
      }
      setCompletions(compMap)

      const adminCompMap: Record<string, Record<string, AdminTaskCompletion>> = {}
      for (const c of data.adminTaskCompletions || []) {
        if (!adminCompMap[c.user_id]) adminCompMap[c.user_id] = {}
        adminCompMap[c.user_id][c.task_id] = c
      }
      setAdminCompletions(adminCompMap)
    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  const getStage = (agent: Agent): 'setup' | 'onboarding' | 'complete' => {
    const agentCompletions = completions[agent.id] || {}
    const completedCount = Object.keys(agentCompletions).length
    if (completedCount === items.length && items.length > 0) return 'complete'
    if (!agent.full_nav_access) return 'setup'
    return 'onboarding'
  }

  const apiPost = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    if (!res.ok) throw new Error(`Failed: ${action}`)
    return res.json()
  }

  const togglePreAccess = async (agentId: string, field: string, current: boolean) => {
    const updates: Record<string, any> = { [field]: !current }
    if (field === 'onboarding_fee_paid' && !current)
      updates.onboarding_fee_paid_date = new Date().toISOString().split('T')[0]
    await apiPost('update_user', { user_id: agentId, updates })
    setAgents((prev: Agent[]) => prev.map((a: Agent) => a.id === agentId ? { ...a, [field]: !current } : a))
  }

  const toggleAdminTask = async (agentId: string, task: AdminTask) => {
    const key = `admin-${agentId}-${task.id}`
    if (toggling === key) return
    setToggling(key)
    try {
      const isCompleted = !!adminCompletions[agentId]?.[task.id]
      await apiPost('toggle_admin_task', { user_id: agentId, task_id: task.id, completing: !isCompleted })
      if (isCompleted) {
        setAdminCompletions((prev: Record<string, Record<string, AdminTaskCompletion>>) => {
          const next = { ...prev, [agentId]: { ...prev[agentId] } }
          delete next[agentId][task.id]
          return next
        })
      } else {
        setAdminCompletions((prev: Record<string, Record<string, AdminTaskCompletion>>) => ({
          ...prev,
          [agentId]: { ...prev[agentId], [task.id]: { user_id: agentId, task_id: task.id, completed_at: new Date().toISOString(), completed_by: user.id, notes: null } },
        }))
      }
    } catch (e) { console.error(e) } finally { setToggling(null) }
  }

  const toggleChecklistItem = async (agentId: string, item: ChecklistItem) => {
    const key = `${agentId}-${item.id}`
    if (toggling === key) return
    setToggling(key)
    try {
      const isCompleted = !!completions[agentId]?.[item.id]
      await apiPost('toggle_checklist', { user_id: agentId, checklist_item_id: item.id, completing: !isCompleted })
      if (isCompleted) {
        setCompletions((prev: Record<string, Record<string, Completion>>) => { const next = { ...prev, [agentId]: { ...prev[agentId] } }; delete next[agentId][item.id]; return next })
      } else {
        setCompletions((prev: Record<string, Record<string, Completion>>) => ({ ...prev, [agentId]: { ...prev[agentId], [item.id]: { user_id: agentId, checklist_item_id: item.id, completed_at: new Date().toISOString(), completed_by: user.id } } }))
      }
    } catch (e) { console.error(e) } finally { setToggling(null) }
  }

  const toggleNavAccess = async (agentId: string, current: boolean) => {
    await apiPost('toggle_nav_access', { user_id: agentId, current })
    setAgents((prev: Agent[]) => prev.map((a: Agent) => a.id === agentId ? { ...a, full_nav_access: !current } : a))
  }

  const getName = (a: Agent) => `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`

  const sections = items.reduce((acc: Record<string, { title: string; items: ChecklistItem[] }>, item: ChecklistItem) => {
    if (!acc[item.section]) acc[item.section] = { title: item.section_title, items: [] }
    acc[item.section].items.push(item)
    return acc
  }, {} as Record<string, { title: string; items: ChecklistItem[] }>)

  const filtered = agents.filter((a: Agent) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!getName(a).toLowerCase().includes(q) && !a.email.toLowerCase().includes(q)) return false
    }
    return filter === 'all' || getStage(a) === filter
  })

  const counts = {
    setup: agents.filter((a: Agent) => getStage(a) === 'setup').length,
    onboarding: agents.filter((a: Agent) => getStage(a) === 'onboarding').length,
    complete: agents.filter((a: Agent) => getStage(a) === 'complete').length,
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">ONBOARDING</h1>

      {/* Stage summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['setup', 'onboarding', 'complete'] as StageFilter[]).map(stage => {
          if (stage === 'all') return null
          const s = STAGE_LABELS[stage]
          return (
            <button
              key={stage}
              onClick={() => setFilter(filter === stage ? 'all' : stage)}
              className={`container-card text-left transition-all ${filter === stage ? 'ring-2 ring-luxury-accent' : ''}`}
            >
              <p className="text-xs text-luxury-gray-3 mb-1">{s.label}</p>
              <p className="text-2xl font-semibold text-luxury-gray-1">{counts[stage as keyof typeof counts]}</p>
              <p className="text-xs text-luxury-gray-3 mt-1">{s.description}</p>
            </button>
          )
        })}
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

      {/* Agent list */}
      <div className="space-y-3">
        {filtered.map((agent: Agent) => {
          const stage = getStage(agent)
          const badge = STAGE_LABELS[stage]
          const agentCompletions = completions[agent.id] || {}
          const completedCount = Object.keys(agentCompletions).length
          const agentAdminCompletions = adminCompletions[agent.id] || {}
          const adminCompletedCount = Object.keys(agentAdminCompletions).length
          const preAccessDone = PRE_ACCESS_FIELDS.every(f => !!(agent as any)[f.field])
          const isExpanded = expandedAgents[agent.id]

          return (
            <div key={agent.id} className="container-card">
              {/* Header row */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedAgents((prev: Record<string, boolean>) => ({ ...prev, [agent.id]: !prev[agent.id] }))}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-luxury-gray-1">{getName(agent)}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-luxury-gray-3 truncate">{agent.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0 text-xs text-luxury-gray-3 hidden sm:block">
                    {stage === 'setup' && <p>{adminCompletedCount + PRE_ACCESS_FIELDS.filter(f => !!(agent as any)[f.field]).length}/{adminTasks.length + PRE_ACCESS_FIELDS.length} tasks</p>}
                    {stage !== 'setup' && <p>{completedCount}/{items.length} checklist</p>}
                  </div>
                </div>
                <div className="ml-3 flex-shrink-0">
                  {isExpanded ? <ChevronUp size={16} className="text-luxury-gray-3" /> : <ChevronDown size={16} className="text-luxury-gray-3" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 space-y-5">

                  {/* SETUP STAGE: your tasks + access toggle */}
                  {stage === 'setup' && (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Your Tasks</p>
                        <div className="space-y-1.5">
                          {/* Pre-access fields */}
                          {PRE_ACCESS_FIELDS.map(({ field, label }) => {
                            const isComplete = !!(agent as any)[field]
                            return (
                              <div
                                key={field}
                                className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1.5 rounded transition-colors"
                                onClick={() => togglePreAccess(agent.id, field, isComplete)}
                              >
                                {isComplete
                                  ? <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                                  : <Circle size={15} className="text-luxury-gray-3 flex-shrink-0" />}
                                <span className={`text-sm ${isComplete ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{label}</span>
                              </div>
                            )
                          })}
                          {/* Admin tasks */}
                          {adminTasks.map((task: AdminTask) => {
                            const isCompleted = !!agentAdminCompletions[task.id]
                            const key = `admin-${agent.id}-${task.id}`
                            return (
                              <div
                                key={task.id}
                                className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1.5 rounded transition-colors"
                                onClick={() => toggleAdminTask(agent.id, task)}
                              >
                                {toggling === key
                                  ? <Circle size={15} className="text-luxury-gray-3 animate-pulse flex-shrink-0" />
                                  : isCompleted
                                    ? <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                                    : <Circle size={15} className="text-luxury-gray-3 flex-shrink-0" />}
                                <span className={`text-sm ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{task.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-luxury-gray-5/30">
                        <div>
                          <p className="text-sm font-medium text-luxury-gray-1">Grant Full App Access</p>
                          <p className="text-xs text-luxury-gray-3">Unlocks the agent's onboarding checklist</p>
                        </div>
                        <button
                          onClick={() => toggleNavAccess(agent.id, agent.full_nav_access)}
                          disabled={!preAccessDone || adminCompletedCount < adminTasks.length}
                          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                            agent.full_nav_access
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : preAccessDone && adminCompletedCount >= adminTasks.length
                                ? 'btn-primary'
                                : 'opacity-40 cursor-not-allowed btn-secondary'
                          }`}
                        >
                          {agent.full_nav_access ? 'Access Granted ✓' : 'Grant Access'}
                        </button>
                      </div>
                      {(!preAccessDone || adminCompletedCount < adminTasks.length) && (
                        <p className="text-xs text-luxury-gray-3 -mt-3">Complete all tasks above before granting access.</p>
                      )}
                    </>
                  )}

                  {/* Agent checklist — always visible */}
                  <>
                      <div className="progress-bar mb-1">
                        <div className="progress-bar-fill" style={{ width: `${items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%` }} />
                      </div>
                      <p className="text-xs text-luxury-gray-3 mb-3">{completedCount} of {items.length} checklist items complete</p>

                      {(Object.entries(sections) as [string, { title: string; items: ChecklistItem[] }][]).map(([sectionKey, section]) => (
                        <div key={sectionKey}>
                          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">{section.title}</p>
                          <div className="space-y-1.5">
                            {section.items.map((item: ChecklistItem) => {
                              const isCompleted = !!agentCompletions[item.id]
                              const key = `${agent.id}-${item.id}`
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1.5 rounded transition-colors"
                                  onClick={() => toggleChecklistItem(agent.id, item)}
                                >
                                  {toggling === key
                                    ? <Circle size={15} className="text-luxury-gray-3 animate-pulse flex-shrink-0" />
                                    : isCompleted
                                      ? <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                                      : <Circle size={15} className="text-luxury-gray-3 flex-shrink-0" />}
                                  <span className={`text-sm flex-1 ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{item.label}</span>
                                  {item.priority === 'high' && !isCompleted && (
                                    <span className="text-xs px-1 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Priority</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Link to agent profile */}
                      <div className="pt-3 border-t border-luxury-gray-5/30 flex items-center justify-between">
                        <a
                          href={`/admin/users/${agent.id}`}
                          className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} /> View Profile
                        </a>
                        {agent.full_nav_access && (
                          <button
                            onClick={() => toggleNavAccess(agent.id, agent.full_nav_access)}
                            className="text-xs text-luxury-gray-3 hover:text-red-600 transition-colors"
                          >
                            Revoke Access
                          </button>
                        )}
                      </div>
                    </>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="container-card text-center py-12">
            <p className="text-sm text-luxury-gray-3">No agents found</p>
          </div>
        )}
      </div>
    </div>
  )
}