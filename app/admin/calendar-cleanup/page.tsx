'use client'
import { useEffect, useState } from 'react'

interface Event { id: string; subject: string; start: string; created: string }

export default function CalendarCleanupPage() {
  const [guest, setGuest]     = useState<Event[]>([])
  const [regular, setRegular] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleted, setDeleted]   = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/coaching-guests/calendar-cleanup')
      const d = await res.json()
      if (!res.ok) { setError(JSON.stringify(d.error)); return }
      setGuest(d.guest)
      setRegular(d.regular)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function del(id: string) {
    if (!confirm('Send cancellation and delete this event?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/coaching-guests/calendar-cleanup?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) { alert('Error: ' + JSON.stringify(d.error)); return }
      setDeleted(prev => new Set([...prev, id]))
    } finally {
      setDeleting(null)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-8 text-luxury-gray-3">Loading calendar...</div>
  if (error)   return <div className="p-8 text-red-600">Error: {error}</div>

  const visible = guest.filter(e => !deleted.has(e.id))

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-1">Calendar Cleanup</h1>
        <p className="text-sm text-luxury-gray-3">
          {visible.length} Guest Presenter event{visible.length !== 1 ? 's' : ''} found.
          Deleting removes attendees first so no cancellation emails go out.
        </p>
      </div>

      {visible.length === 0 && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded px-4 py-3 text-sm">
          No Guest Presenter events remaining.
        </div>
      )}

      {visible.map(e => (
        <div key={e.id} className="border border-luxury-gray-5 rounded-lg p-4 space-y-1">
          <div className="font-semibold text-luxury-gray-1 text-sm">{e.subject}</div>
          <div className="text-xs text-luxury-gray-3">Start: {e.start}</div>
          <div className="text-xs text-luxury-gray-3">Created: {e.created}</div>
          <div className="text-xs font-mono text-luxury-gray-4 break-all">{e.id}</div>
          <button
            onClick={() => del(e.id)}
            disabled={deleting === e.id}
            className="mt-2 px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting === e.id ? 'Deleting...' : 'Delete Quietly'}
          </button>
        </div>
      ))}

      {visible.length > 1 && (
        <button
          onClick={async () => {
            if (!confirm(`Quietly delete ALL ${visible.length} Guest Presenter events? No cancellation emails will go out.`)) return
            for (const e of visible) await del(e.id)
          }}
          className="px-4 py-2 text-sm rounded bg-red-700 text-white hover:bg-red-800"
        >
          Delete All {visible.length} Quietly
        </button>
      )}

      <details className="text-xs text-luxury-gray-4">
        <summary className="cursor-pointer">Regular coaching sessions ({regular.length})</summary>
        <div className="mt-2 space-y-1">
          {regular.map(e => (
            <div key={e.id}>{e.start?.slice(0,10)} — {e.subject}</div>
          ))}
        </div>
      </details>
    </div>
  )
}
