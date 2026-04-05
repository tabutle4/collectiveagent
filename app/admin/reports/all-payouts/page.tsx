'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayoutRow {
  id: string
  type: 'agent' | 'external'
  payee: string
  payee_type: string
  address: string
  transaction_type: string
  amount: number
  payment_status: string
  payment_date: string | null
  payment_method: string | null
  transaction_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'

function statusCls(status: string) {
  const map: Record<string, string> = {
    paid: 'text-green-700', pending: 'text-yellow-600', processed: 'text-blue-600',
  }
  return map[status] || 'text-luxury-gray-3'
}

function fmtRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AllPayoutsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [sortKey, setSortKey] = useState('payment_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const res = await fetch(`/api/admin/all-payouts?${params}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Error ${res.status}`)
      }
      const json = await res.json()
      setRows(json.rows || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, fromDate, toDate])

  useEffect(() => { if (user) load() }, [user, load])

  const handleSearch = () => setSearch(searchInput)

  const clearFilters = () => {
    setSearch(''); setSearchInput(''); setStatusFilter(''); setFromDate(''); setToDate('')
  }

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedRows = [...rows].sort((a, b) => {
    let av: string | number = ''
    let bv: string | number = ''
    if (sortKey === 'payment_date') { av = a.payment_date || ''; bv = b.payment_date || '' }
    else if (sortKey === 'amount') { av = a.amount; bv = b.amount }
    else if (sortKey === 'payee') { av = a.payee.toLowerCase(); bv = b.payee.toLowerCase() }
    else if (sortKey === 'payment_status') { av = a.payment_status; bv = b.payment_status }
    const cmp = av > bv ? 1 : av < bv ? -1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const paidAmount = rows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + r.amount, 0)
  const pendingAmount = rows.filter(r => r.payment_status === 'pending').reduce((s, r) => s + r.amount, 0)

  const SortTh = ({ label, col, right }: { label: string; col: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest cursor-pointer select-none hover:text-luxury-gray-1 ${right ? 'text-right' : 'text-left'}`}
    >
      {label} {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </th>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">ALL PAYOUTS</h1>
        <button onClick={load} className="btn btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total', value: totalAmount, cls: 'text-luxury-gray-1' },
          { label: 'Paid', value: paidAmount, cls: 'text-green-700' },
          { label: 'Pending', value: pendingAmount, cls: 'text-yellow-600' },
        ].map(c => (
          <div key={c.label} className="container-card text-center py-3">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-widest mb-1">{c.label}</p>
            <p className={`text-sm font-semibold ${c.cls}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="container-card mb-5">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="field-label">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Address, agent name, brokerage..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="input-luxury text-xs flex-1"
              />
              <button onClick={handleSearch} className="btn btn-primary text-xs px-3">
                <Search size={12} />
              </button>
            </div>
          </div>
          <div>
            <label className="field-label">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-luxury text-xs">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="processed">Processed</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <label className="field-label">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-luxury text-xs" />
          </div>
          <div>
            <label className="field-label">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-luxury text-xs" />
          </div>
          {(search || statusFilter || fromDate || toDate) && (
            <button onClick={clearFilters} className="btn btn-secondary text-xs flex items-center gap-1 self-end">
              <X size={12} /> Clear
            </button>
          )}
        </div>
        <p className="text-xs text-luxury-gray-3 mt-3">{rows.length} record{rows.length !== 1 ? 's' : ''} — {fmt(totalAmount)}</p>
      </div>

      {/* Table */}
      <div className="container-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={16} className="animate-spin text-luxury-gray-3" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <button onClick={load} className="btn btn-secondary text-xs">Try Again</button>
          </div>
        ) : (
          <table className="w-full mt-1">
            <thead>
              <tr className="border-b border-luxury-gray-5/50">
                <SortTh label="Payee" col="payee" />
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden sm:table-cell">Payee Type</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Address</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden md:table-cell">Type</th>
                <SortTh label="Amount" col="amount" right />
                <SortTh label="Status" col="payment_status" />
                <SortTh label="Date Paid" col="payment_date" />
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden lg:table-cell">Method</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-xs text-luxury-gray-3">No records found</td></tr>
              ) : sortedRows.map(row => (
                <tr key={`${row.type}-${row.id}`} className="border-b border-luxury-gray-5/30 hover:bg-luxury-gray-6/30">
                  <td className="py-2 px-3 text-xs text-luxury-gray-1 font-medium">
                    <span className="truncate max-w-[140px] block">{row.payee}</span>
                  </td>
                  <td className="py-2 px-3 text-xs text-luxury-gray-2 hidden sm:table-cell">
                    <span className="truncate max-w-[120px] block">{fmtRole(row.payee_type)}</span>
                  </td>
                  <td className="py-2 px-3 text-xs text-luxury-gray-2">
                    {row.transaction_id ? (
                      <Link href={`/admin/transactions/${row.transaction_id}`} className="hover:text-luxury-accent truncate max-w-[160px] block">
                        {row.address}
                      </Link>
                    ) : (
                      <span className="truncate max-w-[160px] block">{row.address}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-luxury-gray-2 hidden md:table-cell">{row.transaction_type || ''}</td>
                  <td className="py-2 px-3 text-xs text-right font-medium text-luxury-gray-1">{fmt(row.amount)}</td>
                  <td className={`py-2 px-3 text-xs font-medium ${statusCls(row.payment_status)}`}>{row.payment_status}</td>
                  <td className="py-2 px-3 text-xs text-luxury-gray-3">{fmtDate(row.payment_date)}</td>
                  <td className="py-2 px-3 text-xs text-luxury-gray-3 hidden lg:table-cell capitalize">{row.payment_method?.replace(/_/g, ' ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}