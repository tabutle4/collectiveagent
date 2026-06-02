'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function RecordingsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/zoom/recording-jobs')
      .then(r => r.json())
      .then(d => { setJobs(d.jobs || []); setLoading(false) })
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="page-title mb-2">Zoom Recordings</h1>
      <p className="text-luxury-gray-3 text-sm mb-6">Training session recordings captured automatically from Zoom.</p>

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
              <span>Tara receives an email with a suggested title and SharePoint folder based on the meeting content.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">3.</span>
              <span>Tara clicks the link in the email or finds the recording here, reviews the suggested title, and confirms.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-luxury-accent font-semibold shrink-0">4.</span>
              <span>The recording uploads automatically to the correct SharePoint folder. No manual downloading or renaming needed.</span>
            </li>
          </ol>
          <div className="inner-card p-4 mt-2">
            <p className="text-luxury-gray-3 text-xs">
              <span className="text-luxury-gray-2 font-medium">For interns:</span> You do not need to do anything on this page unless Tara asks you to confirm a recording. If a recording shows a status of <span className="text-red-400">error</span>, let Tara know.
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