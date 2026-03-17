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

export default function AdminOnboardingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [completions, setCompletions] = useState<Record<string, Record<string, Completion>>>({})
  const [loading, setLoading] = useState(true)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
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

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      const [agentsRes, itemsRes, completionsRes] = await Promise.all([
        supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, status, full_nav_access, onboarding_fee_paid, accepted_trec, independent_contractor_agreement_signed, w9_completed').eq('status', 'active').order('first_name'),
        supabase.from('onboarding_checklist_items').select('id, section, section_title, item_key, label, priority, display_order').eq('is_active', true).order('display_order'),
        supabase.from('onboarding_checklist_completions').select('user_id, checklist_item_id, completed_at, completed_by'),
      ])

      setAgents(agentsRes.data || [])
      setItems(itemsRes.data || [])

      const compMap: Record<string, Record<string, Completion>> = {}
      for (const c of completionsRes.data || []) {
        if (!compMap[c.user_id]) compMap[c.user_id] = {}
        compMap[c.user_id][c.checklist_item_id] = c
      }
      setCompletions(compMap)
    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (agentId: string, item: ChecklistItem) => {
    const key = `${agentId}-${item.id}`
    if (toggling === key) return
    setToggling(key)
    try {
      const isCompleted = !!completions[agentId]?.[item.id]
      if (isCompleted) {
        await supabase.from('onboarding_checklist_completions')
          .delete().eq('user_id', agentId).eq('checklist_item_id', item.id)
        setCompletions(prev => {
          const next = { ...prev, [agentId]: { ...prev[agentId] } }
          delete next[agentId][item.id]
          return next
        })
      } else {
        await supabase.from('onboarding_checklist_completions')
          .insert({ user_id: agentId, checklist_item_id: item.id, completed_by: user.id })
        setCompletions(prev => ({
          ...prev,
          [agentId]: { ...prev[agentId], [item.id]: { user_id: agentId, checklist_item_id: item.id, completed_at: new Date().toISOString(), completed_by: user.id } }
        }))
      }
    } catch (e) {
      console.error('Error toggling item:', e)
    } finally {
      setToggling(null)
    }
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
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
    return name.includes(q) || a.email.toLowerCase().includes(q)
  })

  const stats = {
    total: agents.length,
    complete: agents.filter(a => items.length > 0 && Object.keys(completions[a.id] || {}).length === items.length).length,
    inProgress: agents.filter(a => { const c = Object.keys(completions[a.id] || {}).length; return c > 0 && c < items.length }).length,
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">ONBOARDING</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Total Agents</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">In Progress</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.inProgress}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Complete</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.complete}</p>
        </div>
      </div>

      <div className="container-card mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-luxury pl-8"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(agent => {
          const agentCompletions = completions[agent.id] || {}
          const completedCount = Object.keys(agentCompletions).length
          const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0
          const isExpanded = expandedAgents[agent.id]
          const name = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`

          return (
            <div key={agent.id} className="container-card">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleAgent(agent.id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-luxury-gray-1">{name}</p>
                      {agent.full_nav_access && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">Full Access</span>
                      )}
                    </div>
                    <p className="text-xs text-luxury-gray-3">{agent.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-luxury-gray-1">{progress}%</p>
                    <p className="text-xs text-luxury-gray-3">{completedCount}/{items.length}</p>
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
                  <div className="inner-card mb-2">
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
                          <div
                            key={field}
                            className="flex items-center gap-2 cursor-pointer hover:bg-luxury-light px-2 py-1 rounded transition-colors"
                            onClick={() => togglePreAccessStep(agent.id, field, isComplete)}
                          >
                            {isComplete
                              ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                              : <Circle size={14} className="text-luxury-gray-3 flex-shrink-0" />
                            }
                            <span className={`text-xs ${isComplete ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-luxury-gray-3">App Navigation Access</p>
                    <button
                      onClick={() => toggleNavAccess(agent.id, agent.full_nav_access)}
                      className={`text-xs px-3 py-1 rounded border transition-colors ${agent.full_nav_access ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'btn-secondary'}`}
                    >
                      {agent.full_nav_access ? 'Full Access — Click to Restrict' : 'Restricted — Click to Grant Full Access'}
                    </button>
                  </div>

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
                              <div
                                key={item.id}
                                className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-luxury-light transition-colors ${isCompleted ? 'opacity-60' : ''}`}
                                onClick={() => toggleItem(agent.id, item)}
                              >
                                {toggling === key
                                  ? <Circle size={14} className="text-luxury-gray-3 animate-pulse" />
                                  : isCompleted
                                    ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                                    : <Circle size={14} className="text-luxury-gray-3 flex-shrink-0" />
                                }
                                <span className={`text-xs ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-2'}`}>
                                  {item.label}
                                </span>
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
      </div>
    </div>
  )
}
