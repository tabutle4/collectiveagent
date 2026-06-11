'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, X, ExternalLink, Image, Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'
import AddCheckModal from '@/components/transactions/AddCheckModal'

interface AgentRow {
  agent_id: string
  agent_role: string
  name: string
}

interface ContactRow {
  contact_type: string
  name: string | null
  email: string | null
  company: string | null
}

interface CheckRow {
  id: string
  transaction_id: string | null
  property_address: string
  transaction_type: string | null
  check_amount: number
  brokerage_amount: number | null
  check_number: string | null
  check_from: string | null
  check_image_url: string | null
  check_date: string | null
  received_date: string
  deposited_date: string | null
  cleared_date: string | null
  status: string
  payment_method: string | null
  agents_paid: boolean
  crc_transferred: boolean
  paid_self: boolean
  paid_count: number
  paid_total: number
  compliance_complete_date: string | null
  notes: string | null
  agents: AgentRow[]
  contacts: ContactRow[]
}

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
    : '-'

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '-'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    received:  'text-amber-700 bg-amber-50',
    deposited: 'text-blue-700 bg-blue-50',
    cleared:   'text-green-700 bg-green-50',
  }
  const cls = map[status] || 'text-luxury-gray-3 bg-luxury-gray-5/50'
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize ${cls}`}>{status}</span>
  )
}

function paidBadge(c: CheckRow, isAdmin: boolean) {
  if (isAdmin) {
    const allPaid = c.paid_total > 0 && c.paid_count === c.paid_total
    const cls = allPaid ? 'text-green-700 bg-green-50' : 'text-luxury-gray-3 bg-luxury-gray-5/50'
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{c.paid_count}/{c.paid_total} paid</span>
    )
  }
  let label = 'No'
  let cls = 'text-luxury-gray-3 bg-luxury-gray-5/50'
  if (c.paid_self) {
    label = 'Yes'
    cls = 'text-green-700 bg-green-50'
  } else if (c.crc_transferred) {
    label = 'Pending'
    cls = 'text-amber-700 bg-amber-50'
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{label}</span>
  )
}

const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']

export default function ChecksPage() {
  const router = useRouter()
  const { user, hasPermission } = useAuth()

  const [showAddCheck, setShowAddCheck] = useState(false)

  const [checks, setChecks] = useState<CheckRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [dateField, setDateField] = useState('received_date')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const isAdmin = user ? ADMIN_ROLES.includes((user.role || '').toLowerCase()) : false

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (methodFilter) params.set('method', methodFilter)
      if (dateField)    params.set('date_field', dateField)
      if (fromDate)     params.set('from', fromDate)
      if (toDate)       params.set('to', toDate)

      const res = await fetch(`/api/checks/search?${params}`)
      if (!res.ok) {
        if (res.status === 401) { router.push('/auth/login'); return }
        throw new Error('Failed to load')
      }
      const data = await res.json()
      setChecks(data.checks || [])
      setTotal(data.total || 0)
    } catch {
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, methodFilter, dateField, fromDate, toDate, router])

  // Debounce
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setMethodFilter('')
    setDateField('received_date')
    setFromDate('')
    setToDate('')
  }

  const hasFilters = search || statusFilter || methodFilter || fromDate || toDate

  return (
    <div className="min-h-screen bg-luxury-cream">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-title">CHECKS</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-luxury-gray-3">{total} result{total !== 1 ? 's' : ''}</span>
            {hasPermission('can_manage_checks') && (
              <button
                type="button"
                onClick={() => setShowAddCheck(true)}
                className="btn btn-primary text-sm flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Check
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="container-card mb-6">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="field-label">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Address, payer, check #, agent, contact..."
                  className="input-luxury pl-9 w-full text-sm"
                />
              </div>
            </div>

            {/* Status */}
            <div className="w-32">
              <label className="field-label">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-luxury w-full">
                <option value="">All</option>
                <option value="received">Received</option>
                <option value="deposited">Deposited</option>
                <option value="cleared">Cleared</option>
              </select>
            </div>

            {/* Payment method */}
            <div className="w-32">
              <label className="field-label">Type</label>
              <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="select-luxury w-full">
                <option value="">All</option>
                <option value="check">Check</option>
                <option value="zelle">Zelle</option>
                <option value="payload">Payload</option>
                <option value="ecommission">eCommission</option>
              </select>
            </div>

            {/* Date field selector */}
            <div className="w-36">
              <label className="field-label">Date by</label>
              <select value={dateField} onChange={e => setDateField(e.target.value)} className="select-luxury w-full">
                <option value="received_date">Received</option>
                <option value="cleared_date">Cleared</option>
                <option value="deposited_date">Deposited</option>
                <option value="check_date">Check Date</option>
              </select>
            </div>

            {/* From */}
            <div className="w-36">
              <label className="field-label">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-luxury w-full" />
            </div>

            {/* To */}
            <div className="w-36">
              <label className="field-label">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-luxury w-full" />
            </div>

            {/* Clear */}
            {hasFilters && (
              <button onClick={clearFilters} className="btn btn-secondary flex items-center gap-1 text-xs self-end">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="container-card overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-luxury-gray-3" />
            </div>
          ) : checks.length === 0 ? (
            <p className="text-center py-14 text-xs text-luxury-gray-3">No checks found</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {checks.map(c => (
                  <MobileCard key={c.id} check={c} isAdmin={isAdmin} />
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr className="border-b border-luxury-gray-5/50">
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Property</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Payer</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Check #</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Amount</th>
                      {isAdmin && (
                        <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">CRC</th>
                      )}
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Status</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Paid</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Received</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Cleared</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Agent(s)</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Contacts</th>
                      <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-center">Photo</th>
                      <th className="pb-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map(c => (
                      <DesktopRow key={c.id} check={c} isAdmin={isAdmin} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>

      {showAddCheck && (
        <AddCheckModal
          onClose={() => setShowAddCheck(false)}
          onSaved={() => { setShowAddCheck(false); load() }}
        />
      )}
    </div>
  )
}

function DesktopRow({ check: c, isAdmin }: { check: CheckRow; isAdmin: boolean }) {
  const agentNames = c.agents.map(a => a.name.split(' ')[0]).join(', ') || '-'
  const contactSummary = c.contacts
    .filter(ct => ct.name)
    .slice(0, 2)
    .map(ct => ct.name)
    .join(', ') || '-'

  const txnHref = c.transaction_id
    ? (isAdmin ? `/admin/transactions/${c.transaction_id}` : `/agent/transactions/${c.transaction_id}`)
    : null

  return (
    <tr className="border-b border-luxury-gray-5/30 hover:bg-luxury-gray-5/20">
      <td className="py-2 px-2 text-xs text-luxury-gray-1 font-medium max-w-[180px]">
        <span className="truncate block">{c.property_address || '-'}</span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 max-w-[130px]">
        <span className="truncate block">{c.check_from || '-'}</span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 whitespace-nowrap">{c.check_number || '-'}</td>
      <td className="py-2 px-2 text-xs text-right font-semibold text-luxury-gray-1 whitespace-nowrap">{fmt(c.check_amount)}</td>
      {isAdmin && (
        <td className="py-2 px-2 text-xs text-right text-luxury-gray-3 whitespace-nowrap">
          {c.brokerage_amount != null ? fmt(c.brokerage_amount) : '-'}
        </td>
      )}
      <td className="py-2 px-2">{statusBadge(c.status)}</td>
      <td className="py-2 px-2">{paidBadge(c, isAdmin)}</td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 whitespace-nowrap">{fmtDate(c.received_date)}</td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 whitespace-nowrap">{fmtDate(c.cleared_date)}</td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 max-w-[120px]">
        <span className="truncate block">{agentNames}</span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 max-w-[120px]">
        <span className="truncate block">{contactSummary}</span>
      </td>
      <td className="py-2 px-2 text-center">
        {c.check_image_url ? (
          <a href={c.check_image_url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent hover:opacity-70" title="View check photo">
            <Image size={14} />
          </a>
        ) : (
          <span className="text-luxury-gray-5">-</span>
        )}
      </td>
      <td className="py-2 px-2">
        {txnHref && (
          <Link href={txnHref} className="text-luxury-accent hover:opacity-70">
            <ExternalLink size={13} />
          </Link>
        )}
      </td>
    </tr>
  )
}

function MobileCard({ check: c, isAdmin }: { check: CheckRow; isAdmin: boolean }) {
  const txnHref = c.transaction_id
    ? (isAdmin ? `/admin/transactions/${c.transaction_id}` : `/agent/transactions/${c.transaction_id}`)
    : null

  const agentNames = c.agents.map(a => a.name).join(', ')
  const contactNames = c.contacts.filter(ct => ct.name).map(ct => ct.name).join(', ')

  return (
    <div className="container-card rounded-lg overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-luxury-gray-1 leading-snug truncate">{c.property_address || '-'}</p>
          {c.check_from && <p className="text-xs text-luxury-gray-3 mt-0.5">{c.check_from}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-luxury-gray-1">{fmt(c.check_amount)}</p>
          {isAdmin && c.brokerage_amount != null && (
            <p className="text-xs text-luxury-gray-3">{fmt(c.brokerage_amount)} CRC</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {statusBadge(c.status)}
        {paidBadge(c, isAdmin)}
        {c.check_number && <span className="text-xs text-luxury-gray-3">#{c.check_number}</span>}
        {c.payment_method && <span className="text-xs text-luxury-gray-3 capitalize">{c.payment_method}</span>}
      </div>

      <div className="border-t border-luxury-gray-5/40 px-4 py-2 space-y-0.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-luxury-gray-3">Received</span>
          <span className="text-luxury-gray-2">{fmtDate(c.received_date)}</span>
        </div>
        {c.cleared_date && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-luxury-gray-3">Cleared</span>
            <span className="text-luxury-gray-2">{fmtDate(c.cleared_date)}</span>
          </div>
        )}
        {agentNames && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-luxury-gray-3">Agent</span>
            <span className="text-luxury-gray-2 truncate max-w-[180px]">{agentNames}</span>
          </div>
        )}
        {contactNames && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-luxury-gray-3">Contacts</span>
            <span className="text-luxury-gray-2 truncate max-w-[180px]">{contactNames}</span>
          </div>
        )}
      </div>

      <div className="border-t border-luxury-gray-5/40 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {c.check_image_url && (
            <a href={c.check_image_url} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent flex items-center gap-1">
              <Image size={12} /> Photo
            </a>
          )}
          {c.notes && <span className="text-xs text-luxury-gray-3 italic truncate max-w-[160px]">{c.notes}</span>}
        </div>
        {txnHref && (
          <Link href={txnHref} className="text-luxury-accent hover:opacity-70 flex items-center gap-1 text-xs">
            <ExternalLink size={12} /> Transaction
          </Link>
        )}
      </div>
    </div>
  )
}
