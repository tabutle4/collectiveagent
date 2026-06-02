'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Send, Sparkles, X } from 'lucide-react'

const PROGRAM_NAMES = [
  'Industry Intelligence & Market Mastery Meeting',
  'Next Level Lead Gen & Marketing Coaching',
  'New Agent Coaching Circle',
  'Convert & Close Coaching',
  'Seasoned Agent Coaching Circle',
  'Monthly Apartment Locator Q&A',
  'Collective Access Division Coaching - Dallas',
  'Collective Access Division Coaching - Houston',
  'Monthly Lease Training',
  'Navigating the Training Center, Coaching & Onboarding',
  'Other',
]

const SHAREPOINT_FOLDERS = [
  'Announcement Recordings',
  'Brokermint',
  'Builders',
  'Business Strategy',
  'Business Taxes',
  'Collective Access Division Coaching - Dallas',
  'Collective Access Division Coaching - Houston',
  'Commercial',
  'Comps',
  'Contracts',
  'Convert & Close Coaching',
  'Daily Prospecting',
  'Document Review',
  'Home Warranty',
  'Inspections',
  'Insurance',
  'Leasing',
  'Lender Market Updates',
  'Lending',
  'Listings',
  'Market Update',
  'Marketing',
  'Navigating the Training Center, Compliance, & Onboarding',
  'New Agent Coaching Circle',
  'New Construction',
  'Prospecting',
  'Representing Buyers',
  'Representing Sellers and Landlords',
  'Sales Meetings',
  'Seasoned Agent Coaching Circle',
  'Title Company Guest Trainings',
]

function buildTitle(program: string, suggestedTitle: string): string {
  if (!suggestedTitle) return ''
  const parts = suggestedTitle.split(' - ')
  if (parts.length >= 2) {
    return [program, ...parts.slice(1)].join(' - ')
  }
  return program
}

function extractTopics(title: string): string[] {
  const parts = title.split(' - ')
  // Skip program name (index 0) and date (index 1), rest are topics
  return parts.slice(2).filter(Boolean)
}

function rebuildTitle(program: string, date: string, topics: string[]): string {
  return [program, date, ...topics].filter(Boolean).join(' - ')
}

function extractDate(title: string): string {
  const parts = title.split(' - ')
  return parts[1] || ''
}

function extractProgram(title: string): string {
  return title.split(' - ')[0] || ''
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function RecordingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState('')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sharePointUrl, setSharePointUrl] = useState('')

  // AI assistant
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/zoom/recording-jobs?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.job) {
          setJob(d.job)
          const t = d.job.final_title || d.job.suggested_title || ''
          setTitle(t)
          setFolder(d.job.final_folder || d.job.suggested_folder || SHAREPOINT_FOLDERS[0])
          setTopics(extractTopics(t))
          setProgram(extractProgram(t))
          if (d.job.sharepoint_url) setSharePointUrl(d.job.sharepoint_url)
        }
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function handleProgramChange(p: string) {
    setProgram(p)
    if (p && job?.suggested_title) {
      const newTitle = buildTitle(p, job.suggested_title)
      setTitle(newTitle)
      setTopics(extractTopics(newTitle))
    }
  }

  function addTopic() {
    if (!newTopic.trim()) return
    const updated = [...topics, newTopic.trim()]
    setTopics(updated)
    setNewTopic('')
    setTitle(rebuildTitle(program, extractDate(title), updated))
  }

  function removeTopic(index: number) {
    const updated = topics.filter((_, i) => i !== index)
    setTopics(updated)
    setTitle(rebuildTitle(program, extractDate(title), updated))
  }

  async function askAI(userMessage: string) {
    if (!userMessage.trim()) return
    setChatLoading(true)
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMessage }]
    setChatMessages(newMessages)
    setChatInput('')

    try {
      const transcript = job?.transcript_excerpt || ''
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: `You are an assistant helping a real estate brokerage administrator name and categorize a Zoom training recording.

Current recording info:
- Meeting title: ${job?.meeting_title || ''}
- Current recording title: ${title}
- Current folder: ${folder}
- Current topics: ${topics.join(', ')}
- Transcript excerpt: ${transcript}

Available SharePoint folders: ${SHAREPOINT_FOLDERS.join(', ')}
Available programs: ${PROGRAM_NAMES.join(', ')}

Help the user refine the title, suggest topics, or recommend a folder. When suggesting a new title or topics, format them clearly so the user can apply them. Keep responses concise and practical.`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
      setChatMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  async function aiSuggestAll() {
    setAiSuggesting(true)
    try {
      const transcript = job?.transcript_excerpt || job?.meeting_title || ''
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: 'You are helping categorize a real estate training recording. Respond only with valid JSON, no markdown.',
          messages: [{
            role: 'user',
            content: `Given this recording:
- Meeting title: ${job?.meeting_title}
- Current title: ${title}
- Transcript: ${transcript}

Available folders: ${SHAREPOINT_FOLDERS.join(', ')}

Suggest:
1. 3-4 topic tags (3-6 words each, title case)
2. The best SharePoint folder from the list above

Respond with only this JSON: {"topics": ["Topic 1", "Topic 2", "Topic 3"], "folder": "Folder Name"}`
          }],
        }),
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '{}'
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      if (parsed.topics) {
        setTopics(parsed.topics)
        setTitle(rebuildTitle(program, extractDate(title), parsed.topics))
      }
      if (parsed.folder && SHAREPOINT_FOLDERS.includes(parsed.folder)) {
        setFolder(parsed.folder)
      }
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `I suggested these topics: ${parsed.topics?.join(', ')}. Folder set to: ${parsed.folder}. Feel free to ask me to adjust anything.`
      }])
    } catch {
      // silent fail — user still has manual controls
    } finally {
      setAiSuggesting(false)
    }
  }

  async function handleConfirm() {
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/zoom/recording-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id, finalTitle: title, folder }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setSharePointUrl(data.webUrl || '')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><p className="text-luxury-gray-3">Loading...</p></div>
  if (!job) return <div className="p-6 max-w-3xl mx-auto"><p className="text-luxury-gray-3">Recording not found.</p></div>

  if (success) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-green-900/30 border border-green-700 rounded-lg p-6 text-center">
        <p className="text-green-300 text-lg font-medium mb-2">Uploading to SharePoint</p>
        <p className="text-luxury-gray-3 text-sm mb-4">This may take a few minutes depending on file size. Agents will receive an email when it is ready.</p>
        {sharePointUrl && (
          <a href={sharePointUrl} target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline text-sm block mb-4">
            View in SharePoint
          </a>
        )}
        <button onClick={() => router.push('/admin/recordings')} className="text-luxury-gray-3 text-sm underline">
          Back to Recordings
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => router.push('/admin/recordings')} className="text-luxury-gray-3 text-sm mb-6 hover:text-luxury-white transition-colors">
        Back to Recordings
      </button>

      <h1 className="page-title mb-2">Review Recording</h1>
      <p className="text-luxury-gray-3 text-sm mb-8">Confirm the title and destination folder before uploading to SharePoint.</p>

      <div className="space-y-6">
        {/* Original title */}
        <div className="container-card p-4">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Original Zoom Title</p>
          <p className="text-luxury-gray-2">{job.meeting_title}</p>
        </div>

        {/* Program picker */}
        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">Program Name</label>
          <select
            value={program}
            onChange={e => handleProgramChange(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          >
            <option value="">Select a program...</option>
            {PROGRAM_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Topic chips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-luxury-gray-2 text-sm font-medium">Topic Tags</label>
            <button
              onClick={aiSuggestAll}
              disabled={aiSuggesting}
              className="flex items-center gap-1.5 text-luxury-accent text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              <Sparkles size={13} />
              {aiSuggesting ? 'Suggesting...' : 'AI Suggest'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {topics.map((topic, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-luxury-dark-1 border border-luxury-dark-3 text-luxury-white text-xs px-3 py-1.5 rounded-full">
                {topic}
                <button onClick={() => removeTopic(i)} className="text-luxury-gray-3 hover:text-red-400 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
            {topics.length === 0 && <p className="text-luxury-gray-3 text-xs">No topics yet. Add some below or use AI Suggest.</p>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTopic()}
              placeholder="Add a topic tag..."
              className="flex-1 bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
            />
            <button onClick={addTopic} className="btn-primary px-4 py-2 text-sm">Add</button>
          </div>
        </div>

        {/* Full title preview */}
        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">Recording Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          />
          <p className="text-luxury-gray-3 text-xs mt-1">Format: Program Name - M-D-YY - Topic 1 - Topic 2 - Topic 3</p>
        </div>

        {/* Folder picker */}
        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">SharePoint Folder</label>
          <select
            value={folder}
            onChange={e => setFolder(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          >
            {SHAREPOINT_FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* AI Chat */}
        <div className="container-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-luxury-accent" />
            <p className="text-luxury-gray-2 text-sm font-medium">AI Assistant</p>
          </div>
          <p className="text-luxury-gray-3 text-xs mb-3">Ask me to refine the title, suggest topics, recommend a folder, or summarize what was covered.</p>

          {chatMessages.length > 0 && (
            <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`text-sm rounded-lg px-3 py-2 ${msg.role === 'user' ? 'bg-luxury-dark-3 text-luxury-white ml-8' : 'bg-luxury-accent/10 text-luxury-gray-2 mr-8'}`}>
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="bg-luxury-accent/10 text-luxury-gray-3 text-sm rounded-lg px-3 py-2 mr-8">
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
              onKeyDown={e => e.key === 'Enter' && !chatLoading && askAI(chatInput)}
              placeholder='e.g. "Make the title shorter" or "What folder fits best?"'
              className="flex-1 bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
            />
            <button
              onClick={() => askAI(chatInput)}
              disabled={chatLoading || !chatInput.trim()}
              className="bg-luxury-accent text-luxury-black p-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Status messages */}
        {job.status === 'uploaded' && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
            <p className="text-green-300 text-sm font-medium mb-1">Already uploaded to SharePoint</p>
            {job.sharepoint_url && (
              <a href={job.sharepoint_url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline text-sm">
                View in SharePoint
              </a>
            )}
          </div>
        )}

        {job.status === 'error' && job.error_message && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm font-medium mb-1">Previous upload failed</p>
            <p className="text-red-400 text-xs">{job.error_message}</p>
            <p className="text-luxury-gray-3 text-xs mt-1">You can try again below.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {job.status !== 'uploaded' && (
          <button
            onClick={handleConfirm}
            disabled={uploading || !title.trim() || !folder}
            className="w-full bg-luxury-accent text-luxury-black font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading to SharePoint...' : 'Confirm & Upload to SharePoint'}
          </button>
        )}
      </div>
    </div>
  )
}
