'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, DollarSign, Hash } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'

type DateRange =
  | 'ytd'
  | 'mtd'
  | 'qtd'
  | 'last_month'
  | 'last_quarter'
  | 'last_year'
  | 'last_q1'
  | 'last_q2'
  | 'last_q3'
  | 'last_q4'
  | 'next_month'
  | 'next_quarter'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
type TxnFilter = 'all' | 'sales' | 'leases'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'ytd', label: 'Year to Date' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'qtd', label: 'Quarter to Date' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'last_q1', label: 'Last Year Q1' },
  { value: 'last_q2', label: 'Last Year Q2' },
  { value: 'last_q3', label: 'Last Year Q3' },
  { value: 'last_q4', label: 'Last Year Q4' },
  { value: 'next_month', label: 'Next Month' },
  { value: 'next_quarter', label: 'Next Quarter' },
  { value: 'q1', label: 'Q1 This Year' },
  { value: 'q2', label: 'Q2 This Year' },
  { value: 'q3', label: 'Q3 This Year' },
  { value: 'q4', label: 'Q4 This Year' },
]

// Chart color palettes
const GOLD_COLORS = [
  '#C5A278', '#B08F60', '#A68552', '#967545', '#8B6D3F', '#7A5F35', '#DCC49E', '#E8D4B8',
]
const GRAY_COLORS = ['#888888', '#A3A3A3', '#BEBEBE', '#D5D5D5']

function getDateRange(range: DateRange): {
  start: Date
  end: Date
  label: string
  isFuture: boolean
} {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const quarter = Math.floor(month / 3)

  switch (range) {
    case 'ytd':
      return {
        start: new Date(year, 0, 1),
        end: now,
        label: `${year} Year to Date`,
        isFuture: false,
      }
    case 'mtd':
      return {
        start: new Date(year, month, 1),
        end: now,
        label: `${now.toLocaleString('en-US', { month: 'long' })} ${year}`,
        isFuture: false,
      }
    case 'qtd': {
      const qStart = new Date(year, quarter * 3, 1)
      return { start: qStart, end: now, label: `Q${quarter + 1} ${year} to Date`, isFuture: false }
    }
    case 'last_month': {
      const lmStart = new Date(year, month - 1, 1)
      const lmEnd = new Date(year, month, 0, 23, 59, 59)
      return {
        start: lmStart,
        end: lmEnd,
        label: `${lmStart.toLocaleString('en-US', { month: 'long' })} ${lmStart.getFullYear()}`,
        isFuture: false,
      }
    }
    case 'last_quarter': {
      const lq = quarter === 0 ? 3 : quarter - 1
      const lqYear = quarter === 0 ? year - 1 : year
      const lqStart = new Date(lqYear, lq * 3, 1)
      const lqEnd = new Date(lqYear, (lq + 1) * 3, 0, 23, 59, 59)
      return { start: lqStart, end: lqEnd, label: `Q${lq + 1} ${lqYear}`, isFuture: false }
    }
    case 'last_year':
      return {
        start: new Date(year - 1, 0, 1),
        end: new Date(year - 1, 11, 31, 23, 59, 59),
        label: `${year - 1} Full Year`,
        isFuture: false,
      }
    case 'last_q1':
      return {
        start: new Date(year - 1, 0, 1),
        end: new Date(year - 1, 2, 31, 23, 59, 59),
        label: `Q1 ${year - 1}`,
        isFuture: false,
      }
    case 'last_q2':
      return {
        start: new Date(year - 1, 3, 1),
        end: new Date(year - 1, 5, 30, 23, 59, 59),
        label: `Q2 ${year - 1}`,
        isFuture: false,
      }
    case 'last_q3':
      return {
        start: new Date(year - 1, 6, 1),
        end: new Date(year - 1, 8, 30, 23, 59, 59),
        label: `Q3 ${year - 1}`,
        isFuture: false,
      }
    case 'last_q4':
      return {
        start: new Date(year - 1, 9, 1),
        end: new Date(year - 1, 11, 31, 23, 59, 59),
        label: `Q4 ${year - 1}`,
        isFuture: false,
      }
    case 'next_month': {
      const nmStart = new Date(year, month + 1, 1)
      const nmEnd = new Date(year, month + 2, 0, 23, 59, 59)
      return {
        start: nmStart,
        end: nmEnd,
        label: `${nmStart.toLocaleString('en-US', { month: 'long' })} ${nmStart.getFullYear()}`,
        isFuture: true,
      }
    }
    case 'next_quarter': {
      const nq = quarter + 1
      const nqYear = nq > 3 ? year + 1 : year
      const nqActual = nq > 3 ? 0 : nq
      const nqStart = new Date(nqYear, nqActual * 3, 1)
      const nqEnd = new Date(nqYear, (nqActual + 1) * 3, 0, 23, 59, 59)
      return { start: nqStart, end: nqEnd, label: `Q${nqActual + 1} ${nqYear}`, isFuture: true }
    }
    case 'q1':
      return {
        start: new Date(year, 0, 1),
        end: quarter > 0 ? new Date(year, 2, 31, 23, 59, 59) : now,
        label: `Q1 ${year}`,
        isFuture: false,
      }
    case 'q2':
      return {
        start: new Date(year, 3, 1),
        end:
          quarter > 1
            ? new Date(year, 5, 30, 23, 59, 59)
            : quarter === 1
              ? now
              : new Date(year, 5, 30, 23, 59, 59),
        label: `Q2 ${year}`,
        isFuture: quarter < 1,
      }
    case 'q3':
      return {
        start: new Date(year, 6, 1),
        end:
          quarter > 2
            ? new Date(year, 8, 30, 23, 59, 59)
            : quarter === 2
              ? now
              : new Date(year, 8, 30, 23, 59, 59),
        label: `Q3 ${year}`,
        isFuture: quarter < 2,
      }
    case 'q4':
      return {
        start: new Date(year, 9, 1),
        end: quarter === 3 ? now : new Date(year, 11, 31, 23, 59, 59),
        label: `Q4 ${year}`,
        isFuture: quarter < 3,
      }
    default:
      return {
        start: new Date(year, 0, 1),
        end: now,
        label: `${year} Year to Date`,
        isFuture: false,
      }
  }
}

// Multi-segment donut chart component
interface DonutSegment {
  label: string
  value: number
  color: string
}

function MultiSegmentDonut({
  segments,
  size = 150,
  strokeWidth = 12,
  centerLabel,
  centerValue,
  formatValue,
}: {
  segments: DonutSegment[]
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerValue?: string
  formatValue?: (val: number) => string
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  let accumulatedOffset = 0
  const segmentArcs = segments
    .filter(s => s.value > 0)
    .map((segment, i) => {
      const percentage = total > 0 ? segment.value / total : 0
      const dashLength = percentage * circumference
      const offset = accumulatedOffset
      accumulatedOffset += dashLength
      return { ...segment, dashLength, offset, percentage, originalIndex: i }
    })

  const hoveredSegment = hoveredIndex !== null ? segmentArcs.find(s => s.originalIndex === hoveredIndex) : null

  return (
    <div className="flex items-start gap-4">
      <div className="relative flex-shrink-0">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E5E5" strokeWidth={strokeWidth} />
          {segmentArcs.map((seg, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round"
              style={{ 
                transition: 'stroke-dasharray 0.8s ease-out, stroke-dashoffset 0.8s ease-out, stroke-width 0.15s ease-out',
                cursor: 'pointer'
              }}
              onMouseEnter={() => setHoveredIndex(seg.originalIndex)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoveredSegment ? (
            <>
              <p className="text-lg font-bold text-luxury-gray-1">
                {formatValue ? formatValue(hoveredSegment.value) : hoveredSegment.value.toLocaleString()}
              </p>
              <p className="text-[10px] text-luxury-gray-3 uppercase tracking-wide text-center px-2">
                {hoveredSegment.label}
              </p>
              <p className="text-[10px] text-luxury-gray-4">
                {(hoveredSegment.percentage * 100).toFixed(0)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-luxury-gray-1">{centerValue}</p>
              {centerLabel && <p className="text-[10px] text-luxury-gray-3 uppercase tracking-wide">{centerLabel}</p>}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 pt-2 min-w-0">
        {segmentArcs.map((seg, i) => (
          <div 
            key={i} 
            className={`flex items-center gap-2 text-xs cursor-pointer transition-opacity ${hoveredIndex !== null && hoveredIndex !== seg.originalIndex ? 'opacity-40' : ''}`}
            onMouseEnter={() => setHoveredIndex(seg.originalIndex)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-luxury-gray-2 truncate">{seg.label}</span>
            <span className="text-luxury-gray-1 font-medium ml-auto">
              {formatValue ? formatValue(seg.value) : seg.value.toLocaleString()}
            </span>
          </div>
        ))}
        {segments.length === 0 || total === 0 ? <p className="text-xs text-luxury-gray-3 italic">No data</p> : null}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { hasPermission } = useAuth()
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('ytd')
  const [txnFilter, setTxnFilter] = useState<TxnFilter>('all')
  const [metrics, setMetrics] = useState({ volume: 0, units: 0, agentNet: 0, officeNet: 0 })
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [allAgentRows, setAllAgentRows] = useState<any[]>([])
  const [leaseTypes, setLeaseTypes] = useState<string[]>([])

  // Breakdown states
  const [volumeByType, setVolumeByType] = useState<Record<string, number>>({})
  const [volumeByTeam, setVolumeByTeam] = useState<Record<string, number>>({})
  const [volumeByOffice, setVolumeByOffice] = useState<Record<string, number>>({})
  const [unitsByTeam, setUnitsByTeam] = useState<Record<string, number>>({})
  const [unitsByOffice, setUnitsByOffice] = useState<Record<string, number>>({})
  const [agentNetByTeam, setAgentNetByTeam] = useState<Record<string, number>>({})
  const [agentNetByOffice, setAgentNetByOffice] = useState<Record<string, number>>({})
  const [officeNetByTeam, setOfficeNetByTeam] = useState<Record<string, number>>({})
  const [officeNetByOffice, setOfficeNetByOffice] = useState<Record<string, number>>({})

  const canViewFinancials = hasPermission('can_view_dashboard_financials')

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
      const res = await fetch('/api/dashboard/transactions')
      if (!res.ok) throw new Error('Failed to fetch transaction data')
      const data = await res.json()
      setAllTransactions(data.transactions || [])
      setAllAgentRows(data.agentRows || [])
      const leaseNames = (data.processingFeeTypes || [])
        .filter((t: any) => t.is_lease)
        .map((t: any) => t.name)
      setLeaseTypes(leaseNames)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const calculateMetrics = () => {
    const { start, end, isFuture } = getDateRange(dateRange)
    let volume = 0, units = 0, agentNet = 0, officeNet = 0

    const volByType: Record<string, number> = {}
    const volTeam: Record<string, number> = {}
    const volOffice: Record<string, number> = {}
    const unitTeam: Record<string, number> = {}
    const unitOffice: Record<string, number> = {}
    const agentTeam: Record<string, number> = {}
    const agentOffice: Record<string, number> = {}
    const officeTeam: Record<string, number> = {}
    const officeOffice: Record<string, number> = {}

    const agentRowsByTxn: Record<string, any[]> = {}
    allAgentRows.forEach(row => {
      if (!agentRowsByTxn[row.transaction_id]) agentRowsByTxn[row.transaction_id] = []
      agentRowsByTxn[row.transaction_id].push(row)
    })

    allTransactions.forEach(t => {
      const isLease =
        leaseTypes.some(lt => t.transaction_type?.toLowerCase().includes(lt.toLowerCase())) ||
        t.transaction_type?.toLowerCase().includes('tenant') ||
        t.transaction_type?.toLowerCase().includes('landlord') ||
        t.transaction_type?.toLowerCase().includes('lease')
      if (txnFilter === 'sales' && isLease) return
      if (txnFilter === 'leases' && !isLease) return

      // Use move_in_date for leases, fall back to closing_date
      const dateStr = isLease ? (t.move_in_date || t.closing_date) : t.closing_date
      if (!dateStr) return
      const txnDate = new Date(dateStr)
      if (txnDate < start || txnDate > end) return

      // For leases: count if move_in_date is in the past (within range)
      // For sales: require closed status
      if (isLease) {
        // Lease counts if move_in_date is in the past
        if (txnDate > new Date()) return
      } else {
        // Sales require closed status (unless looking at future projections)
        if (!isFuture && t.status !== 'closed') return
        if (isFuture && t.status === 'cancelled') return
      }

      units++
      if (t.office_net) officeNet += parseFloat(t.office_net)

      const txnType = t.transaction_type || ''
      let typeCategory: string | null = null
      
      if (['buyer_v2', 'nc_buyer_v2', 'land_buyer_v2', 'commercial_buyer_v2'].includes(txnType)) {
        typeCategory = 'Buyers'
      } else if (['tenant_apt_v2', 'tenant_non_apt_v2', 'tenant_simplyhome_v2', 'tenant_commercial_v2'].includes(txnType)) {
        typeCategory = 'Tenants'
      } else if (['seller_v2', 'land_seller_v2'].includes(txnType)) {
        typeCategory = 'Sellers'
      } else if (txnType === 'landlord_v2') {
        typeCategory = 'Landlords'
      } else if (txnType === 'referred_out_v2') {
        typeCategory = 'Referred Out'
      }

      const office = t.office_location || 'Unknown'

      const txnAgentRows = agentRowsByTxn[t.id] || []
      
      // Sum sales_volume from agent rows
      let txnVolume = 0
      txnAgentRows.forEach(a => {
        txnVolume += parseFloat(a.sales_volume || 0)
      })
      volume += txnVolume
      
      if (typeCategory) {
        volByType[typeCategory] = (volByType[typeCategory] || 0) + txnVolume
      }
      
      txnAgentRows.forEach(a => {
        const aNet = parseFloat(a.agent_net || 0)
        agentNet += aNet
        const officeNetShare = parseFloat(t.office_net || 0) / txnAgentRows.length
        const volumeShare = parseFloat(a.sales_volume || 0)

        if (a.team_name) {
          // Agent is on a team - bucket by team (gold)
          unitTeam[a.team_name] = (unitTeam[a.team_name] || 0) + 1
          agentTeam[a.team_name] = (agentTeam[a.team_name] || 0) + aNet
          officeTeam[a.team_name] = (officeTeam[a.team_name] || 0) + officeNetShare
          volTeam[a.team_name] = (volTeam[a.team_name] || 0) + volumeShare
        } else {
          // Agent not on a team - bucket by office (gray)
          unitOffice[office] = (unitOffice[office] || 0) + 1
          agentOffice[office] = (agentOffice[office] || 0) + aNet
          officeOffice[office] = (officeOffice[office] || 0) + officeNetShare
          volOffice[office] = (volOffice[office] || 0) + volumeShare
        }
      })
    })

    setMetrics({ volume, units, agentNet, officeNet })
    setVolumeByType(volByType)
    setVolumeByTeam(volTeam)
    setVolumeByOffice(volOffice)
    setUnitsByTeam(unitTeam)
    setUnitsByOffice(unitOffice)
    setAgentNetByTeam(agentTeam)
    setAgentNetByOffice(agentOffice)
    setOfficeNetByTeam(officeTeam)
    setOfficeNetByOffice(officeOffice)
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

  // Build donut segments
  const buildTeamOfficeSegments = (
    teamData: Record<string, number>,
    officeData: Record<string, number>
  ): DonutSegment[] => {
    const segments: DonutSegment[] = []
    // Teams in gold
    const teamNames = Object.keys(teamData).sort()
    teamNames.forEach((name, i) => {
      segments.push({ label: name, value: teamData[name], color: GOLD_COLORS[i % GOLD_COLORS.length] })
    })
    // Offices in gray (with " Office" suffix)
    const officeNames = Object.keys(officeData).filter(k => k !== 'Unknown').sort()
    officeNames.forEach((name, i) => {
      segments.push({ label: `${name} Office`, value: officeData[name], color: GRAY_COLORS[i % GRAY_COLORS.length] })
    })
    return segments.filter(s => s.value > 0)
  }

  // Volume segments by transaction type category
  const volumeSegments: DonutSegment[] = [
    { label: 'Buyers', value: volumeByType['Buyers'] || 0, color: GOLD_COLORS[0] },
    { label: 'Sellers', value: volumeByType['Sellers'] || 0, color: GOLD_COLORS[1] },
    { label: 'Tenants', value: volumeByType['Tenants'] || 0, color: GRAY_COLORS[0] },
    { label: 'Landlords', value: volumeByType['Landlords'] || 0, color: GRAY_COLORS[1] },
    { label: 'Referred Out', value: volumeByType['Referred Out'] || 0, color: GRAY_COLORS[2] },
  ].filter(s => s.value > 0)

  const unitsSegments = buildTeamOfficeSegments(unitsByTeam, unitsByOffice)
  const agentNetSegments = buildTeamOfficeSegments(agentNetByTeam, agentNetByOffice)
  const officeNetSegments = buildTeamOfficeSegments(officeNetByTeam, officeNetByOffice)

  const rangeInfo = getDateRange(dateRange)

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <h1 className="page-title mb-6">DASHBOARD</h1>

      <div className="container-card mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
            {rangeInfo.label}
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="select-luxury w-auto text-xs"
              value={txnFilter}
              onChange={e => setTxnFilter(e.target.value as TxnFilter)}
            >
              <option value="all">All Transactions</option>
              <option value="sales">Sales Only</option>
              <option value="leases">Leases Only</option>
            </select>
            <select
              className="select-luxury w-auto text-xs"
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRange)}
            >
              {DATE_RANGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Donut charts grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="inner-card">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp size={14} className="text-luxury-accent" />
              <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Sales Volume</span>
            </div>
            <MultiSegmentDonut segments={volumeSegments} centerValue={formatCurrency(metrics.volume)} centerLabel="Total" formatValue={formatCurrency} />
          </div>

          <div className="inner-card">
            <div className="flex items-center gap-1.5 mb-3">
              <Hash size={14} className="text-luxury-accent" />
              <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Units Closed</span>
            </div>
            <MultiSegmentDonut segments={unitsSegments} centerValue={metrics.units.toString()} centerLabel="Units" />
          </div>

          {canViewFinancials && (
            <div className="inner-card">
              <div className="flex items-center gap-1.5 mb-3">
                <DollarSign size={14} className="text-luxury-accent" />
                <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Agent Net</span>
              </div>
              <MultiSegmentDonut segments={agentNetSegments} centerValue={formatCurrency(metrics.agentNet)} centerLabel="Total" formatValue={formatCurrency} />
            </div>
          )}

          {canViewFinancials && (
            <div className="inner-card">
              <div className="flex items-center gap-1.5 mb-3">
                <DollarSign size={14} className="text-luxury-accent" />
                <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Office Net</span>
              </div>
              <MultiSegmentDonut segments={officeNetSegments} centerValue={formatCurrency(metrics.officeNet)} centerLabel="Total" formatValue={formatCurrency} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Needs Attention
            </h2>
            <div className="space-y-3">
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Compliance Requested</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    0
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  No transactions awaiting compliance review
                </p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Approved - CDA Needed</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    0
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions ready for CDA</p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Eligible for Payout</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    0
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions eligible for payout</p>
              </div>
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">
                    Broker Approval Pending
                  </p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    0
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">No CDAs awaiting broker approval</p>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Overview
            </h2>
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
                <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                  0
                </span>
              </div>
              <p className="text-xs text-luxury-gray-3 mb-2">No new contact submissions</p>
              <Link
                href="/admin/contact-submissions"
                className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
              >
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
                  {recentProspects.map(prospect => (
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