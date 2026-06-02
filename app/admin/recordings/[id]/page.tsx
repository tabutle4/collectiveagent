'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const SHAREPOINT_FOLDERS = [
  'Announcement Recordings',
  'Collective Access Division Coaching - Dallas',
  'Collective Access Division Coaching - Houston',
  'Convert & Close Coaching',
  'Daily Prospecting',
  'Lender Market Updates',
  'Lending',
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

export default function RecordingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sharePointUrl, setSharePointUrl] = useState('')

  useEffect(() => {
    fetch(`/api/zoom/recording-jobs?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.job) {
          setJob(d.job)
          setTitle(d.job.final_title || d.job.suggested_title || '')
          setFolder(d.job.final_folder || d.job.suggested_folder || SHAREPOINT_FOLDERS[0])
          if (d.job.sharepoint_url) setSharePointUrl(d.job.sharepoint_url)
        }
        setLoading(false)
      })
  }, [id])

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

  if (loading) return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="text-luxury-gray-3">Loading...</p>
    </div>
  )

  if (!job) return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="text-luxury-gray-3">Recording not found.</p>
    </div>
  )

  if (success) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-green-900/30 border border-green-700 rounded-lg p-6 text-center">
        <p className="text-green-300 text-lg font-medium mb-2">Uploading to SharePoint</p>
        <p className="text-luxury-gray-3 text-sm mb-4">
          The recording is being uploaded. This may take a few minutes depending on file size.
        </p>
        {sharePointUrl && (
          <a href={sharePointUrl} target="_blank" rel="noopener noreferrer"
            className="text-luxury-accent underline text-sm block mb-4">
            View in SharePoint
          </a>
        )}
        <button onClick={() => router.push('/admin/recordings')}
          className="text-luxury-gray-3 text-sm underline">
          Back to Recordings
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => router.push('/admin/recordings')}
        className="text-luxury-gray-3 text-sm mb-6 hover:text-luxury-white transition-colors">
        Back to Recordings
      </button>

      <h1 className="text-2xl font-semibold text-luxury-white mb-2">Review Recording</h1>
      <p className="text-luxury-gray-3 text-sm mb-8">
        Confirm the title and destination folder before uploading to SharePoint.
      </p>

      <div className="space-y-6">
        <div className="bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg p-4">
          <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-1">Original Zoom Title</p>
          <p className="text-luxury-white">{job.meeting_title}</p>
        </div>

        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">
            Recording Title
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          />
          <p className="text-luxury-gray-3 text-xs mt-1">
            Format: Program Name - M-D-YY - Topic 1 - Topic 2 - Topic 3
          </p>
        </div>

        <div>
          <label className="block text-luxury-gray-2 text-sm font-medium mb-2">
            SharePoint Folder
          </label>
          <select
            value={folder}
            onChange={e => setFolder(e.target.value)}
            className="w-full bg-luxury-dark-1 border border-luxury-dark-3 rounded-lg px-4 py-3 text-luxury-white text-sm focus:outline-none focus:border-luxury-accent"
          >
            {SHAREPOINT_FOLDERS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {job.status === 'uploaded' && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
            <p className="text-green-300 text-sm font-medium mb-1">Already uploaded to SharePoint</p>
            {job.sharepoint_url && (
              <a href={job.sharepoint_url} target="_blank" rel="noopener noreferrer"
                className="text-luxury-accent underline text-sm">
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
