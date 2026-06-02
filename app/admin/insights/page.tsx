'use client'

import { useEffect, useState, useRef } from 'react'
import { Sparkles, Send, RefreshCw, TrendingUp, Users, AlertCircle, Award } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_QUESTIONS = [
  'Who should Courtney consider as a co-agent on her next deal?',
  'Which agents have great attendance but low production?',
  'What training topics keep coming up that we should prioritize?',
  'Which agents haven\'t attended training in the last 30 days?',
  'Who are the most engaged agents overall right now?',
  'What patterns do you see between training attendance and production?',
]

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

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function loadData() {
    setLoading(true)
    setChatMessages([])
    try {
      const res = await fetch(`/api/admin/insights?from=${dateFrom}&to=${dateTo}`)
      const d = await res.json()
      setData(d)
      // Auto-generate opening insight
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
          messages: [{ role: 'user', content: `Give me a brief executive summary of what you see in this data for ${insightData.dateFrom} to ${insightData.dateTo}. Cover: top 3 agents to consider rewarding and why, any attendance concerns, and the most important training gap you see. Be specific with names.` }],
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title mb-1">Coaching Insights</h1>
          <p className="text-luxury-gray-3 text-sm">Training, attendance, and agent performance analysis.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <div className="grid grid-cols-4 gap-4">
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Active Agents</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.totalAgents}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Training Sessions</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.totalSessions}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Transactions</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.totalTransactions}</p>
            </div>
            <div className="container-card p-4">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Recordings Available</p>
              <p className="text-2xl font-semibold text-luxury-black">{data.summary?.fathomRecordings}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Top producers */}
            <div className="container-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-luxury-accent" />
                <p className="text-luxury-gray-2 font-medium text-sm">Top Producers</p>
              </div>
              {data.topProducers?.length > 0 ? (
                <div className="space-y-3">
                  {data.topProducers.slice(0, 6).map((agent: any, i: number) => (
                    <div key={agent.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-luxury-gray-3 text-xs w-4">{i + 1}</span>
                        <span className="text-luxury-black text-sm">{agent.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-luxury-accent text-sm font-medium">{agent.closes} closes</span>
                        <span className="text-luxury-gray-3 text-xs ml-2">{agent.attendanceSessions} sessions</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No production data yet</p>
              )}
            </div>

            {/* Top attendees */}
            <div className="container-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Award size={16} className="text-luxury-accent" />
                <p className="text-luxury-gray-2 font-medium text-sm">Most Engaged in Training</p>
              </div>
              {data.topAttendees?.length > 0 ? (
                <div className="space-y-3">
                  {data.topAttendees.slice(0, 6).map((agent: any, i: number) => (
                    <div key={agent.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-luxury-gray-3 text-xs w-4">{i + 1}</span>
                        <span className="text-luxury-black text-sm">{agent.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-luxury-accent text-sm font-medium">{agent.attendanceSessions} sessions</span>
                        <span className="text-luxury-gray-3 text-xs ml-2">{agent.closes} closes</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-luxury-gray-3 text-sm">No attendance data yet. Set up Zoom OAuth to enable this.</p>
              )}
            </div>

            {/* Needs attention */}
            <div className="container-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle size={16} className="text-luxury-accent" />
                <p className="text-luxury-gray-2 font-medium text-sm">Not Attending Training</p>
              </div>
              {data.notAttending?.length > 0 ? (
                <div className="space-y-3">
                  {data.notAttending.slice(0, 6).map((agent: any) => (
                    <div key={agent.id} className="flex items-center justify-between">
                      <span className="text-luxury-black text-sm">{agent.name}</span>
                      <span className="text-luxury-gray-3 text-xs">{agent.closes} closes</span>
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

          {/* Sessions by program */}
          {Object.keys(data.sessionsByProgram || {}).length > 0 && (
            <div className="container-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-luxury-accent" />
                <p className="text-luxury-gray-2 font-medium text-sm">Sessions by Program</p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(data.sessionsByProgram).map(([program, count]: [string, any]) => (
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

            {/* Quick questions */}
            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={chatLoading || initializing}
                  className="text-xs px-3 py-1.5 bg-luxury-dark-1 border border-luxury-dark-3 text-luxury-gray-2 rounded-full hover:border-luxury-accent hover:text-luxury-white transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Chat messages */}
            {(chatMessages.length > 0 || initializing) && (
              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {initializing && (
                  <div className="bg-luxury-accent/10 text-luxury-gray-2 text-sm rounded-lg px-4 py-3 mr-8">
                    Analyzing your data...
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-4 py-3 whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-luxury-dark-3 text-luxury-white ml-12'
                        : 'bg-luxury-accent/10 text-luxury-gray-2 mr-8'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="bg-luxury-accent/10 text-luxury-gray-3 text-sm rounded-lg px-4 py-3 mr-8">
                    Thinking...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
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
