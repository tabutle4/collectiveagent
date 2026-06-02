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
  'Monthly Apartment Locator Q&A With Maureen Eno',
  'Collective Access Coaching In Dallas With Terraneka Hill',
  'Collective Access Coaching In Houston With Eric Roberts',
  'Collective Access Coaching In Houston And Dallas With Eric Roberts And Terraneka Hill',
  'Monthly Lease Training With Briana Thomas',
  'Navigating the Training Center, Coaching & Onboarding',
  'Other',
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
  const [folders, setFolders] = useState<string[]>([])
  const [context, setContext] = useState<any>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load folders dynamically
    fetch('/api/zoom/sharepoint-folders')
      .then(r => r.json())
      .then(d => { if (d.folders?.length) setFolders(d.folders) })

    // Load job
    fetch(`/api/zoom/recording-jobs?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.job) {
          setJob(d.job)
          const t = d.job.final_title || d.job.suggested_title || ''
          setTitle(t)
          setFolder(d.job.final_folder || d.job.suggested_folder || '')
          setTopics(extractTopics(t))
          setProgram(extractProgram(t))
          if (d.job.sharepoint_url) setSharePointUrl(d.job.sharepoint_url)

          // Load recording context (Fathom + calendar)
          const recordingDate = d.job.start_time?.slice(0, 10)
          if (recordingDate) {
            fetch(`/api/zoom/recording-context?date=${recordingDate}&jobId=${id}`)
              .then(r => r.json())
              .then(ctx => {
                setContext(ctx)
                setSystemPrompt(ctx.systemPrompt || '')
              })
          }
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
      const res = await fetch('/api/zoom/recording-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context: {
            meetingTitle: job?.meeting_title || '',
            title,
            folder,
            topics: topics.join(', '),
            transcript: context?.transcriptExcerpt || '',
            folders: folders.join(', '),
            programs: PROGRAM_NAMES.join(', '),
            systemPrompt,
          },
        }),
      })
      const data = await res.json()
      setChatMessages([...newMessages, { role: 'assistant', content: data.reply }])
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  async function aiSuggestAll() {
    setAiSuggesting(true)
    try {
      const res = await fetch('/api/zoom/recording-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Based on the calendar and transcript data, suggest the correct program name, 3-4 topic tags, and the best SharePoint folder for this recording. Respond with only this JSON: {"program": "Program Name", "topics": ["Topic 1", "Topic 2", "Topic 3"], "folder": "Folder Name", "title": "Full title in correct format"}`
          }],
          context: {
            meetingTitle: job?.meeting_title || '',
            title,
            folder,
            topics: topics.join(', '),
            transcript: context?.transcriptExcerpt || '',
            folders: folders.join(', '),
            programs: PROGRAM_NAMES.join(', '),
            systemPrompt,
          },
        }),
      })
      const data = await res.json()
      const text = data.reply || '{}'
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      if (parsed.program) setProgram(parsed.program)
      if (parsed.topics) {
        setTopics(parsed.topics)
      }
      if (parsed.title) setTitle(parsed.title)
      if (parsed.folder && folders.includes(parsed.folder)) setFolder(parsed.folder)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Based on the calendar and transcript, I suggest:\n\nProgram: ${parsed.program}\nTitle: ${parsed.title}\nFolder: ${parsed.folder}\nTopics: ${parsed.topics?.join(', ')}\n\nFeel free to adjust anything.`
      }])
    } catch { }
    finally { setAiSuggesting(false) }
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
        <p className="text-luxury-gray-3 text-sm mb-4">This may take a few minutes. Agents will receive an email when ready.</p>
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
        <div className="container-card p-4">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Original Zoom Title</p>
          <p className="text-luxury-gray-2">{job.meeting_title}</p>
          {context?.calendarEvents?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-luxury-dark-3">
              <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Scheduled Sessions This Day</p>
              {context.calendarEvents.map((e: any, i: number) => (
                <p key={i} className="text-luxury-gray-3 text-xs">
                  {e.start?.dateTime?.slice(11, 16)} UTC - {e.subject}
                  {e.hasGuest && <span className="ml-1 text-luxury-accent">[Guest presenter]</span>}
                </p>
              ))}
            </div>
          )}
          {context?.speakers?.length > 0 && (
            <div className="mt-2">
              <p className="text-luxury-gray-3 text-xs">Fathom speakers: {context.speakers.join(', ')}</p>
            </div>
          )}
        </div>

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

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-luxury-gray-2 text-sm font-medium">Topic Tags</label>
            <button
              onClick={aiSuggestAll}
              disabled={aiSuggesting}
              className="flex items-center gap-1.5 text-luxury-accent text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              <Sparkles size={13} />
              {aiSuggesting ? 'Suggesting...' : 'AI Suggest All'}
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
            {topics.length === 0 && <p className="text-luxury-gray-3 text-xs">No topics yet. Use AI Suggest or add manually.</p>}
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

        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">SharePoint Folder</label>
          <select
            value={folder}
            onChange={e => setFolder(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          >
            <option value="">Select a folder...</option>
            {folders.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="container-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-luxury-accent" />
            <p className="text-luxury-gray-2 text-sm font-medium">AI Assistant</p>
          </div>
          <p className="text-luxury-gray-3 text-xs mb-3">
            I have access to the calendar for this day and the Fathom transcript. Ask me to identify the program, suggest a title, or explain what was covered.
          </p>

          {chatMessages.length > 0 && (
            <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${msg.role === 'user' ? 'bg-luxury-dark-3 text-luxury-white ml-8' : 'bg-luxury-accent/10 text-luxury-gray-2 mr-8'}`}>
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="bg-luxury-accent/10 text-luxury-gray-3 text-sm rounded-lg px-3 py-2 mr-8">Thinking...</div>
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
              placeholder='e.g. "What program is this?" or "What was covered?"'
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
