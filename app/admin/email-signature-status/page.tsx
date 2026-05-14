'use client'

import { useEffect, useState, useMemo } from 'react'
import { Search, Download, CheckCircle2, Circle } from 'lucide-react'
import * as XLSX from 'xlsx'

interface AgentRow {
  id: string
  email: string
  preferred_first_name: string
  preferred_last_name: string
  first_name: string
  last_name: string
  office: string | null
  role: string | null
  is_licensed_agent: boolean | null
  new_signature_completed_at: string | null
  status: string
}

interface Stats {
  total: number
  completed: number
  not_yet: number
  percent_done: number
}

/**
 * Admin Email Signature Status Page
 *
 * Lists all active agents with their email signature completion status.
 * Shows who has saved a new-format signature in the in-app generator
 * (column: users.new_signature_completed_at) and who hasn't.
 *
 * Use this to track adoption ahead of the Firebase retirement deadline
 * (Friday, June 19, 2026). Export-to-CSV available for chasing the
 * stragglers.
 *
 * Permissioned via the layout's ROUTE_PERMISSIONS map and the API route's
 * requirePermission('can_view_all_agents').
 */
export default function EmailSignatureStatusPage() {
  const [users, setUsers] = useState<AgentRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'not_yet'>('all')
  const [officeFilter, setOfficeFilter] = useState<string>('all')

  useEffect(() => {
    fetchData()
  }, [statusFilter, officeFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        office: officeFilter,
      })
      const res = await fetch(`/api/admin/email-signature-status?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setUsers(data.users || [])
      setStats(data.stats || null)
    } catch (err) {
      console.error('Failed to load signature status:', err)
      setUsers([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  // Client-side filter for the search query (server already filtered status/office)
  const visibleUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(u => {
      const fullPref = `${u.preferred_first_name} ${u.preferred_last_name}`.toLowerCase()
      const fullLegal = `${u.first_name} ${u.last_name}`.toLowerCase()
      const email = (u.email || '').toLowerCase()
      return fullPref.includes(q) || fullLegal.includes(q) || email.includes(q)
    })
  }, [users, searchQuery])

  const formatCompletionDate = (raw: string | null): string => {
    if (!raw) return 'Not yet'
    try {
      const d = new Date(raw)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Not yet'
    }
  }

  const exportToExcel = () => {
    const rows = visibleUsers.map(u => ({
      Name: `${u.preferred_first_name} ${u.preferred_last_name}`,
      Email: u.email,
      Office: u.office || '',
      Role: u.role || '',
      Status: u.new_signature_completed_at ? 'Completed' : 'Not Yet',
      'Completion Date': u.new_signature_completed_at
        ? formatCompletionDate(u.new_signature_completed_at)
        : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Signature Status')
    XLSX.writeFile(
      wb,
      `email-signature-status-${new Date().toISOString().split('T')[0]}.xlsx`
    )
  }

  return (
    <div>
      <h1 className="page-title mb-2">Email Signature Adoption</h1>
      <p className="text-sm text-luxury-gray-2 mb-6">
        Track which agents have updated to the in-app email signature generator before
        the legacy generator is retired on Friday, June 19, 2026.
      </p>

      {/* Stats Banner */}
      {stats && (
        <div className="container-card mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Completed</p>
                <p className="text-2xl font-semibold text-luxury-gray-1">
                  {stats.completed}
                  <span className="text-base text-luxury-gray-3 font-normal"> / {stats.total}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Not Yet</p>
                <p className="text-2xl font-semibold text-luxury-gray-1">{stats.not_yet}</p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Progress</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.percent_done}%</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="h-2 bg-luxury-gray-5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-luxury-accent transition-all duration-300"
                  style={{ width: `${stats.percent_done}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="container-card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name or email..."
              className="input-luxury pl-9 w-full text-sm"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="input-luxury text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="not_yet">Not Yet</option>
          </select>

          {/* Office filter */}
          <select
            value={officeFilter}
            onChange={e => setOfficeFilter(e.target.value)}
            className="input-luxury text-sm"
          >
            <option value="all">All Offices</option>
            <option value="Houston">Houston</option>
            <option value="DFW">DFW</option>
          </select>

          {/* Export */}
          <button
            onClick={exportToExcel}
            disabled={visibleUsers.length === 0}
            className="btn btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="container-card overflow-hidden">
        {loading ? (
          <p className="text-center py-12 text-sm text-luxury-gray-3">Loading...</p>
        ) : visibleUsers.length === 0 ? (
          <p className="text-center py-12 text-sm text-luxury-gray-3">No agents match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-luxury-gray-5 text-left text-xs text-luxury-gray-3 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Office</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Completion Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(u => {
                  const isDone = !!u.new_signature_completed_at
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-luxury-gray-5 hover:bg-luxury-light transition-colors ${
                        isDone ? '' : 'bg-luxury-light/40'
                      }`}
                    >
                      <td className="px-4 py-3">
                        {isDone ? (
                          <div className="flex items-center gap-1.5 text-luxury-accent">
                            <CheckCircle2 size={16} />
                            <span className="text-xs font-medium">Done</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-luxury-gray-3">
                            <Circle size={16} />
                            <span className="text-xs">Not Yet</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-luxury-gray-1">
                        {u.preferred_first_name} {u.preferred_last_name}
                      </td>
                      <td className="px-4 py-3 text-luxury-gray-2">{u.email}</td>
                      <td className="px-4 py-3 text-luxury-gray-2">{u.office || '-'}</td>
                      <td className="px-4 py-3 text-luxury-gray-2 capitalize">{u.role || '-'}</td>
                      <td className="px-4 py-3 text-luxury-gray-2">
                        {formatCompletionDate(u.new_signature_completed_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
