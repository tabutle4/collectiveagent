'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrendingUp, DollarSign, Hash } from 'lucide-react'

type DateRange = 'ytd' | 'mtd' | 'qtd' | 'last_quarter' | 'last_month' | 'next_month' | 'next_quarter'
type TxnFilter = 'all' | 'sales' | 'leases'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'ytd', label: 'Year to Date' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'qtd', label: 'Quarter to Date' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'next_month', label: 'Next Month' },
  { value: 'next_quarter', label: 'Next Quarter' },
]

function getDateRange(range: DateRange): { start: Date; end: Date; label: string; isFuture: boolean } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const quarter = Math.floor(month / 3)

  switch (range) {
    case 'ytd':
      return { start: new Date(year, 0, 1), end: now, label: `${year} Year to Date`, isFuture: false }
    case 'mtd':
      return { start: new Date(year, month, 1), end: now, label: `${now.toLocaleString('en-US', { month: 'long' })} ${year}`, isFuture: false }
    case 'qtd': {
      const qStart = new Date(year, quarter * 3, 1)
      return { start: qStart, end: now, label: `Q${quarter + 1} ${year} to Date`, isFuture: false }
    }
    case 'last_month': {
      const lmStart = new Date(year, month - 1, 1)
      const lmEnd = new Date(year, month, 0, 23, 59, 59)
      return { start: lmStart, end: lmEnd, label: `${lmStart.toLocaleString('en-US', { month: 'long' })} ${lmStart.getFullYear()}`, isFuture: false }
    }
    case 'last_quarter': {
      const lq = quarter === 0 ? 3 : quarter - 1
      const lqYear = quarter === 0 ? year - 1 : year
      const lqStart = new Date(lqYear, lq * 3, 1)
      const lqEnd = new Date(lqYear, (lq + 1) * 3, 0, 23, 59, 59)
      return { start: lqStart, end: lqEnd, label: `Q${lq + 1} ${lqYear}`, isFuture: false }
    }
    case 'next_month': {
      const nmStart = new Date(year, month + 1, 1)
      const nmEnd = new Date(year, month + 2, 0, 23, 59, 59)
      return { start: nmStart, end: nmEnd, label: `${nmStart.toLocaleString('en-US', { month: 'long' })} ${nmStart.getFullYear()}`, isFuture: true }
    }
    case 'next_quarter': {
      const nq = quarter + 1
      const nqYear = nq > 3 ? year + 1 : year
      const nqActual = nq > 3 ? 0 : nq
      const nqStart = new Date(nqYear, nqActual * 3, 1)
      const nqEnd = new Date(nqYear, (nqActual + 1) * 3, 0, 23, 59, 59)
      return { start: nqStart, end: nqEnd, label: `Q${nqActual + 1} ${nqYear}`, isFuture: true }
    }
  }
}

export default function AdminDashboard() {
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('ytd')
  const [txnFilter, setTxnFilter] = useState<TxnFilter>('all')
  const [metrics, setMetrics] = useState({ volume: 0, units: 0, agentNet: 0, officeNet: 0 })
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [allAgentRows, setAllAgentRows] = useState<any[]>([])
  const [leaseTypes, setLeaseTypes] = useState<string[]>([])

  useEffect(() => {
    fetchProspects()
    fetchTransactionData()
  }, [])

  useEffect(() => {
    calculateMetrics()
  }, [dateRange, txnFilter, allTransactions, allAgentRows, leaseTypes])

  const fetchProspects = async () => {
    try {
      const response = await fetch('/api/prospects')
      const data = await response.json()
      setProspects(data.prospects || [])
    } catch (error) {
      console.error('Error fetching prospects:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactionData = async () => {
    try {
      const [txnRes, agentRes, typesRes] = await Promise.all([
        supabase.from('transactions').select('id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net'),
        supabase.from('transaction_internal_agents').select('transaction_id, agent_net'),
        supabase.from('processing_fee_types').select('name, is_lease').eq('is_active', true),
      ])
      setAllTransactions(txnRes.data || [])
      setAllAgentRows(agentRes.data || [])
      // Build list of lease type names
      const leaseNames = (typesRes.data || []).filter((t: any) => t.is_lease).map((t: any) => t.name)
      setLeaseTypes(leaseNames)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const calculateMetrics = () => {
    const { start, end, isFuture } = getDateRange(dateRange)

    let volume = 0, units = 0, agentNet = 0, officeNet = 0

    allTransactions.forEach(t => {
      // Filter by sales vs leases
      const isLease = leaseTypes.some(lt => t.transaction_type?.toLowerCase().includes(lt.toLowerCase()))
        || t.transaction_type?.toLowerCase().includes('tenant')
        || t.transaction_type?.toLowerCase().includes('landlord')
        || t.transaction_type?.toLowerCase().includes('lease')
      if (txnFilter === 'sales' && isLease) return
      if (txnFilter === 'leases' && !isLease) return

      // Determine the relevant date
      // Sales use closing_date, leases use move_in_date
      const dateStr = isLease ? t.move_in_date : t.closing_date
      if (!dateStr) return
      const txnDate = new Date(dateStr)
      if (txnDate < start || txnDate > end) return

      // Past/current: only count closed transactions
      // Future: count any non-cancelled transaction (projected)
      if (!isFuture && t.status !== 'closed') return
      if (isFuture && t.status === 'cancelled') return

      units++
      if (t.sales_price) volume += parseFloat(t.sales_price)
      else if (t.monthly_rent && t.lease_term) volume += parseFloat(t.monthly_rent) * parseInt(t.lease_term)
      else if (t.monthly_rent) volume += parseFloat(t.monthly_rent) * 12
      if (t.office_net) officeNet += parseFloat(t.office_net)

      allAgentRows.filter(a => a.transaction_id === t.id).forEach(a => {
        if (a.agent_net) agentNet += parseFloat(a.agent_net)
      })
    })

    setMetrics({ volume, units, agentNet, officeNet })
  }

  const stats = {
    new: prospects.filter(p => p.status === 'new').length,
    contacted: prospects.filter(p => p.status === 'contacted').length,
    total: prospects.length,
  }

  const recentProspects = prospects.slice(0, 5)

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount.toLocaleString()}`
  }

  const formatFullCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
  }

  const ringSize = 130
  const strokeWidth = 10
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const REPORT_METRICS = [
    { key: 'volume', label: 'Sales Volume', icon: TrendingUp, value: metrics.volume, isCurrency: true },
    { key: 'units', label: 'Units Closed', icon: Hash, value: metrics.units, isCurrency: false },
    { key: 'agentNet', label: 'Agent Net', icon: DollarSign, value: metrics.agentNet, isCurrency: true },
    { key: 'officeNet', label: 'Office Net', icon: DollarSign, value: metrics.officeNet, isCurrency: true },
  ]

  const rangeInfo = getDateRange(dateRange)

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <h1 className="page-title mb-6">DASHBOARD</h1>

      {/* YTD Reporting */}
      <div className="container-card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{rangeInfo.label}</h2>
          <div className="flex gap-2">
            <select
              className="select-luxury w-auto text-xs"
              value={txnFilter}
              onChange={(e) => setTxnFilter(e.target.value as TxnFilter)}
            >
              <option value="all">All Transactions</option>
              <option value="sales">Sales Only</option>
              <option value="leases">Leases Only</option>
            </select>
            <select
              className="select-luxury w-auto text-xs"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
            >
              {DATE_RANGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {REPORT_METRICS.map(metric => {
            const Icon = metric.icon
            return (
              <div key={metric.key} className="flex flex-col items-center">
                <div className="relative">
                  <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#E5E5E5" strokeWidth={strokeWidth} />
                    <circle
                      cx={ringSize / 2} cy={ringSize / 2} r={radius}
                      fill="none"
                      stroke={metric.value > 0 ? 'var(--accent-color, #C5A278)' : '#E5E5E5'}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={metric.value > 0 ? 0 : circumference}
                      style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-lg font-bold text-luxury-gray-1">
                      {metric.isCurrency ? formatCurrency(metric.value) : metric.value.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <Icon size={12} className="text-luxury-accent" />
                  <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{metric.label}</span>
                </div>
                <p className="text-xs text-luxury-gray-2 mt-0.5">{metric.isCurrency ? formatFullCurrency(metric.value) : metric.value.toLocaleString()}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left container card - Needs Attention */}
        <div className="lg:col-span-5">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Needs Attention</h2>
            <div className="space-y-3">
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Compliance Requested</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions awaiting compliance review</p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Approved - CDA Needed</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions ready for CDA</p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Eligible for Payout</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions eligible for payout</p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Broker Approval Pending</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No CDAs awaiting broker approval</p>
              </div>
            </div>
          </div>
        </div>
        {/* Right container card - Overview */}
        <div className="lg:col-span-7">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Overview</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">New Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.new}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Contacted</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.contacted}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Total Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
              </div>
            </div>
            <div className="inner-card mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-luxury-gray-1">Contact Submissions</p>
                <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
              </div>
              <p className="text-xs text-luxury-gray-3 mb-2">No new contact submissions</p>
              <Link href="/admin/contact-submissions" className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">
                View all submissions
              </Link>
            </div>
            <div className="inner-card">
              <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
                Recent Activity
              </h3>
              {recentProspects.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">No prospects yet</p>
              ) : (
                <div>
                  {recentProspects.map((prospect) => (
                    <div
                      key={prospect.id}
                      className="flex items-center justify-between py-2.5 border-b border-luxury-gray-5/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {prospect.preferred_first_name} {prospect.preferred_last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {new Date(prospect.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        href={`/admin/prospects/${prospect.id}`}
                        className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-center mt-4">
                <Link href="/admin/prospects" className="btn btn-secondary text-sm">
                  View All Prospects
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}