'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Send, Sparkles, X, ChevronLeft } from 'lucide-react'

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

function extractDate(title: string): string {
  return title.split(' - ')[1] || ''
}

function extractProgram(title: string): string {
  return title.split(' - ')[0] || ''
}

function extractTopics(title: string): string[] {
  return title.split(' - ').slice(2).filter(Boolean)
}

function rebuildTitle(program: string, date: string, topics: string[]): string {
  return [program, date, ...topics].filter(Boolean).join(' - ')
}

function buildDescription(title: string, summary: string): string {
  if (!title && !summary) return ''
  if (!summary) return title
  if (!title) return summary
  return `${title}\n\n${summary}`
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export default function RecordingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState('')
  const [date, setDate] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [folderSearch, setFolderSearch] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [zoomSummary, setZoomSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcriptSource, setTranscriptSource] = useState<string[]>([])
  const [summaryFetched, setSummaryFetched] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript' | 'chat'>('transcript')
  const [chatTranscript, setChatTranscript] = useState('')
  const [descriptionEdited, setDescriptionEdited] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendAgentEmail, setSendAgentEmail] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sharePointUrl, setSharePointUrl] = useState('')
  const [context, setContext] = useState<any>(null)
  const [fathomAvailable, setFathomAvailable] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (!d.permissions?.includes('can_manage_recordings')) setUnauthorized(true) })
      .catch(() => router.push('/auth/login'))
  }, [router])

  useEffect(() => {
    fetch('/api/zoom/sharepoint-folders')
      .then(r => r.json())
      .then(d => { if (d.folders?.length) setFolders(d.folders) })

    fetch(`/api/zoom/recording-jobs?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.job) {
          const j = d.job
          setJob(j)
          const t = j.final_title || j.suggested_title || ''
          setTitle(t)
          setFolder(j.final_folder || j.suggested_folder || '')
          setProgram(extractProgram(t))
          setDate(extractDate(t))
          setTopics(extractTopics(t))
          if (j.sharepoint_url) setSharePointUrl(j.sharepoint_url)

          // Load each field directly — no parsing needed
          const sources: string[] = []
          if (j.transcript_text) {
            sources.push('Transcript')
            setTranscript(j.transcript_text)
          }
          if (j.chat_text) {
            sources.push('Chat')
            setChatTranscript(j.chat_text)
          }
          if (j.zoom_summary) {
            setZoomSummary(j.zoom_summary)
            setDescription(buildDescription(j.final_title || j.suggested_title || '', j.zoom_summary))
            setSummaryFetched(true)
          }
          setTranscriptSource(sources)

          // Extract AI-suggested topics from suggested_title for clickable chips
          if (j.suggested_title) {
            const sugg = extractTopics(j.suggested_title)
            setSuggestedTopics(sugg)
          }

          // Load calendar context
          if (j.start_time) {
            fetch(`/api/zoom/recording-context?date=${j.start_time.slice(0, 10)}&jobId=${id}&startTime=${encodeURIComponent(j.start_time)}`)
              .then(r => r.json())
              .then(ctx => {
                setContext(ctx)
                if (ctx.fathomMeetings?.length > 0) setFathomAvailable(true)
              })
          }

          // Call Zoom if any of the three fields are missing
          const hasTranscript = !!j.transcript_text
          const hasChat = !!j.chat_text
          const hasSummary = !!j.zoom_summary
          if (!hasTranscript || !hasChat || !hasSummary) {
            fetch(`/api/zoom/recording-summary?jobId=${id}`)
              .then(r => r.json())
              .then(s => {
                if (s.summary) {
                  setZoomSummary(s.summary)
                  setTranscriptSource(prev => [...new Set([...prev, 'Summary'])])
                  if (!descriptionEdited) {
                    setDescription(buildDescription(t, s.summary))
                  }
                }
                if (s.transcript && !hasTranscript) {
                  setTranscript(s.transcript)
                  setTranscriptSource(prev => [...new Set([...prev, 'Transcript'])])
                }
                if (s.chat && !hasChat) {
                  setChatTranscript(s.chat)
                  setTranscriptSource(prev => [...new Set([...prev, 'Chat'])])
                }
                setSummaryFetched(true)
              })
              .catch(() => setSummaryFetched(true))
          } else {
            setSummaryFetched(true)
          }
        }
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // When title changes, update description if user hasn't manually edited it
  useEffect(() => {
    if (!descriptionEdited && zoomSummary) {
      setDescription(buildDescription(title, zoomSummary))
    }
  }, [title, zoomSummary, descriptionEdited])

  function updateTitle(newProgram: string, newDate: string, newTopics: string[]) {
    const t = rebuildTitle(newProgram, newDate, newTopics)
    setTitle(t)
  }

  function handleProgramChange(p: string) {
    setProgram(p)
    updateTitle(p, date, topics)
  }

  function toggleTopic(topic: string) {
    const exists = topics.includes(topic)
    const updated = exists ? topics.filter(t => t !== topic) : [...topics, topic]
    setTopics(updated)
    updateTitle(program, date, updated)
  }

  function addTopic() {
    if (!newTopic.trim() || topics.includes(newTopic.trim())) return
    const updated = [...topics, newTopic.trim()]
    setTopics(updated)
    setNewTopic('')
    updateTitle(program, date, updated)
  }

  function removeTopic(topic: string) {
    const updated = topics.filter(t => t !== topic)
    setTopics(updated)
    updateTitle(program, date, updated)
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
            title, folder,
            topics: topics.join(', '),
            transcript: transcript.slice(0, 3000),
            summary: zoomSummary,
            fathomTranscript: context?.fathomMeetings?.map((m: any) => m.transcriptExcerpt).filter(Boolean).join('\n') || '',
            folders: folders.join(', '),
            programs: PROGRAM_NAMES.join(', '),
            systemPrompt: context?.systemPrompt || '',
          },
        }),
      })
      const data = await res.json()
      setChatMessages([...newMessages, { role: 'assistant', content: data.reply }])
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally { setChatLoading(false) }
  }

  async function aiSuggestAll() {
    setAiSuggesting(true)
    try {
      const res = await fetch('/api/zoom/recording-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Based on the calendar and transcript data, suggest the correct program name, 3-4 topic tags, and the best SharePoint folder for this recording. Respond with only this JSON: {"program": "Program Name", "topics": ["Topic 1", "Topic 2", "Topic 3"], "folder": "Folder Name", "title": "Full title in correct format"}` }],
          context: {
            meetingTitle: job?.meeting_title || '',
            title, folder,
            topics: topics.join(', '),
            transcript: transcript.slice(0, 3000),
            summary: zoomSummary,
            fathomTranscript: context?.fathomMeetings?.map((m: any) => m.transcriptExcerpt).filter(Boolean).join('\n') || '',
            folders: folders.join(', '),
            programs: PROGRAM_NAMES.join(', '),
            systemPrompt: context?.systemPrompt || '',
          },
        }),
      })
      const data = await res.json()
      const parsed = JSON.parse((data.reply || '{}').replace(/```json|```/g, '').trim())
      if (parsed.program) { setProgram(parsed.program) }
      if (parsed.topics) setTopics(parsed.topics)
      if (parsed.title) setTitle(parsed.title)
      if (parsed.folder && folders.includes(parsed.folder)) setFolder(parsed.folder)
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Suggested:\n\nProgram: ${parsed.program}\nTitle: ${parsed.title}\nFolder: ${parsed.folder}\nTopics: ${parsed.topics?.join(', ')}` }])
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
        body: JSON.stringify({ jobId: id, finalTitle: title, folder, description, sendAgentEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setSharePointUrl(data.webUrl || '')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally { setUploading(false) }
  }

  if (unauthorized) return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <p className="text-luxury-gray-3 text-sm">You do not have permission to view this page.</p>
    </div>
  )
  if (loading) return <div className="p-4 sm:p-6 max-w-3xl mx-auto"><p className="text-luxury-gray-3">Loading...</p></div>
  if (!job) return <div className="p-4 sm:p-6 max-w-3xl mx-auto"><p className="text-luxury-gray-3">Recording not found.</p></div>

  if (success) return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="container-card p-6 text-center">
        <p className="text-luxury-black text-lg font-medium mb-2">Uploading to SharePoint</p>
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

  const statusLabel = job.status === 'uploaded' ? 'Uploaded' : job.status === 'error' ? 'Error' : job.status === 'processing' ? 'Processing' : 'Pending'
  const statusClass = job.status === 'uploaded' ? 'text-green-700' : job.status === 'error' ? 'text-red-700' : job.status === 'processing' ? 'text-blue-700' : 'text-amber-700'
  const displayTranscript = activeTab === 'chat' ? chatTranscript : transcript

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <button onClick={() => router.push('/admin/recordings')} className="flex items-center gap-1 text-luxury-gray-3 text-sm hover:text-luxury-black transition-colors">
        <ChevronLeft size={14} /> Recordings
      </button>

      {/* 1. Header */}
      <div className="container-card p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-luxury-black font-medium leading-snug">{title || job.meeting_title}</p>
          <span className={`text-xs font-semibold uppercase tracking-wide shrink-0 ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-luxury-gray-3 text-xs mb-3">
          {job.start_time && (
            <span>{new Date(job.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} CT</span>
          )}
          {job.duration && <span>{job.duration} min</span>}
          {job.mp4_file_size && <span>{(job.mp4_file_size / 1024 / 1024).toFixed(0)} MB</span>}
          {job.onedrive_url && <a href={job.onedrive_url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent">OneDrive ↗</a>}
          {job.zoom_share_url && <a href={job.zoom_share_url} target="_blank" rel="noopener noreferrer" className="text-luxury-gray-3 underline">Zoom ↗</a>}
        </div>
        {/* Source badges */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-3 border-t border-luxury-gray-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-luxury-gray-3 text-xs">Zoom:</span>
            {transcriptSource.includes('Transcript') && <span className="status-badge text-blue-600">Transcript</span>}
            {transcriptSource.includes('Chat') && <span className="status-badge text-green-700">Chat</span>}
            {(zoomSummary || job.zoom_summary) && <span className="status-badge text-purple-600">Smart Summary</span>}
            {!summaryFetched && <span className="status-badge text-luxury-gray-3">Fetching...</span>}
            {summaryFetched && !zoomSummary && transcriptSource.length === 0 && <span className="status-badge text-luxury-gray-3">Not available yet</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-luxury-gray-3 text-xs">Fathom:</span>
            {fathomAvailable ? <span className="status-badge text-amber-700">Transcript + Summary</span> : <span className="status-badge text-luxury-gray-3">None</span>}
          </div>
        </div>
      </div>

      {/* 2. Attendees */}
      {job.participants?.length > 0 && (
        <div className="container-card p-5">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-3">Attendees ({job.participants.length})</p>
          <div className="flex flex-wrap gap-2">
            {job.participants.map((p: any, i: number) => (
              <span key={i} className="text-luxury-black text-xs bg-luxury-gray-5 px-3 py-1 rounded-full">
                {p.participant_name || p.participant_email}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Transcript */}
      {(transcript || chatTranscript) && (
        <div className="container-card p-5">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-3">Transcript</p>
          {transcript && chatTranscript && (
            <div className="flex gap-1 mb-0">
              <button onClick={() => setActiveTab('transcript')} className={`text-xs px-3 py-1.5 rounded-t-md border-b-0 border transition-colors ${activeTab === 'transcript' ? 'bg-luxury-gray-5 text-luxury-black border-luxury-gray-5' : 'text-luxury-gray-3 border-transparent'}`}>Transcript</button>
              <button onClick={() => setActiveTab('chat')} className={`text-xs px-3 py-1.5 rounded-t-md border-b-0 border transition-colors ${activeTab === 'chat' ? 'bg-luxury-gray-5 text-luxury-black border-luxury-gray-5' : 'text-luxury-gray-3 border-transparent'}`}>Chat</button>
            </div>
          )}
          <div className="bg-luxury-gray-5 rounded-lg p-3 max-h-28 overflow-hidden relative">
            <p className="text-luxury-gray-2 text-xs leading-relaxed">{displayTranscript?.slice(0, 600)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-luxury-gray-5 to-transparent rounded-b-lg" />
          </div>
          <p className="text-luxury-gray-3 text-xs mt-2">{(transcript?.length || 0).toLocaleString()} characters</p>
        </div>
      )}

      {/* 4. Smart summary */}
      {(zoomSummary || (!summaryFetched)) && (
        <div className="container-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-luxury-gray-3 text-xs uppercase tracking-wide">Zoom Smart Summary</p>
            {!summaryFetched && <span className="text-luxury-gray-3 text-xs">Fetching...</span>}
          </div>
          {zoomSummary ? (
            <>
              <p className="text-luxury-black text-sm leading-relaxed">{zoomSummary}</p>
              <p className="text-luxury-gray-3 text-xs mt-2">Used as SharePoint description unless you override below.</p>
            </>
          ) : (
            <p className="text-luxury-gray-3 text-sm">Zoom is still generating the summary. Reload the page in a few minutes to check again.</p>
          )}
        </div>
      )}

      {/* 5. Title & folder */}
      <div className="container-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide">Title & Folder</p>
          <button onClick={aiSuggestAll} disabled={aiSuggesting} className="flex items-center gap-1.5 text-luxury-accent text-xs font-medium hover:opacity-80 disabled:opacity-50">
            <Sparkles size={12} />
            {aiSuggesting ? 'Suggesting...' : 'AI Suggest'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="field-label mb-1">Program</p>
            <select
              value={program}
              onChange={e => handleProgramChange(e.target.value)}
              className="select-luxury w-full"
            >
              <option value="">Select a program...</option>
              {PROGRAM_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <p className="text-luxury-gray-3 text-xs mt-1">Program list is separate from folder selection below.</p>
          </div>

          <div>
            <p className="field-label mb-2">Topics <span className="text-luxury-accent font-medium">- click to add to title</span></p>
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestedTopics.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTopic(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${topics.includes(t) ? 'bg-luxury-accent/10 border-luxury-accent text-luxury-accent font-medium' : 'border-luxury-gray-4 text-luxury-gray-2 hover:border-luxury-accent hover:text-luxury-accent'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {topics.filter(t => !suggestedTopics.includes(t)).map(t => (
                <span key={t} className="flex items-center gap-1.5 bg-luxury-accent/10 border border-luxury-accent text-luxury-accent text-xs px-3 py-1.5 rounded-full">
                  {t}
                  <button onClick={() => removeTopic(t)}><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic()} placeholder="Add a topic..." className="input-luxury flex-1 text-sm" />
              <button onClick={addTopic} className="btn-secondary px-3 py-2 text-xs">Add</button>
            </div>
          </div>

          <div>
            <p className="field-label mb-1">Full title</p>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input-luxury w-full"
            />
            <p className="text-luxury-gray-3 text-xs mt-1">Program - Date - Topic 1 - Topic 2 - Topic 3</p>
          </div>

          <div>
            <p className="field-label mb-1">SharePoint folder</p>
            <div className="relative">
              <input
                type="text"
                value={folderOpen ? folderSearch : folder}
                onChange={e => { setFolderSearch(e.target.value); setFolderOpen(true) }}
                onFocus={() => { setFolderSearch(''); setFolderOpen(true) }}
                onBlur={() => setTimeout(() => setFolderOpen(false), 150)}
                placeholder="Search folders..."
                className="input-luxury w-full"
              />
              {folderOpen && (
                <div className="absolute z-10 w-full mt-1 bg-luxury-white border border-luxury-gray-4 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {folders.filter(f => f.toLowerCase().includes(folderSearch.toLowerCase())).map(f => (
                    <button key={f} type="button" onMouseDown={() => { setFolder(f); setFolderOpen(false); setFolderSearch('') }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-luxury-gray-5 transition-colors ${folder === f ? 'text-luxury-accent font-medium' : 'text-luxury-black'}`}>
                      {f}
                    </button>
                  ))}
                  {folders.filter(f => f.toLowerCase().includes(folderSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-2 text-luxury-gray-3 text-sm">No folders match</p>
                  )}
                </div>
              )}
            </div>
            {folder && !folderOpen && <p className="text-luxury-accent text-xs mt-1">{folder}</p>}
          </div>
        </div>
      </div>

      {/* 6. Description */}
      <div className="container-card p-5">
        <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-3">Description <span className="normal-case font-normal text-luxury-gray-3">(optional override)</span></p>
        <textarea
          value={description}
          onChange={e => { setDescription(e.target.value); setDescriptionEdited(true) }}
          rows={5}
          className="input-luxury w-full resize-none text-sm leading-relaxed"
          placeholder="Pre-filled from title and Zoom smart summary. Edit freely or leave as-is."
        />
        <p className="text-luxury-gray-3 text-xs mt-2">Title is pre-filled and updates as you edit above. Clear and retype to fully override.</p>
      </div>

      {/* 7. AI chat */}
      <div className="container-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-luxury-accent" />
          <p className="text-luxury-gray-2 text-sm font-medium">AI Assistant</p>
        </div>
        <p className="text-luxury-gray-3 text-xs mb-4">Ask me to identify the program, suggest a title, or explain what was covered.</p>
        {chatMessages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${msg.role === 'user' ? 'bg-luxury-gray-5 text-luxury-black ml-4 sm:ml-8' : 'bg-luxury-accent/10 text-luxury-gray-2 mr-4 sm:mr-8'}`}>
                {msg.content}
              </div>
            ))}
            {chatLoading && <div className="bg-luxury-accent/10 text-luxury-gray-3 text-sm rounded-lg px-3 py-2 mr-4 sm:mr-8">Thinking...</div>}
            <div ref={chatEndRef} />
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !chatLoading && askAI(chatInput)}
            placeholder='e.g. "What program is this?" or "What was covered?"'
            className="input-luxury flex-1 text-sm" />
          <button onClick={() => askAI(chatInput)} disabled={chatLoading || !chatInput.trim()} className="bg-luxury-accent text-luxury-black p-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Status messages */}
      {job.status === 'uploaded' && (
        <div className="container-card p-4">
          <p className="status-badge text-green-700 mb-1">Already uploaded to SharePoint</p>
          {job.sharepoint_url && <a href={job.sharepoint_url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline text-sm">View in SharePoint</a>}
        </div>
      )}
      {job.status === 'error' && job.error_message && (
        <div className="container-card p-4">
          <p className="status-badge text-red-700 mb-1">Previous upload failed</p>
          <p className="text-luxury-gray-3 text-xs">{job.error_message}</p>
        </div>
      )}
      {error && <div className="container-card p-4"><p className="text-red-600 text-sm">{error}</p></div>}

      {/* 8. Confirm */}
      {job.status !== 'uploaded' && (
        <div className="container-card p-5">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-3">Confirm Upload</p>
          <p className="text-luxury-gray-3 text-xs mb-4">Uploads to SharePoint Videos library, sets description, then deletes from Zoom cloud. This cannot be undone.</p>
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input type="checkbox" checked={sendAgentEmail} onChange={e => setSendAgentEmail(e.target.checked)} className="w-4 h-4 accent-luxury-accent" />
            <span className="text-luxury-gray-2 text-sm">Send email notification to agents</span>
          </label>
          <button onClick={handleConfirm} disabled={uploading || !title.trim() || !folder}
            className="w-full bg-luxury-accent text-luxury-black font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
            {uploading ? 'Uploading to SharePoint...' : 'Confirm & Upload to SharePoint'}
          </button>
        </div>
      )}
    </div>
  )
}
