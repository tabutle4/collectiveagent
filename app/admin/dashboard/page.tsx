'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TrendingUp, DollarSign, Hash, Users, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalVolume: 0,
    totalUnits: 0,
    totalAgentNet: 0,
    totalOfficeNet: 0,
    activeCount: 0,
    pendingCount: 0,
    complianceCount: 0,
    closedCount: 0,
    agentCount: 0,
  })
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) { router.push('/auth/login'); return }
      const userData = JSON.parse(userStr)
      setUser(userData)

      // Get all transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, property_address, status, transaction_type, sales_price, monthly_rent, lease_term, client_name, updated_at, closing_date, closed_date, office_gross, office_net')
        .order('updated_at', { ascending: false })

      // Get all agent financials for closed transactions
      const { data: agentRows } = await supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_net, sales_volume, units')

      // Get active agent count
      const { count: agentCount } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .contains('roles', ['agent'])

      const txns = transactions || []
      const agentData = agentRows || []
      const currentYear = new Date().getFullYear()

      let totalVolume = 0
      let totalUnits = 0
      let totalAgentNet = 0
      let totalOfficeNet = 0
      let closedCount = 0
      let pendingCount = 0
      let activeCount = 0
      let complianceCount = 0

      txns.forEach(t => {
        const closedYear = t.closed_date ? new Date(t.closed_date).getFullYear() : null

        if (t.status === 'closed' && closedYear === currentYear) {
          closedCount++
          totalUnits++
          if (t.sales_price) {
            totalVolume += parseFloat(t.sales_price)
          } else if (t.monthly_rent && t.lease_term) {
            totalVolume += parseFloat(t.monthly_rent) * parseInt(t.lease_term)
          } else if (t.monthly_rent) {
            totalVolume += parseFloat(t.monthly_rent) * 12
          }
          if (t.office_net) totalOfficeNet += parseFloat(t.office_net)

          // Sum agent net from all agents on this transaction
          const matchingAgents = agentData.filter(a => a.transaction_id === t.id)
          matchingAgents.forEach(a => {
            if (a.agent_net) totalAgentNet += parseFloat(a.agent_net)
          })
        } else if (['pending', 'submitted', 'in_review', 'compliant', 'cda_in_progress', 'payout_in_progress', 'broker_review', 'cda_sent', 'payout_processed'].includes(t.status)) {
          pendingCount++
        } else if (['prospect', 'active_listing'].includes(t.status)) {
          activeCount++
        }

        if (['submitted', 'in_review', 'revision_requested'].includes(t.status)) {
          complianceCount++
        }
      })

      setStats({
        totalVolume,
        totalUnits,
        totalAgentNet,
        totalOfficeNet,
        activeCount,
        pendingCount,
        complianceCount,
        closedCount,
        agentCount: agentCount || 0,
      })

      setRecentTransactions(txns.slice(0, 8))
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally { setLoading(false) }
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount.toLocaleString()}`
  }

  const formatFullCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  const REPORT_METRICS = [
    { key: 'volume', label: 'Sales Volume', icon: TrendingUp, value: stats.totalVolume, isCurrency: true },
    { key: 'units', label: 'Units Closed', icon: Hash, value: stats.totalUnits, isCurrency: false },
    { key: 'agent_net', label: 'Agent Net', icon: DollarSign, value: stats.totalAgentNet, isCurrency: true },
    { key: 'office_net', label: 'Office Net', icon: DollarSign, value: stats.totalOfficeNet, isCurrency: true },
  ]

  // Ring calculations
  const ringSize = 140
  const strokeWidth = 10
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">DASHBOARD</h1>
        <p className="text-xs text-luxury-gray-3">{new Date().getFullYear()} Year to Date</p>
      </div>

      {/* YTD Reporting Rings */}
      <div className="container-card">
        <h2 className="section-title">YTD Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {REPORT_METRICS.map(metric => {
            const Icon = metric.icon
            // For the ring, show as percentage of a reasonable benchmark
            // Just show a full ring with the value in the center
            return (
              <div key={metric.key} className="flex flex-col items-center">
                <div className="relative">
                  <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#E5E5E5" strokeWidth={strokeWidth} />
                    <circle
                      cx={ringSize / 2} cy={ringSize / 2} r={radius}
                      fill="none"
                      stroke="var(--accent-color, #C5A278)"
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={metric.value > 0 ? 0 : circumference}
                      style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xl font-bold text-luxury-gray-1">
                      {metric.isCurrency ? formatCurrency(metric.value) : metric.value.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <Icon size={14} className="text-luxury-accent" />
                  <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{metric.label}</span>
                </div>
                <p className="text-sm font-medium text-luxury-gray-2 mt-1">{metric.isCurrency ? formatFullCurrency(metric.value) : metric.value.toLocaleString()}</p>
              </div>
            )
          })}
        </div>

        {/* Bottom stats */}
        <div className="flex items-center justify-center gap-8 mt-6 pt-5 border-t border-luxury-gray-5/30">
          <div className="text-center">
            <p className="text-lg font-bold text-luxury-gray-1">{stats.closedCount}</p>
            <p className="text-xs text-luxury-gray-3">Closed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-luxury-gray-1">{stats.pendingCount}</p>
            <p className="text-xs text-luxury-gray-3">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-luxury-gray-1">{stats.agentCount}</p>
            <p className="text-xs text-luxury-gray-3">Active Agents</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <div className="container-card text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/transactions?filter=active')}>
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><FileText size={16} className="text-blue-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.activeCount}</p>
          <p className="text-xs text-luxury-gray-3">Active</p>
        </div>
        <div className="container-card text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/transactions?filter=pending')}>
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center"><Clock size={16} className="text-yellow-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.pendingCount}</p>
          <p className="text-xs text-luxury-gray-3">Pending</p>
        </div>
        <div className="container-card text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/transactions?filter=compliance')}>
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center"><AlertCircle size={16} className="text-purple-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.complianceCount}</p>
          <p className="text-xs text-luxury-gray-3">In Compliance</p>
        </div>
        <div className="container-card text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/transactions?filter=closed')}>
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle size={16} className="text-green-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.closedCount}</p>
          <p className="text-xs text-luxury-gray-3">Closed This Year</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="container-card mt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Recent Transactions</h2>
          <button onClick={() => router.push('/admin/transactions')} className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">View All</button>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-sm text-luxury-gray-3 text-center py-8">No transactions yet</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Property</th>
                    <th className="th-luxury">Type</th>
                    <th className="th-luxury">Client</th>
                    <th className="th-luxury">Status</th>
                    <th className="th-luxury">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => (
                    <tr key={t.id} className="tr-luxury-clickable" onClick={() => router.push(`/admin/transactions/${t.id}`)}>
                      <td className="py-3 px-4 text-sm font-semibold text-luxury-gray-1">{t.property_address || 'No address'}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.transaction_type || ''}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.client_name || ''}</td>
                      <td className="py-3 px-4">
                        <span className={`status-badge ${
                          t.status === 'closed' ? 'bg-green-50 text-green-700' :
                          t.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                          ['submitted', 'in_review', 'revision_requested'].includes(t.status) ? 'bg-purple-50 text-purple-700' :
                          ['pending'].includes(t.status) ? 'bg-yellow-50 text-yellow-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>{t.status?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">{formatDate(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {recentTransactions.map((t) => (
                <div key={t.id} className="inner-card cursor-pointer" onClick={() => router.push(`/admin/transactions/${t.id}`)}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 flex-1">{t.property_address || 'No address'}</p>
                    <span className={`status-badge flex-shrink-0 ml-2 ${
                      t.status === 'closed' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                    }`}>{t.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-luxury-gray-3">{t.transaction_type}{t.client_name ? ` · ${t.client_name}` : ''}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}