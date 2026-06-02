'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function RecordingsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    fetch('/api/zoom/recording-jobs')
      .then(r => r.json())
      .then(d => { setJobs(d.jobs || []); setLoading(false) })

    fetch('/api/zoom/recording-settings')
      .then(r => r.json())
      .then(d => { if (d.notifyEmail) setNotifyEmail(d.notifyEmail) })
  }, [])

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-2">Zoom Recordings</h1>
        <p className="text-luxury-gray-3 text-sm">Training session recordings captured automatically from Zoom.</p>
      </div>

      {/* Notification email setting */}
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
            className="flex-1 bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-2 text-luxury-black text-sm focus:outline-none focus:border-luxury-accent"
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
          <div className="inner-card p-4 mt-2">
            <p className="text-luxury-gray-3 text-xs">
              <span className="text-luxury-gray-2 font-medium">Note:</span> If a recording shows a status of <span className="text-red-400">error</span>, contact your administrator.
            </p>
          </div>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-luxury-black font-medium">{job.meeting_title}</p>
                  <p className="text-luxury-gray-3 text-sm mt-1">{job.suggested_title}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-4 ${
                  job.status === 'uploaded' ? 'bg-green-900 text-green-300' :
                  job.status === 'processing' ? 'bg-blue-900 text-blue-300' :
                  job.status === 'error' ? 'bg-red-900 text-red-300' :
                  'bg-luxury-dark-3 text-luxury-gray-2'
                }`}>
                  {job.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
