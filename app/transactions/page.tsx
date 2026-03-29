'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus } from 'lucide-react'
import StatusBadge from '@/components/transactions/StatusBadge'
import { TransactionStatus } from '@/lib/transactions/types'
import { STATUS_GROUPS } from '@/lib/transactions/constants'

export default function TransactionsPage() {
  const router = useRouter()
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [transactions, setTransactions] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [transactionTypes, setTransactionTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [canViewAll, setCanViewAll] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/transactions')
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/auth/login')
            return
          }
          throw new Error('Failed to fetch transactions')
        }

        const data = await res.json()
        setTransactions(data.transactions || [])
        setAgents(data.agents || [])
        setPermissions(data.permissions || {})
        setCanViewAll(data.canViewAll || false)

        // Extract unique transaction types
        const types = Array.from(
          new Set((data.transactions || []).map((t: any) => t.transaction_type).filter(Boolean))
        ) as string[]
        setTransactionTypes(types.sort())
      } catch (err) {
        console.error('Error fetching transactions:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  const getAgentName = (submittedBy: string | null) => {
    if (!submittedBy) return ''
    const a = agents.find(a => a.id === submittedBy)
    if (!a) return ''
    return `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.trim()
  }

  const filtered = useMemo(() => {
    let list = [...transactions]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        t =>
          t.property_address?.toLowerCase().includes(q) ||
          t.client_name?.toLowerCase().includes(q) ||
          (canViewAll && getAgentName(t.submitted_by).toLowerCase().includes(q))
      )
    }

    if (statusFilter !== 'all') {
      const group = STATUS_GROUPS[statusFilter as keyof typeof STATUS_GROUPS]
      if (group) list = list.filter(t => group.includes(t.status))
    }

    if (canViewAll && agentFilter !== 'all') {
      list = list.filter(t => t.submitted_by === agentFilter)
    }

    if (canViewAll && typeFilter !== 'all') {
      list = list.filter(t => t.transaction_type === typeFilter)
    }

    return list
  }, [transactions, searchQuery, statusFilter, agentFilter, typeFilter, agents, canViewAll])

  const statusCounts = useMemo(
    () => ({
      all: transactions.length,
      active: transactions.filter(t => STATUS_GROUPS.active.includes(t.status)).length,
      compliance: transactions.filter(t => STATUS_GROUPS.compliance.includes(t.status)).length,
      processing: transactions.filter(t => STATUS_GROUPS.processing.includes(t.status)).length,
      complete: transactions.filter(t => STATUS_GROUPS.complete.includes(t.status)).length,
    }),
    [transactions]
  )

  const formatPrice = (t: any) => {
    const amount = t.monthly_rent || t.sales_price
    if (!amount) return ''
    return `$${parseFloat(amount).toLocaleString()}`
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">
          {canViewAll ? 'TRANSACTIONS' : 'MY TRANSACTIONS'} ({filtered.length})
        </h1>
        <button
          onClick={() => router.push('/transactions/new')}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <Plus size={14} /> New Transaction
        </button>
      </div>

      <div className="container-card">
        <div className="flex flex-col gap-3 mb-5">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3"
              size={18}
            />
            <input
              type="text"
              placeholder={
                canViewAll
                  ? 'Search by address, client, or agent...'
                  : 'Search by address or client...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-luxury pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="select-luxury text-xs flex-1 min-w-[140px]"
            >
              <option value="all">All Status ({statusCounts.all})</option>
              <option value="active">Active ({statusCounts.active})</option>
              <option value="compliance">In Compliance ({statusCounts.compliance})</option>
              <option value="processing">Processing ({statusCounts.processing})</option>
              <option value="complete">Complete ({statusCounts.complete})</option>
            </select>

            {canViewAll && (
              <select
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
                className="select-luxury text-xs flex-1 min-w-[140px]"
              >
                <option value="all">All Agents</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.preferred_first_name || a.first_name} {a.preferred_last_name || a.last_name}
                  </option>
                ))}
              </select>
            )}

            {canViewAll && transactionTypes.length > 0 && (
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="select-luxury text-xs flex-1 min-w-[140px]"
              >
                <option value="all">All Types</option>
                {transactionTypes.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No transactions yet</p>
            <button onClick={() => router.push('/transactions/new')} className="btn btn-primary">
              Create Your First Transaction
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No transactions match your filters</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Property</th>
                    {canViewAll && <th className="th-luxury">Agent</th>}
                    <th className="th-luxury">Type</th>
                    <th className="th-luxury">Client</th>
                    <th className="th-luxury">Price</th>
                    <th className="th-luxury">Status</th>
                    {canViewAll && <th className="th-luxury">Compliance</th>}
                    <th className="th-luxury">Closing Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr
                      key={t.id}
                      className="tr-luxury-clickable"
                      onClick={() => router.push(`/transactions/${t.id}`)}
                    >
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {t.property_address || 'No address'}
                        </p>
                        {canViewAll && t.office_location && (
                          <p className="text-xs text-luxury-gray-3">{t.office_location}</p>
                        )}
                      </td>
                      {canViewAll && (
                        <td className="py-3 px-4 text-xs text-luxury-gray-2">
                          {getAgentName(t.submitted_by)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {t.transaction_type || ''}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {t.client_name || ''}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{formatPrice(t)}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={t.status as TransactionStatus} />
                      </td>
                      {canViewAll && (
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              t.compliance_status === 'approved'
                                ? 'bg-green-50 text-green-700'
                                : t.compliance_status === 'revision_requested'
                                  ? 'bg-orange-50 text-orange-700'
                                  : ['submitted', 'in_review'].includes(t.compliance_status)
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-luxury-light text-luxury-gray-3'
                            }`}
                          >
                            {t.compliance_status?.replace(/_/g, ' ') || 'not requested'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {formatDate(t.closing_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {filtered.map(t => (
                <div
                  key={t.id}
                  className="inner-card cursor-pointer"
                  onClick={() => router.push(`/transactions/${t.id}`)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 flex-1">
                      {t.property_address || 'No address'}
                    </p>
                    <span className="flex-shrink-0 ml-2">
                      <StatusBadge status={t.status as TransactionStatus} />
                    </span>
                  </div>
                  <div className="text-xs text-luxury-gray-3 space-y-0.5">
                    {canViewAll && getAgentName(t.submitted_by) && (
                      <p className="font-medium text-luxury-gray-2">
                        {getAgentName(t.submitted_by)}
                      </p>
                    )}
                    <p>
                      {t.transaction_type}
                      {t.client_name ? ` · ${t.client_name}` : ''}
                    </p>
                    {formatPrice(t) && <p>{formatPrice(t)}</p>}
                    {canViewAll &&
                      t.compliance_status &&
                      t.compliance_status !== 'not_requested' && (
                        <p>{t.compliance_status.replace(/_/g, ' ')}</p>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
