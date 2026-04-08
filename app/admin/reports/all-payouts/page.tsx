'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, X, ExternalLink, CheckCircle, Loader2 } from 'lucide-react'

interface PayoutRow {
  id: string
  type: 'agent' | 'external' | 'pm_fee' | 'landlord'
  payee: string
  payee_type: string
  address: string
  transaction_type: string
  amount: number
  payment_status: string
  payment_date: string | null
  payment_method: string
  transaction_id: string | null
}

interface PendingByType {
  agent: number
  external: number
  pm_fee: number
  landlord: number
}

interface CountByType {
  agent: number
  external: number
  pm_fee: number
  landlord: number
}

export default function AllPayoutsPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [pendingByType, setPendingByType] = useState<PendingByType>({ agent: 0, external: 0, pm_fee: 0, landlord: 0 })
  const [countByType, setCountByType] = useState<CountByType>({ agent: 0, external: 0, pm_fee: 0, landlord: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(currentYear.toString())
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Mark paid modal
  const [markPaidModal, setMarkPaidModal] = useState<{ row: PayoutRow } | null>(null)
  const [markPaidDate, setMarkPaidDate] = useState('')
  const [markPaidMethod, setMarkPaidMethod] = useState('ach')
  const [markPaidSaving, setMarkPaidSaving] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (!loading) loadData()
  }, [search, statusFilter, typeFilter, yearFilter, fromDate, toDate])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadData()
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (yearFilter) params.set('year', yearFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await fetch(`/api/admin/all-payouts?${params}`)
      const data = await res.json()
      setRows(data.rows || [])
      setPendingByType(data.pendingByType || { agent: 0, external: 0, pm_fee: 0, landlord: 0 })
      setCountByType(data.countByType || { agent: 0, external: 0, pm_fee: 0, landlord: 0 })
    } catch (err) {
      console.error('Error loading payouts:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string, row: PayoutRow) => {
    const canMarkPaid = status === 'pending' && (row.type === 'pm_fee' || row.type === 'landlord')
    
    if (status === 'paid') {
      return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded"><CheckCircle size={12} /> Paid</span>
    }
    if (status === 'pending') {
      if (canMarkPaid) {
        return (
          <button
            onClick={() => {
              setMarkPaidModal({ row })
              setMarkPaidDate(new Date().toISOString().split('T')[0])
              setMarkPaidMethod(row.payment_method || 'ach')
            }}
            className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded hover:bg-amber-100 cursor-pointer"
          >
            Pending
          </button>
        )
      }
      return <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Pending</span>
    }
    if (status === 'hold') {
      return <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">On Hold</span>
    }
    return <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{status}</span>
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'agent': return <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Agent</span>
      case 'external': return <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">External</span>
      case 'pm_fee': return <span className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded">PM Fee</span>
      case 'landlord': return <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded">Landlord</span>
      default: return <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{type}</span>
    }
  }

  const handleMarkPaid = async () => {
    if (!markPaidModal || !markPaidDate) return
    setMarkPaidSaving(true)
    try {
      const { row } = markPaidModal
      let endpoint = ''
      if (row.type === 'pm_fee') {
        endpoint = `/api/pm/fee-payouts/${row.id}`
      } else if (row.type === 'landlord') {
        endpoint = `/api/pm/disbursements/${row.id}`
      }
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'paid',
          payment_date: markPaidDate,
          payment_method: markPaidMethod,
        }),
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }
      
      setMarkPaidModal(null)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to mark as paid')
    } finally {
      setMarkPaidSaving(false)
    }
  }

  const totalPending = pendingByType.agent + pendingByType.external + pendingByType.pm_fee + pendingByType.landlord
  const totalPendingCount = countByType.agent + countByType.external + countByType.pm_fee + countByType.landlord

  // Year options
  const yearOptions = []
  for (let y = currentYear; y >= 2020; y--) {
    yearOptions.push(y)
  }

  return (
    <div className="min-h-screen bg-luxury-cream p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/reports" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="page-title">All Payouts</h1>
        </div>

        {/* Pending Summary Cards - Clickable Filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <button
            onClick={() => setTypeFilter(typeFilter === '' ? '' : '')}
            className={`container-card text-left transition-all ${typeFilter === '' ? 'ring-2 ring-luxury-accent' : 'hover:shadow-md'}`}
          >
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Total Pending</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(totalPending)}</p>
            <p className="text-xs text-luxury-gray-3">{totalPendingCount} items</p>
          </button>
          
          <button
            onClick={() => setTypeFilter(typeFilter === 'agent' ? '' : 'agent')}
            className={`container-card text-left transition-all ${typeFilter === 'agent' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}
          >
            <p className="text-xs text-blue-600 uppercase tracking-wide">Agents</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(pendingByType.agent)}</p>
            <p className="text-xs text-luxury-gray-3">{countByType.agent} pending</p>
          </button>
          
          <button
            onClick={() => setTypeFilter(typeFilter === 'external' ? '' : 'external')}
            className={`container-card text-left transition-all ${typeFilter === 'external' ? 'ring-2 ring-purple-500' : 'hover:shadow-md'}`}
          >
            <p className="text-xs text-purple-600 uppercase tracking-wide">External</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(pendingByType.external)}</p>
            <p className="text-xs text-luxury-gray-3">{countByType.external} pending</p>
          </button>
          
          <button
            onClick={() => setTypeFilter(typeFilter === 'landlord' ? '' : 'landlord')}
            className={`container-card text-left transition-all ${typeFilter === 'landlord' ? 'ring-2 ring-orange-500' : 'hover:shadow-md'}`}
          >
            <p className="text-xs text-orange-600 uppercase tracking-wide">Landlords</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(pendingByType.landlord)}</p>
            <p className="text-xs text-luxury-gray-3">{countByType.landlord} pending</p>
          </button>
          
          <button
            onClick={() => setTypeFilter(typeFilter === 'pm_fee' ? '' : 'pm_fee')}
            className={`container-card text-left transition-all ${typeFilter === 'pm_fee' ? 'ring-2 ring-teal-500' : 'hover:shadow-md'}`}
          >
            <p className="text-xs text-teal-600 uppercase tracking-wide">PM Fees</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(pendingByType.pm_fee)}</p>
            <p className="text-xs text-luxury-gray-3">{countByType.pm_fee} pending</p>
          </button>
        </div>

        {/* Filters */}
        <div className="container-card mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="field-label">Search</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Address or payee..."
                  className="input-luxury pl-9 w-full"
                />
              </div>
            </div>
            
            <div className="w-32">
              <label className="field-label">Year</label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="select-luxury w-full"
              >
                <option value="">All Years</option>
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label className="field-label">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="select-luxury w-full"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="hold">On Hold</option>
              </select>
            </div>

            <div className="w-36">
              <label className="field-label">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input-luxury w-full"
              />
            </div>

            <div className="w-36">
              <label className="field-label">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input-luxury w-full"
              />
            </div>

            {(search || statusFilter || typeFilter || yearFilter !== currentYear.toString() || fromDate || toDate) && (
              <button
                onClick={() => {
                  setSearch('')
                  setStatusFilter('')
                  setTypeFilter('')
                  setYearFilter(currentYear.toString())
                  setFromDate('')
                  setToDate('')
                }}
                className="btn btn-secondary flex items-center gap-1"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="container-card overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-luxury-accent" size={32} />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-luxury-gray-3">No payouts found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-luxury-gray-5">
                  <th className="th-luxury text-left">Type</th>
                  <th className="th-luxury text-left">Payee</th>
                  <th className="th-luxury text-left">Property</th>
                  <th className="th-luxury text-left">Transaction</th>
                  <th className="th-luxury text-right">Amount</th>
                  <th className="th-luxury text-center">Status</th>
                  <th className="th-luxury text-left">Date</th>
                  <th className="th-luxury text-left">Method</th>
                  <th className="th-luxury"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`} className="tr-luxury">
                    <td className="py-3 px-4">{getTypeBadge(row.type)}</td>
                    <td className="py-3 px-4 font-medium text-luxury-gray-1">{row.payee}</td>
                    <td className="py-3 px-4 text-luxury-gray-2 max-w-[200px] truncate">{row.address}</td>
                    <td className="py-3 px-4 text-luxury-gray-3">{row.transaction_type}</td>
                    <td className="py-3 px-4 text-right font-medium text-luxury-gray-1">{formatCurrency(row.amount)}</td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(row.payment_status, row)}</td>
                    <td className="py-3 px-4 text-luxury-gray-3">{formatDate(row.payment_date)}</td>
                    <td className="py-3 px-4 text-luxury-gray-3 uppercase text-xs">{row.payment_method || '-'}</td>
                    <td className="py-3 px-4">
                      {row.transaction_id && (
                        <Link href={`/admin/transactions/${row.transaction_id}`} className="text-luxury-accent hover:underline">
                          <ExternalLink size={14} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Mark as Paid</h2>
              <button onClick={() => setMarkPaidModal(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-luxury-gray-2 mb-1">Payee</p>
                <p className="font-medium text-luxury-gray-1">{markPaidModal.row.payee}</p>
              </div>
              <div>
                <p className="text-sm text-luxury-gray-2 mb-1">Amount</p>
                <p className="font-medium text-luxury-gray-1">{formatCurrency(markPaidModal.row.amount)}</p>
              </div>
              <div>
                <label className="field-label">Payment Date *</label>
                <input
                  type="date"
                  value={markPaidDate}
                  onChange={(e) => setMarkPaidDate(e.target.value)}
                  className="input-luxury w-full"
                  required
                />
              </div>
              <div>
                <label className="field-label">Payment Method</label>
                <select
                  value={markPaidMethod}
                  onChange={(e) => setMarkPaidMethod(e.target.value)}
                  className="select-luxury w-full"
                >
                  <option value="ach">ACH</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire</option>
                  <option value="zelle">Zelle</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => setMarkPaidModal(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleMarkPaid}
                disabled={markPaidSaving || !markPaidDate}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {markPaidSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
