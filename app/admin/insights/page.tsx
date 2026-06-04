'use client'

import { useEffect, useState, useRef } from 'react'
import { Sparkles, Send, RefreshCw, TrendingUp, Users, AlertCircle, Mic, Award, AlertTriangle, BarChart2 } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_QUESTIONS = [
  'Who should Courtney consider for co-agent opportunities?',
  'Which agents have great attendance but low production?',
  'What training topics keep coming up that we should prioritize?',
  'Which programs have the lowest attendance and why?',
  'Who are the retention risks and what should Courtney say to them?',
  'What patterns do you see between training attendance and production?',
]

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    zoom: 'bg-blue-900 text-blue-300',
    fathom: 'bg-purple-900 text-purple-300',
    sharepoint: 'bg-green-900 text-green-300',
    transactions: 'bg-amber-900 text-amber-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${styles[source] || 'bg-luxury-dark-3 text-luxury-gray-2'}`}>
      {source}
    </span>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function loadData() {
    setLoading(true)
    setChatMessages([])
    try {
      const res = await fetch(`/api/admin/insights?from=${dateFrom}&to=${dateTo}`)
      const d = await res.json()
      setData(d)
      await generateOpeningInsight(d)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function generateOpeningInsight(insightData: any) {
    setInitializing(true)
    try {
      const res = await fetch('/api/admin/insights/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Give me a thorough executive summary of what you see in this data for ${insightData.dateFrom} to ${insightData.dateTo}. Cover: top agents to recognize and why, agents who attend training consistently but aren't closing (best co-agent candidates), agents not attending at all, any retention risks you see, and the most important training gap. Be specific with names and numbers.` }],
          data: insightData,
        }),
      })
      const d = await res.json()
      setChatMessages([
        { role: 'user', content: `Executive summary for ${insightData.dateFrom} to ${insightData.dateTo}` },
        { role: 'assistant', content: d.reply },
      ])
    } catch { }
    finally { setInitializing(false) }
  }

  async function sendMessage(message: string) {
    if (!message.trim() || !data) return
    setChatLoading(true)
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }]
    setChatMessages(newMessages)
    setChatInput('')
    try {
      const res = await fetch('/api/admin/insights/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          data,
        }),
      })
      const d = await res.json()
      setChatMessages([...newMessages, { role: 'assistant', content: d.reply }])
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const attendanceSrc = data?.attendanceSource || 'fathom'

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div>
          <h1 className="page-title mb-1">Coaching Insights</h1>
          <p className="text-luxury-gray-3 text-sm">Training, attendance, and agent performance analysis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-3 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          />
          <span className="text-luxury-gray-3 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-3 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-luxury-gray-3 text-sm">Loading insights...</div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Active Agents</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.totalAgents}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Agents with Closes</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.agentsWithCloses}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Transactions</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.totalTransactions}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Videos in SharePoint</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.sharePointVideos}</p>
            </div>
          </div>

          {/* Production & Attendance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">

            {/* Top producers */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Top Producers</p>
                </div>
                <SourceBadge source="transactions" />
              </div>
              {data.topProducers?.length > 0 ? (
                <div className="space-y-3">
                  {data.topProducers.slice(0, 6).map((agent: any, i: number) => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <span className="text-luxury-gray-3 text-xs w-4 shrink-0">{i + 1}</span>
                      <span className="text-luxury-black text-sm flex-1 min-w-0 truncate">{agent.name}</span>
                      <span className="text-luxury-accent text-sm font-medium shrink-0">{agent.closes} closes</span>
                      <span className="text-luxury-gray-3 text-xs shrink-0">{agent.attendanceSessions}s</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No production data yet</p>
              )}
            </div>

            {/* Highest attendance */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Highest Attendance</p>
                </div>
                <div className="flex items-center gap-1">
                  <SourceBadge source={attendanceSrc} />
                  {attendanceSrc === 'fathom' && <span className="text-luxury-gray-3 text-xs">fallback</span>}
                </div>
              </div>
              {data.highestAttendance?.length > 0 ? (
                <div className="space-y-3">
                  {data.highestAttendance.map((agent: any, i: number) => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <span className="text-luxury-gray-3 text-xs w-4 shrink-0">{i + 1}</span>
                      <span className="text-luxury-black text-sm flex-1 min-w-0 truncate">{agent.name}</span>
                      <span className="text-luxury-accent text-sm font-medium shrink-0">{agent.attendanceSessions} sessions</span>
                      <span className="text-luxury-gray-3 text-xs shrink-0">{agent.closes}c</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No attendance data yet.</p>
              )}
            </div>

            {/* Not attending */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Not Attending Training</p>
                </div>
                <div className="flex items-center gap-1">
                  <SourceBadge source={attendanceSrc} />
                  {attendanceSrc === 'fathom' && <span className="text-luxury-gray-3 text-xs">fallback</span>}
                </div>
              </div>
              {data.notAttending?.length > 0 ? (
                <div className="space-y-3">
                  {data.notAttending.slice(0, 6).map((agent: any) => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <span className="text-luxury-black text-sm flex-1 min-w-0 truncate">{agent.name}</span>
                      <span className="text-luxury-gray-3 text-xs shrink-0">{agent.closes} closes</span>
                    </div>
                  ))}
                  {data.notAttending.length > 6 && (
                    <p className="text-luxury-gray-3 text-xs">+{data.notAttending.length - 6} more</p>
                  )}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">All agents attending</p>
              )}
            </div>
          </div>

          {/* Engagement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

            {/* Most active speakers */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Most Active Speakers</p>
                </div>
                <SourceBadge source="fathom" />
              </div>
              {data.topSpeakers?.length > 0 ? (
                <div className="space-y-3">
                  {data.topSpeakers.map((speaker: any, i: number) => (
                    <div key={speaker.name} className="flex items-center gap-2">
                      <span className="text-luxury-gray-3 text-xs w-4 shrink-0">{i + 1}</span>
                      <span className="text-luxury-black text-sm flex-1 min-w-0 truncate">{speaker.name}</span>
                      <span className="text-luxury-accent text-sm font-medium shrink-0">{speaker.count} sessions</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No Fathom speaker data yet.</p>
              )}
            </div>

            {/* Retention risk */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Retention Risk</p>
                </div>
                <SourceBadge source="transactions" />
              </div>
              {data.retentionRisk?.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {data.retentionRisk.slice(0, 5).map((agent: any) => (
                      <div key={agent.id} className="flex items-center gap-2">
                        <span className="text-luxury-black text-sm flex-1 min-w-0 truncate">{agent.name}</span>
                        <span className="text-luxury-gray-3 text-xs shrink-0">was active, now silent</span>
                      </div>
                    ))}
                  </div>
                  {data.retentionRisk.length > 0 && (
                    <button
                      onClick={() => sendMessage('Show me all retention risk agents and what Courtney should say to each one to re-engage them.')}
                      className="mt-3 text-luxury-accent text-xs underline"
                    >
                      Ask AI what to say to each one
                    </button>
                  )}
                </>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No retention risks detected this period.</p>
              )}
            </div>
          </div>

          {/* Session attendance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

            {/* Highest attended sessions */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Highest Attended Sessions</p>
                </div>
                <SourceBadge source="zoom" />
              </div>
              {data.bestAttended?.length > 0 ? (
                <div className="space-y-3">
                  {data.bestAttended.map((session: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-luxury-black text-sm flex-1 min-w-0 line-clamp-1">{session.title}</span>
                      <span className="text-luxury-accent text-sm font-medium shrink-0">{session.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">Attendance data will appear as new sessions are recorded.</p>
              )}
            </div>

            {/* Lowest attended sessions */}
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Lowest Attended Sessions</p>
                </div>
                <SourceBadge source="zoom" />
              </div>
              {data.worstAttended?.length > 0 ? (
                <div className="space-y-3">
                  {data.worstAttended.map((session: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-luxury-black text-sm flex-1 min-w-0 line-clamp-1">{session.title}</span>
                      <span className="text-red-400 text-sm font-medium shrink-0">{session.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">Attendance data will appear as new sessions are recorded.</p>
              )}
            </div>
          </div>

          {/* Videos by program */}
          {Object.keys(data.videosByFolder || {}).length > 0 && (
            <div className="container-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-luxury-accent" />
                  <p className="text-luxury-gray-2 font-medium text-sm">Videos by Program</p>
                </div>
                <SourceBadge source="sharepoint" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(data.videosByFolder).map(([program, count]: [string, any]) => (
                  <div key={program} className="inner-card p-3">
                    <p className="text-luxury-gray-3 text-xs mb-1 line-clamp-2">{program}</p>
                    <p className="text-luxury-black font-semibold">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Chat */}
          <div className="container-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-luxury-accent" />
              <p className="text-luxury-gray-2 font-medium">AI Insights Chat</p>
            </div>
            <p className="text-luxury-gray-3 text-xs mb-4">Ask anything about your agents, training, and performance data.</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={chatLoading || initializing}
                  className="text-xs px-2 py-1 sm:px-3 sm:py-1.5 bg-luxury-dark-1 border border-luxury-dark-3 text-luxury-gray-2 rounded-full hover:border-luxury-accent hover:text-luxury-white transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {(chatMessages.length > 0 || initializing) && (
              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {initializing && (
                  <div className="bg-luxury-accent/10 text-luxury-gray-2 text-sm rounded-lg px-4 py-3 mr-6 sm:mr-8">
                    Analyzing your data...
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-4 py-3 whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-luxury-dark-3 text-luxury-white ml-6 sm:ml-12'
                        : 'bg-luxury-accent/10 text-luxury-gray-2 mr-6 sm:mr-8'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="bg-luxury-accent/10 text-luxury-gray-3 text-sm rounded-lg px-4 py-3 mr-6 sm:mr-8">
                    Thinking...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !chatLoading && sendMessage(chatInput)}
                placeholder="Ask about your agents, training trends, or performance patterns..."
                className="flex-1 bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
              />
              <button
                onClick={() => sendMessage(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-luxury-accent text-luxury-black p-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
