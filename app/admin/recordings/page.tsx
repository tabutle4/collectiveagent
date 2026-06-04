'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'

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

  useEffect(() => {
    loadJobs()
    fetch('/api/zoom/recording-settings')
      .then(r => r.json())
      .then(d => { if (d.notifyEmail) setNotifyEmail(d.notifyEmail) })
  }, [])

  function loadJobs() {
    setLoading(true)
    fetch('/api/zoom/recording-jobs')
      .then(r => r.json())
      .then(d => { setJobs(d.jobs || []); setLoading(false) })
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

  async function deleteJob(e: React.MouseEvent, jobId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this recording job? This cannot be undone.')) return
    setDeleting(jobId)
    try {
      await fetch(`/api/zoom/recording-jobs?id=${jobId}`, { method: 'DELETE' })
      setJobs(prev => prev.filter(j => j.id !== jobId))
    } catch { }
    finally { setDeleting(null) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-2">Zoom Recordings</h1>
        <p className="text-luxury-gray-3 text-sm">Training session recordings captured automatically from Zoom.</p>
      </div>

      <div className="container-card p-5">
        <p className="text-luxury-gray-2 font-medium mb-1">Notification Email</p>
        <p className="text-luxury-gray-3 text-sm mb-4">
          When a Zoom recording is ready, a notification email is sent to this address with a link to review and upload.
        </p>
        <div className="flex gap-3 items-start">
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="email@collectiverealtyco.com"
            className="flex-1 bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-2 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          />
          <button
            onClick={saveEmail}
            disabled={emailSaving || !notifyEmail.trim()}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {emailSaving ? 'Saving...' : emailSaved ? 'Saved' : 'Save'}
          </button>
        </div>
        {emailError && <p className="text-red-400 text-xs mt-2">{emailError}</p>}
      </div>

      {loading && <p className="text-luxury-gray-3">Loading...</p>}

      {!loading && jobs.length === 0 && (
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

      {!loading && jobs.length > 0 && (
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
                      <p className="text-luxury-gray-3 text-xs">{formatCT(job.start_time)}</p>
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
    </div>
  )
}
