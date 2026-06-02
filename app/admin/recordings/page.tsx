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
      <h1 className="page-title mb-6">Zoom Recordings</h1>
      {loading && <p className="text-luxury-gray-3">Loading...</p>}
      {!loading && jobs.length === 0 && (
        <p className="text-luxury-gray-3">No recordings yet. They will appear here after a Zoom session ends.</p>
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
                  <p className="text-luxury-white font-medium">{job.meeting_title}</p>
                  <p className="text-luxury-gray-3 text-sm mt-1">{job.suggested_title}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
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
