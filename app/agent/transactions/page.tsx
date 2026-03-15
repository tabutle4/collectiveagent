'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Plus } from 'lucide-react'
import StatusBadge from '@/components/transactions/StatusBadge'
import { TransactionStatus } from '@/lib/transactions/types'
import { STATUS_GROUPS } from '@/lib/transactions/constants'

export default function AgentTransactionsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) { router.push('/auth/login'); return }
    const userData = JSON.parse(userStr)
    setUser(userData)
    fetchTransactions(userData.id)
  }, [])

  const fetchTransactions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, updated_at, property_address, status, compliance_status, client_name, sales_price, monthly_rent, processing_fee_type_id, closing_date, move_in_date, processing_fee_types(name, is_lease)')
        .eq('submitted_by', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      setTransactions(data || [])
    } catch (error) { console.error('Error fetching transactions:', error) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    let list = [...transactions]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        t.property_address?.toLowerCase().includes(q) ||
        t.client_name?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      const group = STATUS_GROUPS[statusFilter as keyof typeof STATUS_GROUPS]
      if (group) list = list.filter(t => group.includes(t.status))
    }
    return list
  }, [transactions, searchQuery, statusFilter])

  const statusCounts = useMemo(() => ({
    all: transactions.length,
    active: transactions.filter(t => STATUS_GROUPS.active.includes(t.status)).length,
    compliance: transactions.filter(t => STATUS_GROUPS.compliance.includes(t.status)).length,
    processing: transactions.filter(t => STATUS_GROUPS.processing.includes(t.status)).length,
    complete: transactions.filter(t => STATUS_GROUPS.complete.includes(t.status)).length,
  }), [transactions])

  const formatPrice = (t: any) => {
    const isLease = t.processing_fee_types?.is_lease
    const amount = isLease ? t.monthly_rent : t.sales_price
    if (!amount) return ''
    return `$${parseFloat(amount).toLocaleString()}`
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">MY TRANSACTIONS ({filtered.length})</h1>
        <button onClick={() => router.push('/agent/transactions/new')} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={14} /> New Transaction
        </button>
      </div>

      <div className="container-card">
        <div className="flex flex-col md:flex-row gap-4 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3" size={18} />
            <input type="text" placeholder="Search by address or client..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-luxury pl-10" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-luxury md:w-48">
            <option value="all">All ({statusCounts.all})</option>
            <option value="active">Active ({statusCounts.active})</option>
            <option value="compliance">In Compliance ({statusCounts.compliance})</option>
            <option value="processing">Processing ({statusCounts.processing})</option>
            <option value="complete">Complete ({statusCounts.complete})</option>
          </select>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No transactions yet</p>
            <button onClick={() => router.push('/agent/transactions/new')} className="btn btn-primary">
              Create Your First Transaction
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No transactions match your filters</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Property</th>
                    <th className="th-luxury">Type</th>
                    <th className="th-luxury">Client</th>
                    <th className="th-luxury">Price</th>
                    <th className="th-luxury">Status</th>
                    <th className="th-luxury">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="tr-luxury-clickable" onClick={() => router.push(`/agent/transactions/${t.id}`)}>
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-luxury-gray-1">{t.property_address || 'No address'}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.processing_fee_types?.name || ''}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.client_name || ''}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{formatPrice(t)}</td>
                      <td className="py-3 px-4"><StatusBadge status={t.status as TransactionStatus} /></td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">{formatDate(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {filtered.map((t) => (
                <div key={t.id} className="inner-card cursor-pointer" onClick={() => router.push(`/agent/transactions/${t.id}`)}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 flex-1">{t.property_address || 'No address'}</p>
                    <span className="flex-shrink-0 ml-2"><StatusBadge status={t.status as TransactionStatus} /></span>
                  </div>
                  <div className="text-xs text-luxury-gray-3 space-y-0.5">
                    <p>{t.processing_fee_types?.name}{t.client_name ? ` · ${t.client_name}` : ''}</p>
                    {formatPrice(t) && <p>{formatPrice(t)}</p>}
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
