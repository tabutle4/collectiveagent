'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2, X } from 'lucide-react'

function formatCT(isoString: string) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' CT'
}

export default function RecordingsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [allowedRooms, setAllowedRooms] = useState<string[]>([])
  const [knownRooms, setKnownRooms] = useState<string[]>([])
  const [newRoom, setNewRoom] = useState('')
  const [roomsSaving, setRoomsSaving] = useState(false)
  const [roomsSaved, setRoomsSaved] = useState(false)
  const [roomsError, setRoomsError] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [processing, setProcessing] = useState<string | null>(null)
  const [processError, setProcessError] = useState('')

  useEffect(() => {
    loadJobs(false)
    loadSettings()
  }, [])

  function loadSettings() {
    fetch('/api/zoom/recording-settings')
      .then(r => r.json())
      .then(d => {
        if (d.notifyEmail) setNotifyEmail(d.notifyEmail)
        setAllowedRooms(d.allowedRooms || [])
        setKnownRooms(d.knownRooms || [])
      })
  }

  function loadJobs(hidden: boolean) {
    setLoading(true)
    fetch(`/api/zoom/recording-jobs${hidden ? '?ignored=1' : ''}`)
      .then(r => r.json())
      .then(d => {
        setJobs(d.jobs || [])
        setHiddenCount(d.ignoredCount || 0)
        setLoading(false)
      })
  }

  function toggleHidden() {
    const next = !showHidden
    setShowHidden(next)
    loadJobs(next)
  }

  async function saveEmail() {
    setEmailSaving(true)
    setEmailError('')
    setEmailSaved(false)
    try {
      const res = await fetch('/api/zoom/recording-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 3000)
    } catch (err: any) {
      setEmailError(err.message)
    } finally {
      setEmailSaving(false)
    }
  }

  async function saveRooms(rooms: string[]) {
    setRoomsSaving(true)
    setRoomsError('')
    setRoomsSaved(false)
    try {
      const res = await fetch('/api/zoom/recording-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedRooms: rooms }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setAllowedRooms(rooms)
      setRoomsSaved(true)
      setTimeout(() => setRoomsSaved(false), 3000)
      loadSettings()
    } catch (err: any) {
      setRoomsError(err.message)
    } finally {
      setRoomsSaving(false)
    }
  }

  function addRoom(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (allowedRooms.some(r => r.trim().toLowerCase() === trimmed.toLowerCase())) return
    const updated = [...allowedRooms, trimmed]
    setNewRoom('')
    saveRooms(updated)
  }

  function removeRoom(name: string) {
    saveRooms(allowedRooms.filter(r => r !== name))
  }

  // Pulls a hidden recording back into the normal pipeline: the server fetches it
  // from Zoom again, stages it to OneDrive and marks it pending, so it is named and
  // emailed like any other recording.
  async function processJob(jobId: string) {
    setProcessing(jobId)
    setProcessError('')
    try {
      const res = await fetch('/api/zoom/recording-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not process this recording')
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setHiddenCount(prev => (prev > 0 ? prev - 1 : 0))
    } catch (err: any) {
      setProcessError(err.message)
    } finally {
      setProcessing(null)
    }
  }

  async function deleteJob(e: React.MouseEvent, jobId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this recording job? This cannot be undone.')) return
    setDeleting(jobId)
    try {
      await fetch(`/api/zoom/recording-jobs?id=${jobId}`, { method: 'DELETE' })
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setHiddenCount(prev => (showHidden && prev > 0 ? prev - 1 : prev))
    } catch { }
    finally { setDeleting(null) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-2">Zoom Recordings</h1>
        <p className="text-luxury-gray-3 text-sm">Training session recordings captured automatically from Zoom.</p>
      </div>

      <div className="container-card p-5">
        <p className="text-luxury-gray-2 font-medium mb-1">Notification Email</p>
        <p className="text-luxury-gray-3 text-sm mb-4">
          When a Zoom recording is ready, a notification email is sent to this address with a link to review and upload.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="email@collectiverealtyco.com"
            className="input-luxury flex-1 text-sm"
          />
          <button
            onClick={saveEmail}
            disabled={emailSaving || !notifyEmail.trim()}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed sm:shrink-0 w-full sm:w-auto"
          >
            {emailSaving ? 'Saving...' : emailSaved ? 'Saved' : 'Save'}
          </button>
        </div>
        {emailError && <p className="text-red-400 text-xs mt-2">{emailError}</p>}
      </div>

      <div className="container-card p-5">
        <p className="text-luxury-gray-2 font-medium mb-1">Allowed Zoom Rooms</p>
        <p className="text-luxury-gray-3 text-sm mb-4">
          Only recordings made in these Zoom rooms appear here. Anything recorded in another room, such as a
          personal meeting room, is hidden instead of uploaded. Leave this empty to accept every recording on the
          Zoom account.
        </p>

        {allowedRooms.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {allowedRooms.map(room => (
              <span key={room} className="flex items-center gap-1.5 bg-luxury-accent/10 border border-luxury-accent text-luxury-accent text-xs px-3 py-1.5 rounded-full">
                {room}
                <button onClick={() => removeRoom(room)} disabled={roomsSaving} title="Remove room"><X size={10} /></button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-amber-700 text-xs mb-3">
            No rooms listed, so every Zoom recording on the account will appear here.
          </p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newRoom}
            onChange={e => setNewRoom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRoom(newRoom)}
            placeholder="Add a room name..."
            className="input-luxury flex-1 text-sm"
          />
          <button onClick={() => addRoom(newRoom)} disabled={roomsSaving || !newRoom.trim()} className="btn-secondary px-3 py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed">
            {roomsSaving ? 'Saving...' : roomsSaved ? 'Saved' : 'Add'}
          </button>
        </div>

        {knownRooms.length > 0 && (
          <div className="mt-3">
            <p className="text-luxury-gray-3 text-xs mb-2">Rooms Zoom has sent recently. Click one to allow it.</p>
            <div className="flex flex-wrap gap-2">
              {knownRooms.map(room => (
                <button
                  key={room}
                  onClick={() => addRoom(room)}
                  disabled={roomsSaving}
                  className="bg-luxury-gray-5 border border-luxury-gray-4 text-luxury-gray-2 text-xs px-3 py-1.5 rounded-full hover:border-luxury-accent transition-colors disabled:opacity-50"
                >
                  {room}
                </button>
              ))}
            </div>
          </div>
        )}

        {roomsError && <p className="text-red-400 text-xs mt-2">{roomsError}</p>}
      </div>

      {loading && <p className="text-luxury-gray-3">Loading...</p>}

      {!loading && !showHidden && jobs.length === 0 && (
        <div className="container-card p-6 space-y-4">
          <p className="text-luxury-gray-2 font-medium">No recordings yet</p>
          <p className="text-luxury-gray-3 text-sm">
            Recordings will appear here automatically after a Zoom training session ends. Here is how the process works:
          </p>
          <ol className="text-luxury-gray-3 text-sm space-y-2 list-none">
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">1.</span>
              <span>A Zoom session ends and cloud recording is available. This usually takes 5 to 15 minutes after the call.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">2.</span>
              <span>A notification email is sent to the address above with a suggested title and SharePoint folder based on the meeting content.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">3.</span>
              <span>The recipient clicks the link in the email or finds the recording here, reviews the suggested title, and confirms.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">4.</span>
              <span>The recording uploads automatically to the correct SharePoint folder. No manual downloading or renaming needed.</span>
            </li>
          </ol>
        </div>
      )}

      {!loading && showHidden && jobs.length === 0 && (
        <div className="container-card p-6">
          <p className="text-luxury-gray-2 font-medium mb-1">No hidden recordings</p>
          <p className="text-luxury-gray-3 text-sm">Nothing has been turned away by the allowed rooms list.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && showHidden && (
        <div className="space-y-3">
          {jobs.map(job => (
            <div
              key={job.id}
              className="block bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-luxury-white font-medium truncate">{job.meeting_title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {job.start_time && (
                      <p className="text-luxury-gray-2 text-xs">{formatCT(job.start_time)}</p>
                    )}
                    <p className="text-luxury-gray-3 text-xs">Not uploaded. The Zoom recording was left alone. Use Process this recording to bring it in.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => processJob(job.id)}
                    disabled={processing === job.id}
                    className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing === job.id ? 'Processing...' : 'Process this recording'}
                  </button>
                  <button
                    onClick={() => addRoom(job.meeting_title)}
                    disabled={roomsSaving}
                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Allow this room
                  </button>
                  <button
                    onClick={e => deleteJob(e, job.id)}
                    disabled={deleting === job.id}
                    className="text-luxury-gray-3 hover:text-red-400 transition-colors p-1 disabled:opacity-50"
                    title="Delete recording"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && jobs.length > 0 && !showHidden && (
        <div className="space-y-3">
          {jobs.map(job => (
            <Link
              key={job.id}
              href={`/admin/recordings/${job.id}`}
              className="block bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg p-4 hover:border-luxury-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-luxury-white font-medium truncate">
                    {job.final_title || job.suggested_title || job.meeting_title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {job.start_time && (
                      <p className="text-luxury-gray-2 text-xs">{formatCT(job.start_time)}</p>
                    )}
                    {job.duration && (
                      <p className="text-luxury-gray-3 text-xs">{job.duration} min</p>
                    )}
                    {job.final_folder && (
                      <p className="text-luxury-gray-3 text-xs">{job.final_folder}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ 
                    job.status === 'uploaded' ? 'bg-green-900 text-green-300' :
                    job.status === 'processing' ? 'bg-blue-900 text-blue-300' :
                    job.status === 'error' ? 'bg-red-900 text-red-300' :
                    'bg-luxury-dark-3 text-luxury-gray-2'
                  }`}>
                    {job.status}
                  </span>
                  <button
                    onClick={e => deleteJob(e, job.id)}
                    disabled={deleting === job.id}
                    className="text-luxury-gray-3 hover:text-red-400 transition-colors p-1 disabled:opacity-50"
                    title="Delete recording"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {processError && <p className="text-red-400 text-xs">{processError}</p>}

      {(hiddenCount > 0 || showHidden) && (
        <button onClick={toggleHidden} className="text-luxury-gray-3 text-sm underline">
          {showHidden ? 'Back to recordings' : `Show hidden recordings (${hiddenCount})`}
        </button>
      )}
    </div>
  )
}
