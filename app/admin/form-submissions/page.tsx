'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink } from 'lucide-react'

interface SubmissionRow {
  id: string
  submitted_at: string
  status: string
  submission_mode: string
  mode_label: string
  agent_id: string
  agent_name: string
  property_address: string | null
  client_name: string | null
  transaction_id: string | null
  listing_id: string | null
  linked_status: string | null
}

const MODE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pre-listing', label: 'Pre-Listing' },
  { value: 'just-listed', label: 'Just Listed' },
  { value: 'under_contract', label: 'New Contract' },
  { value: 'compliance', label: 'Compliance & CDA' },
  { value: 'prospective-agent', label: 'Prospective Agent' },
]

const MODE_BADGE: Record<string, string> = {
  'pre-listing': 'text-indigo-700 bg-indigo-50',
  'just-listed': 'text-blue-700 bg-blue-50',
  under_contract: 'text-teal-700 bg-teal-50',
  compliance: 'text-green-700 bg-green-50',
  subsequent: 'text-amber-700 bg-amber-50',
  retainer: 'text-purple-700 bg-purple-50',
  'prospective-agent': 'text-rose-700 bg-rose-50',
}

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '-'

export default function AllSubmissionsPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modeFilter, setModeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (modeFilter !== 'all') params.set('mode', modeFilter)
      const res = await fetch(`/api/admin/form-submissions?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.submissions || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [modeFilter])

  useEffect(() => {
    load()
  }, [load])

  const filtered = search
    ? rows.filter(r => {
        const q = search.toLowerCase()
        return (
          (r.agent_name || '').toLowerCase().includes(q) ||
          (r.property_address || '').toLowerCase().includes(q) ||
          (r.client_name || '').toLowerCase().includes(q)
        )
      })
    : rows

  const linkFor = (r: SubmissionRow) => {
    if (r.transaction_id) return `/admin/transactions/${r.transaction_id}`
    return null
  }

  return (
    <div>
      <h1 className="page-title mb-2">FORM SUBMISSIONS</h1>
      <p className="text-xs text-luxury-gray-3 mb-6">
        Every form submitted across the brokerage, in one place.
      </p>

      <div className="container-card">
        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="flex flex-wrap gap-1">
            {MODE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setModeFilter(f.value)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  modeFilter === f.value
                    ? 'bg-luxury-accent text-white'
                    : 'text-luxury-gray-3 hover:text-luxury-gray-1 hover:bg-luxury-light'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="md:ml-auto">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agent, property, client..."
              className="input-luxury text-sm w-full md:w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-luxury-gray-3">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-luxury-gray-3">No submissions found.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Form</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Agent</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Property</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Client</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b border-luxury-gray-5/30 hover:bg-luxury-light">
                      <td className="py-3 px-4 text-xs text-luxury-gray-2 whitespace-nowrap">{fmtDate(r.submitted_at)}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2.5 py-1 rounded font-medium ${MODE_BADGE[r.submission_mode] || 'text-luxury-gray-3 bg-luxury-gray-5/40'}`}>
                          {r.mode_label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-1">{r.agent_name}</td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{r.property_address || '-'}</td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{r.client_name || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        {linkFor(r) && (
                          <Link href={linkFor(r)!} className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline">
                            View <ExternalLink size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(r => (
                <div key={r.id} className="inner-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2.5 py-1 rounded font-medium ${MODE_BADGE[r.submission_mode] || 'text-luxury-gray-3 bg-luxury-gray-5/40'}`}>
                      {r.mode_label}
                    </span>
                    <span className="text-xs text-luxury-gray-3">{fmtDate(r.submitted_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-luxury-gray-1">{r.agent_name}</p>
                  {r.property_address && <p className="text-xs text-luxury-gray-2">{r.property_address}</p>}
                  {r.client_name && <p className="text-xs text-luxury-gray-3">{r.client_name}</p>}
                  {linkFor(r) && (
                    <Link href={linkFor(r)!} className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline mt-2">
                      View <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
