'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Circle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface ChecklistItem {
  id: string
  section: string
  section_title: string
  item_key: string
  label: string
  description: string | null
  priority: string
  link_text: string | null
  link_url: string | null
  second_link_text: string | null
  second_link_url: string | null
  display_order: number
}

interface Completion {
  checklist_item_id: string
  completed_at: string
}

export default function AgentChecklistPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [completions, setCompletions] = useState<Record<string, Completion>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

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
      const [itemsRes, completionsRes] = await Promise.all([
        supabase.from('onboarding_checklist_items').select('*').eq('is_active', true).order('display_order'),
        supabase.from('onboarding_checklist_completions').select('checklist_item_id, completed_at').eq('user_id', user.id),
      ])
      setItems(itemsRes.data || [])
      const completionMap: Record<string, Completion> = {}
      for (const c of completionsRes.data || []) {
        completionMap[c.checklist_item_id] = c
      }
      setCompletions(completionMap)
    } catch (e) {
      console.error('Error loading checklist:', e)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (item: ChecklistItem) => {
    if (toggling) return
    setToggling(item.id)
    try {
      const isCompleted = !!completions[item.id]
      if (isCompleted) {
        await supabase.from('onboarding_checklist_completions')
          .delete()
          .eq('user_id', user.id)
          .eq('checklist_item_id', item.id)
        setCompletions(prev => { const next = { ...prev }; delete next[item.id]; return next })
      } else {
        await supabase.from('onboarding_checklist_completions')
          .insert({ user_id: user.id, checklist_item_id: item.id, completed_by: user.id })
        setCompletions(prev => ({ ...prev, [item.id]: { checklist_item_id: item.id, completed_at: new Date().toISOString() } }))
      }
    } catch (e) {
      console.error('Error toggling item:', e)
    } finally {
      setToggling(null)
    }
  }

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const sections = items.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = { title: item.section_title, items: [] }
    acc[item.section].items.push(item)
    return acc
  }, {} as Record<string, { title: string; items: ChecklistItem[] }>)

  const totalItems = items.length
  const completedCount = Object.keys(completions).length
  const progress = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading checklist...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">ONBOARDING CHECKLIST</h1>
        <span className="text-sm text-luxury-gray-3">{completedCount} of {totalItems} complete</span>
      </div>

      <div className="container-card mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-luxury-gray-3">Your Progress</p>
          <p className="text-xs font-semibold text-luxury-gray-1">{progress}%</p>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        {progress === 100 && (
          <p className="text-xs text-green-600 mt-2 font-medium">All items complete!</p>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(sections).map(([sectionKey, section]) => {
          const sectionCompleted = section.items.filter(i => completions[i.id]).length
          const isCollapsed = collapsedSections[sectionKey]
          return (
            <div key={sectionKey} className="container-card">
              <button onClick={() => toggleSection(sectionKey)} className="w-full flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-luxury-gray-1">{section.title}</h2>
                  <span className="text-xs text-luxury-gray-3">{sectionCompleted}/{section.items.length}</span>
                </div>
                {isCollapsed ? <ChevronDown size={16} className="text-luxury-gray-3" /> : <ChevronUp size={16} className="text-luxury-gray-3" />}
              </button>
              {!isCollapsed && (
                <div className="space-y-2 mt-3">
                  {section.items.map(item => {
                    const isCompleted = !!completions[item.id]
                    return (
                      <div
                        key={item.id}
                        className={`inner-card flex items-start gap-3 cursor-pointer transition-colors ${isCompleted ? "opacity-70" : ""}`}
                        onClick={() => toggleItem(item)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted
                            ? <CheckCircle2 size={18} className="text-green-600" />
                            : <Circle size={18} className="text-luxury-gray-3" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${isCompleted ? "line-through text-luxury-gray-3" : "text-luxury-gray-1"}`}>
                              {item.label}
                            </span>
                            {item.priority === "high" && !isCompleted && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Priority</span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-luxury-gray-3 mt-0.5">{item.description}</p>
                          )}
                          {(item.link_url || item.second_link_url) && (
                            <div className="flex gap-3 mt-1.5" onClick={e => e.stopPropagation()}>
                              {item.link_url && (
                                <a href={item.link_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-luxury-accent hover:underline flex items-center gap-1">
                                  <ExternalLink size={11} /> {item.link_text}
                                </a>
                              )}
                              {item.second_link_url && (
                                <a href={item.second_link_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-luxury-accent hover:underline flex items-center gap-1">
                                  <ExternalLink size={11} /> {item.second_link_text}
                                </a>
                              )}
                            </div>
                          )}
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
