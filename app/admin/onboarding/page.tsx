'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Search } from 'lucide-react'

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

type FilterStatus = 'all' | 'locked' | 'unlocked' | 'ready' | 'complete' | 'pending_admin' | 'incomplete'

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
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [toggling, setToggling] = useState<string | null>(null)
  const [addingNote, setAddingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

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

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      const [agentsRes, itemsRes, completionsRes, adminTasksRes, adminCompletionsRes] = await Promise.all([
        supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, status, full_nav_access, onboarding_fee_paid, accepted_trec, independent_contractor_agreement_signed, w9_completed').eq('status', 'active').order('first_name'),
        supabase.from('onboarding_checklist_items').select('id, section, section_title, item_key, label, priority, display_order').eq('is_active', true).order('display_order'),
        supabase.from('onboarding_checklist_completions').select('user_id, checklist_item_id, completed_at, completed_by'),
        supabase.from('onboarding_admin_tasks').select('id, label, display_order').eq('is_active', true).order('display_order'),
        supabase.from('onboarding_admin_task_completions').select('user_id, task_id, completed_at, completed_by, notes'),
      ])

      setAgents(agentsRes.data || [])
      setItems(itemsRes.data || [])
      setAdminTasks(adminTasksRes.data || [])

      const compMap: Record<string, Record<string, Completion>> = {}
      for (const c of completionsRes.data || []) {
        if (!compMap[c.user_id]) compMap[c.user_id] = {}
        compMap[c.user_id][c.checklist_item_id] = c
      }
      setCompletions(compMap)

      const adminCompMap: Record<string, Record<string, AdminTaskCompletion>> = {}
      for (const c of adminCompletionsRes.data || []) {
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

  const preAccessComplete = (agent: Agent) =>
    agent.onboarding_fee_paid && agent.accepted_trec &&
    agent.independent_contractor_agreement_signed && agent.w9_completed

  const getAgentStatus = (agent: Agent): FilterStatus => {
    const agentCompletions = completions[agent.id] || {}
    const completedCount = Object.keys(agentCompletions).length
    const adminTaskCount = Object.keys(adminCompletions[agent.id] || {}).length

    if (completedCount === items.length && items.length > 0) return 'complete'
    if (!agent.full_nav_access && !preAccessComplete(agent)) return 'locked'
    if (!agent.full_nav_access && preAccessComplete(agent)) return 'ready'
    if (agent.full_nav_access && adminTaskCount < adminTasks.length) return 'pending_admin'
    if (agent.full_nav_access && completedCount === 0) return 'unlocked'
    return 'incomplete'
  }

  const toggleItem = async (agentId: string, item: ChecklistItem) => {
    const key = `${agentId}-${item.id}`
    if (toggling === key) return
    setToggling(key)
    try {
      const isCompleted = !!completions[agentId]?.[item.id]
      if (isCompleted) {
        await supabase.from('onboarding_checklist_completions').delete().eq('user_id', agentId).eq('checklist_item_id', item.id)
        setCompletions(prev => { const next = { ...prev, [agentId]: { ...prev[agentId] } }; delete next[agentId][item.id]; return next })
      } else {
        await supabase.from('onboarding_checklist_completions').insert({ user_id: agentId, checklist_item_id: item.id, completed_by: user.id })
        setCompletions(prev => ({ ...prev, [agentId]: { ...prev[agentId], [item.id]: { user_id: agentId, checklist_item_id: item.id, completed_at: new Date().toISOString(), completed_by: user.id } } }))
      }
    } catch (e) { console.error('Error toggling item:', e) }
    finally { setToggling(null) }
  }

  const toggleAdminTask = async (agentId: string, task: AdminTask) => {
    const key = `admin-${agentId}-${task.id}`
    if (toggling === key) return
    setToggling(key)
    try {
      const isCompleted = !!adminCompletions[agentId]?.[task.id]
      if (isCompleted) {
        await supabase.from('onboarding_admin_task_completions').delete().eq('user_id', agentId).eq('task_id', task.id)
        setAdminCompletions(prev => { const next = { ...prev, [agentId]: { ...prev[agentId] } }; delete next[agentId][task.id]; return next })
      } else {
        await supabase.from('onboarding_admin_task_completions').insert({ user_id: agentId, task_id: task.id, completed_by: user.id })
        setAdminCompletions(prev => ({ ...prev, [agentId]: { ...prev[agentId], [task.id]: { user_id: agentId, task_id: task.id, completed_at: new Date().toISOString(), completed_by: user.id, notes: null } } }))
      }
    } catch (e) { console.error('Error toggling admin task:', e) }
    finally { setToggling(null) }
  }

  const saveNote = async (agentId: string, taskId: string) => {
    await supabase.from('onboarding_admin_task_completions').update({ notes: noteText }).eq('user_id', agentId).eq('task_id', taskId)
    setAdminCompletions(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], [taskId]: { ...prev[agentId][taskId], notes: noteText } }
    }))
    setAddingNote(null)
    setNoteText('')
  }

  const togglePreAccessStep = async (agentId: string, field: string, current: boolean) => {
    const updates: Record<string, any> = { [field]: !current }
    if (field === 'onboarding_fee_paid' && !current) updates.onboarding_fee_paid_date = new Date().toISOString().split('T')[0]
    await supabase.from('users').update(updates).eq('id', agentId)
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, [field]: !current } : a))
  }

  const toggleNavAccess = async (agentId: string, current: boolean) => {
    await supabase.from('users').update({ full_nav_access: !current }).eq('id', agentId)
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, full_nav_access: !current } : a))
  }

  const toggleAgent = (id: string) => setExpandedAgents(prev => ({ ...prev, [id]: !prev[id] }))

  const sections = items.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = { title: item.section_title, items: [] }
    acc[item.section].items.push(item)
    return acc
  }, {} as Record<string, { title: string; items: ChecklistItem[] }>)

  const filtered = agents.filter(a => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
      if (!name.includes(q) && !a.email.toLowerCase().includes(q)) return false
    }
    if (filter === 'all') return true
    return getAgentStatus(a) === filter
  })

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'locked', label: 'Locked' },
    { value: 'ready', label: 'Ready to Unlock' },
    { value: 'unlocked', label: 'Unlocked' },
    { value: 'pending_admin', label: 'Pending Admin Setup' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'complete', label: 'Complete' },
  ]

  const statusBadge: Record<FilterStatus, { label: string; className: string }> = {
    all: { label: '', className: '' },
    locked: { label: 'Locked', className: 'bg-gray-50 border-gray-200 text-gray-600' },
    ready: { label: 'Ready to Unlock', className: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    unlocked: { label: 'Unlocked', className: 'bg-blue-50 border-blue-200 text-blue-700' },
    pending_admin: { label: 'Pending Admin Setup', className: 'bg-orange-50 border-orange-200 text-orange-700' },
    incomplete: { label: 'In Progress', className: 'bg-blue-50 border-blue-200 text-blue-700' },
    complete: { label: 'Complete', className: 'bg-green-50 border-green-200 text-green-700' },
  }

  const stats = {
    total: agents.length,
    complete: agents.filter(a => getAgentStatus(a) === 'complete').length,
    inProgress: agents.filter(a => ['unlocked', 'incomplete', 'pending_admin'].includes(getAgentStatus(a))).length,
    ready: agents.filter(a => getAgentStatus(a) === 'ready').length,
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">ONBOARDING</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Total</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Ready to Unlock</p>
          <p className="text-2xl font-semibold text-yellow-600">{stats.ready}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">In Progress</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.inProgress}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Complete</p>
          <p className="text-2xl font-semibold text-green-600">{stats.complete}</p>
        </div>
      </div>

      <div className="container-card mb-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
          <input type="text" placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="input-luxury pl-8" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}`}
            >
              {opt.label} ({opt.value === 'all' ? agents.length : agents.filter(a => getAgentStatus(a) === opt.value).length})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(agent => {
          const agentCompletions = completions[agent.id] || {}
          const completedCount = Object.keys(agentCompletions).length
          const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0
          const isExpanded = expandedAgents[agent.id]
          const name = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
          const agentStatus = getAgentStatus(agent)
          const badge = statusBadge[agentStatus]
          const agentAdminCompletions = adminCompletions[agent.id] || {}
          const adminCompletedCount = Object.keys(agentAdminCompletions).length

          return (
            <div key={agent.id} className="container-card">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleAgent(agent.id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-luxury-gray-1">{name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-luxury-gray-3">{agent.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0 text-xs text-luxury-gray-3">
                    <p>Checklist {completedCount}/{items.length}</p>
                    <p>Admin {adminCompletedCount}/{adminTasks.length}</p>
                  </div>
                </div>
                <div className="ml-4">
                  {isExpanded ? <ChevronUp size={16} className="text-luxury-gray-3" /> : <ChevronDown size={16} className="text-luxury-gray-3" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 space-y-4">
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>

                  {/* Pre-Access Steps */}
                  <div className="inner-card">
                    <p className="text-xs font-semibold text-luxury-gray-2 mb-3">Pre-Access Steps</p>
                    <div className="space-y-2">
                      {[
                        { field: 'onboarding_fee_paid', label: 'Onboarding Fee Paid' },
                        { field: 'accepted_trec', label: 'TREC Invitation Accepted' },
                        { field: 'independent_contractor_agreement_signed', label: 'ICA Signed' },
                        { field: 'w9_completed', label: 'W-9 Completed' },
                      ].map(({ field, label }) => {
                        const isComplete = !!(agent as any)[field]
                        return (
                          <div key={field} className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1 rounded transition-colors" onClick={() => togglePreAccessStep(agent.id, field, isComplete)}>
                            {isComplete ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" /> : <Circle size={14} className="text-luxury-gray-3 flex-shrink-0" />}
                            <span className={`text-xs ${isComplete ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Admin Setup Tasks */}
                  <div className="inner-card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-luxury-gray-2">Admin Setup Tasks</p>
                      <span className="text-xs text-luxury-gray-3">{adminCompletedCount}/{adminTasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {adminTasks.map(task => {
                        const completion = agentAdminCompletions[task.id]
                        const isCompleted = !!completion
                        const taskKey = `admin-${agent.id}-${task.id}`
                        const isAddingNote = addingNote === taskKey
                        return (
                          <div key={task.id}>
                            <div className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1 rounded transition-colors" onClick={() => toggleAdminTask(agent.id, task)}>
                              {toggling === taskKey
                                ? <Circle size={14} className="text-luxury-gray-3 animate-pulse flex-shrink-0" />
                                : isCompleted
                                  ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                                  : <Circle size={14} className="text-luxury-gray-3 flex-shrink-0" />
                              }
                              <span className={`text-xs flex-1 ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{task.label}</span>
                              {isCompleted && (
                                <button
                                  onClick={e => { e.stopPropagation(); setAddingNote(isAddingNote ? null : taskKey); setNoteText(completion.notes || '') }}
                                  className="text-xs text-luxury-accent hover:underline flex-shrink-0"
                                >
                                  {completion.notes ? 'Edit note' : 'Add note'}
                                </button>
                              )}
                            </div>
                            {isCompleted && completion.notes && !isAddingNote && (
                              <p className="text-xs text-luxury-gray-3 ml-7 mt-0.5 italic">{completion.notes}</p>
                            )}
                            {isAddingNote && (
                              <div className="ml-7 mt-1 flex gap-2">
                                <input
                                  type="text"
                                  value={noteText}
                                  onChange={e => setNoteText(e.target.value)}
                                  placeholder="Add a note..."
                                  className="input-luxury text-xs flex-1"
                                  autoFocus
                                />
                                <button onClick={() => saveNote(agent.id, task.id)} className="btn btn-primary text-xs">Save</button>
                                <button onClick={() => setAddingNote(null)} className="btn btn-secondary text-xs">Cancel</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Nav Access */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-luxury-gray-3">App Navigation Access</p>
                    <button
                      onClick={() => toggleNavAccess(agent.id, agent.full_nav_access)}
                      className={`text-xs px-3 py-1 rounded border transition-colors ${agent.full_nav_access ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'btn-secondary'}`}
                    >
                      {agent.full_nav_access ? 'Full Access — Click to Restrict' : 'Restricted — Click to Grant Full Access'}
                    </button>
                  </div>

                  {/* Agent Checklist */}
                  {Object.entries(sections).map(([sectionKey, section]) => {
                    const sectionCompleted = section.items.filter(i => agentCompletions[i.id]).length
                    return (
                      <div key={sectionKey}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-xs font-semibold text-luxury-gray-2">{section.title}</p>
                          <span className="text-xs text-luxury-gray-3">{sectionCompleted}/{section.items.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {section.items.map(item => {
                            const isCompleted = !!agentCompletions[item.id]
                            const key = `${agent.id}-${item.id}`
                            return (
                              <div key={item.id} className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-luxury-light transition-colors ${isCompleted ? 'opacity-60' : ''}`} onClick={() => toggleItem(agent.id, item)}>
                                {toggling === key ? <Circle size={14} className="text-luxury-gray-3 animate-pulse" /> : isCompleted ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" /> : <Circle size={14} className="text-luxury-gray-3 flex-shrink-0" />}
                                <span className={`text-xs ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{item.label}</span>
                                {item.priority === 'high' && !isCompleted && (
                                  <span className="text-xs px-1 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 ml-auto">Priority</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
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
