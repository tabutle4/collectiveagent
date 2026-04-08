'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PartyPopper,
} from 'lucide-react'
import confetti from 'canvas-confetti'

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

type Step = string | { text: string; url: string }

const HAR_NEW: Step[] = [
  { text: 'Visit the HAR Join Page', url: 'https://har.com/joinhar' },
  'Click "Apply Now"',
  'Complete the Application Form',
  'Check your email for login credentials from HAR',
  'Pay any required fees',
  'Mark complete once approved and you have HAR access',
]
const HAR_TRANSFER: Step[] = [
  { text: 'Complete the HAR Transfer Form', url: 'https://app.hellosign.com/s/62GzWyXz' },
  'Check your email for confirmation from HAR',
  'Pay any required fees',
  'Mark complete once you receive confirmation',
]
const METRO_NEW: Step[] = [
  { text: 'Visit mymetrotex.com', url: 'https://mymetrotex.com' },
  'Click "Join Today"',
  'Complete the Member Application',
  'Fill out all required information and submit',
  'Check your email for login credentials from MetroTex',
  'Pay any required fees',
  'Mark complete once approved and you have MetroTex access',
]
const METRO_TRANSFER: Step[] = [
  { text: 'Visit mymetrotex.com', url: 'https://mymetrotex.com' },
  'Click "Manage My Membership"',
  'Log in with your existing MetroTex credentials',
  'Complete the Transfer Form',
  'Pay any required fees',
  'Wait for processing',
  'Mark complete once transfer is confirmed',
]

function MLSSetupCard({
  item,
  isCompleted,
  onComplete,
}: {
  item: ChecklistItem
  isCompleted: boolean
  onComplete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [mls, setMls] = useState<string | null>(null)
  const [harStatus, setHarStatus] = useState<string | null>(null)
  const [metroStatus, setMetroStatus] = useState<string | null>(null)

  const showHAR = mls === 'HAR' || mls === 'Both'
  const showMetro = mls === 'MetroTex' || mls === 'Both'

  return (
    <div className={`inner-card transition-colors ${isCompleted ? 'opacity-70' : ''}`}>
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => !isCompleted && setExpanded(e => !e)}
      >
        <div
          className="flex-shrink-0 mt-0.5"
          onClick={e => {
            if (isCompleted) {
              e.stopPropagation()
              onComplete()
            }
          }}
        >
          {isCompleted ? (
            <CheckCircle2 size={18} className="text-green-600 cursor-pointer" />
          ) : (
            <Circle size={18} className="text-luxury-gray-3" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}
              >
                {item.label}
              </span>
              {item.priority === 'high' && !isCompleted && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                  Priority
                </span>
              )}
            </div>
            {!isCompleted &&
              (expanded ? (
                <ChevronUp size={14} className="text-luxury-gray-3" />
              ) : (
                <ChevronDown size={14} className="text-luxury-gray-3" />
              ))}
          </div>
          {item.description && (
            <p className="text-xs text-luxury-gray-3 mt-0.5">{item.description}</p>
          )}
        </div>
      </div>

      {expanded && !isCompleted && (
        <div className="mt-4 pl-7 space-y-4">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-2 mb-2">
              Which MLS will you join?
            </p>
            <div className="space-y-1.5">
              {['HAR', 'MetroTex | NTREIS', 'Both'].map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-sm text-luxury-gray-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    checked={mls === opt}
                    onChange={() => {
                      setMls(opt)
                      setHarStatus(null)
                      setMetroStatus(null)
                    }}
                    className="accent-luxury-accent"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {showHAR && (
            <div>
              <p className="text-xs font-semibold text-luxury-gray-2 mb-2">
                {mls === 'Both' ? 'Your HAR status:' : 'Your association status:'}
              </p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-luxury-gray-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={harStatus === 'new'}
                    onChange={() => setHarStatus('new')}
                    className="accent-luxury-accent"
                  />
                  I am a brand new licensed agent
                </label>
                <label className="flex items-center gap-2 text-sm text-luxury-gray-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={harStatus === 'transfer'}
                    onChange={() => setHarStatus('transfer')}
                    className="accent-luxury-accent"
                  />
                  I was previously a member of HAR with another brokerage
                </label>
              </div>
            </div>
          )}

          {showMetro && (
            <div>
              <p className="text-xs font-semibold text-luxury-gray-2 mb-2">
                {mls === 'Both' ? 'Your MetroTex | NTREIS status:' : 'Your association status:'}
              </p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-luxury-gray-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={metroStatus === 'new'}
                    onChange={() => setMetroStatus('new')}
                    className="accent-luxury-accent"
                  />
                  I am a brand new licensed agent
                </label>
                <label className="flex items-center gap-2 text-sm text-luxury-gray-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={metroStatus === 'transfer'}
                    onChange={() => setMetroStatus('transfer')}
                    className="accent-luxury-accent"
                  />
                  I was previously a member of NTREIS with another brokerage
                </label>
              </div>
            </div>
          )}

          {showMetro && metroStatus && (
            <div className="bg-luxury-light rounded p-3">
              <p className="text-xs font-semibold text-luxury-gray-2 mb-2">
                MetroTex | NTREIS Instructions:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {(metroStatus === 'new' ? METRO_NEW : METRO_TRANSFER).map((step, i) => (
                  <li key={i} className="text-xs text-luxury-gray-2">
                    {typeof step === 'string' ? step : (
                      <a href={step.url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline underline-offset-2 hover:opacity-80">
                        {step.text}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {showHAR && harStatus && (
            <div className="bg-luxury-light rounded p-3">
              <p className="text-xs font-semibold text-luxury-gray-2 mb-2">HAR Instructions:</p>
              <ol className="list-decimal list-inside space-y-1">
                {(harStatus === 'new' ? HAR_NEW : HAR_TRANSFER).map((step, i) => (
                  <li key={i} className="text-xs text-luxury-gray-2">
                    {typeof step === 'string' ? step : (
                      <a href={step.url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline underline-offset-2 hover:opacity-80">
                        {step.text}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mls && (
            <button onClick={onComplete} className="btn btn-primary text-xs">
              Mark MLS Setup Complete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgentChecklistPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [completions, setCompletions] = useState<Record<string, Completion>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [showComplete, setShowComplete] = useState(false)
  const confettiFired = useRef(false)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          router.push('/auth/login')
          return
        }
        const data = await res.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    fetchUser()
  }, [router])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const fireConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#C5A278', '#1A1A1A', '#ffffff', '#d4b896'],
    })
    setTimeout(
      () =>
        confetti({
          particleCount: 80,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#C5A278', '#1A1A1A', '#ffffff'],
        }),
      300
    )
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/checklist/list?user_id=${user.id}`)
      if (!res.ok) throw new Error('Failed to load checklist')
      const data = await res.json()

      setItems(data.items || [])
      const completionMap: Record<string, Completion> = {}
      for (const c of data.completions || []) {
        completionMap[c.checklist_item_id] = c
      }
      setCompletions(completionMap)

      const total = (data.items || []).length
      const completed = (data.completions || []).length
      if (total > 0 && completed === total && !confettiFired.current) {
        confettiFired.current = true
        setShowComplete(true)
      }
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
      const res = await fetch('/api/checklist/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isCompleted ? 'uncomplete' : 'complete',
          user_id: user.id,
          checklist_item_id: item.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to toggle item')

      if (isCompleted) {
        setCompletions(prev => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
        setShowComplete(false)
        confettiFired.current = false
      } else {
        const newCompletions = {
          ...completions,
          [item.id]: { checklist_item_id: item.id, completed_at: new Date().toISOString() },
        }
        setCompletions(newCompletions)
        if (Object.keys(newCompletions).length === items.length && !confettiFired.current) {
          confettiFired.current = true
          setShowComplete(true)
          fireConfetti()
          // Notify office that agent completed their onboarding checklist
          fetch('/api/checklist/send-completion-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(e => console.error('Failed to send completion notification:', e))
        }
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

  const sections = items.reduce(
    (acc, item) => {
      if (!acc[item.section]) acc[item.section] = { title: item.section_title, items: [] }
      acc[item.section].items.push(item)
      return acc
    },
    {} as Record<string, { title: string; items: ChecklistItem[] }>
  )

  const totalItems = items.length
  const completedCount = Object.keys(completions).length
  const progress = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0

  if (loading)
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading checklist...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">ONBOARDING CHECKLIST</h1>
        <span className="text-sm text-luxury-gray-3">
          {completedCount} of {totalItems} complete
        </span>
      </div>

      {showComplete && (
        <div className="container-card mb-6 border border-luxury-accent bg-luxury-light text-center py-8">
          <PartyPopper size={40} className="text-luxury-accent mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-luxury-gray-1 mb-1">You're all set!</h2>
          <p className="text-sm text-luxury-gray-3">
            You've completed your onboarding checklist. Welcome to Collective Realty Co.
          </p>
        </div>
      )}

      <div className="container-card mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-luxury-gray-3">Your Progress</p>
          <p className="text-xs font-semibold text-luxury-gray-1">{progress}%</p>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(sections).map(([sectionKey, section]) => {
          const sectionCompleted = section.items.filter(i => completions[i.id]).length
          const isCollapsed = collapsedSections[sectionKey]
          return (
            <div key={sectionKey} className="container-card">
              <button
                onClick={() => toggleSection(sectionKey)}
                className="w-full flex items-center justify-between mb-1"
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-luxury-gray-1">{section.title}</h2>
                  <span className="text-xs text-luxury-gray-3">
                    {sectionCompleted}/{section.items.length}
                  </span>
                </div>
                {isCollapsed ? (
                  <ChevronDown size={16} className="text-luxury-gray-3" />
                ) : (
                  <ChevronUp size={16} className="text-luxury-gray-3" />
                )}
              </button>
              {!isCollapsed && (
                <div className="space-y-2 mt-3">
                  {section.items.map(item => {
                    const isCompleted = !!completions[item.id]
                    if (item.item_key === 'mls_setup') {
                      return (
                        <MLSSetupCard
                          key={item.id}
                          item={item}
                          isCompleted={isCompleted}
                          onComplete={() => toggleItem(item)}
                        />
                      )
                    }
                    return (
                      <div
                        key={item.id}
                        className={`inner-card flex items-start gap-3 cursor-pointer transition-colors ${isCompleted ? 'opacity-70' : ''}`}
                        onClick={() => toggleItem(item)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted ? (
                            <CheckCircle2 size={18} className="text-green-600" />
                          ) : (
                            <Circle size={18} className="text-luxury-gray-3" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-medium ${isCompleted ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}
                            >
                              {item.label}
                            </span>
                            {item.priority === 'high' && !isCompleted && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                                Priority
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-luxury-gray-3 mt-0.5">{item.description}</p>
                          )}
                          {(item.link_url || item.second_link_url) && (
                            <div className="flex gap-3 mt-1.5" onClick={e => e.stopPropagation()}>
                              {item.link_url && (
                                <a
                                  href={item.link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink size={11} /> {item.link_text}
                                </a>
                              )}
                              {item.second_link_url && (
                                <a
                                  href={item.second_link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                                >
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