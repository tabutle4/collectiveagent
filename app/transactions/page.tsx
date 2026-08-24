'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Download } from 'lucide-react'
import StatusBadge from '@/components/transactions/StatusBadge'
import NewTransactionModal from '@/components/transactions/NewTransactionModal'
import { TransactionStatus } from '@/lib/transactions/types'
import { STATUS_GROUPS } from '@/lib/transactions/constants'
import { getTransactionTypeLabel } from '@/lib/transactions/transactionTypes'
import {
  fundingFilterState,
  FUNDING_FILTER_LABELS,
  type FundingState,
} from '@/lib/transactions/funding'

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
  const [quarterFilter, setQuarterFilter] = useState('all')
  const [tia, setTia] = useState<any[]>([])
  // Admin-only: the deal's checks, for the funding filter. Agents never
  // receive this key from the API.
  const [checks, setChecks] = useState<any[]>([])
  // Admin-only companion to `checks`: two booleans per deal saying whether an
  // agent on it was paid, and whether it carries payout data at all. This is
  // what lets a deal title paid directly read as funded instead of "waiting".
  const [fundingAgents, setFundingAgents] = useState<any[]>([])
  const [fundingFilter, setFundingFilter] = useState<FundingState | 'all'>('all')
  const [canViewAll, setCanViewAll] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Cap progress for the agent strip - only shown when the plan has a cap.
  const [capInfo, setCapInfo] = useState<any>(null)

  // Deep link: /transactions?open=<id> lands on this list with that deal's row
  // already expanded. Agents read a deal by expanding its row here rather than
  // on a detail page, so anything elsewhere in the app that points at one deal
  // has to arrive this way. Read from window.location rather than
  // useSearchParams to avoid the Suspense boundary that would require.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const open = search.get('open')
    if (open) setExpandedId(open)
    // Deep link: /transactions?funding=waiting|partial|matched|mismatch
    // lands with that funding chip active (admin only — the chip row itself
    // only renders for canViewAll).
    const fp = search.get('funding')
    if (fp && ['waiting', 'partial', 'matched', 'mismatch'].includes(fp)) {
      setFundingFilter(fp as FundingState)
    }
  }, [])
  // The rows only exist once the deals have loaded, so bring the deep-linked
  // one into view then. Without this the row is expanded but can be far down a
  // long list, which reads as the link having done nothing.
  //
  // expandedId is read here but deliberately kept OUT of the dependency list.
  // Adding it would scroll the page every time someone expands a row by hand,
  // which is jarring. The cost of leaving it out is small and one-directional:
  // if the deals reload and come back with the same count, a deep link will not
  // re-centre the row. The row is still expanded, just not scrolled to. Do not
  // "fix" this by completing the dependency list.
  useEffect(() => {
    if (!expandedId || !transactions.length) return
    // The table and the card list are the same deals at two breakpoints, and
    // the hidden one still has a node, so scroll to whichever is on screen.
    const candidates = [
      document.getElementById(`txn-${expandedId}`),
      document.getElementById(`txn-m-${expandedId}`),
    ]
    const row = candidates.find(el => el && (el as HTMLElement).offsetParent !== null)
    if (row) row.scrollIntoView({ block: 'center' })
  }, [transactions.length])

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
        setTia(data.tia || [])
        setChecks(data.checks || [])
        setFundingAgents(data.fundingAgents || [])
        setAgents(data.agents || [])
        setPermissions(data.permissions || {})
        setCanViewAll(data.canViewAll || false)

        // Extract unique transaction types
        const types = Array.from(
          new Set((data.transactions || []).map((t: any) => t.transaction_type).filter(Boolean))
        ) as string[]
        setTransactionTypes(types.sort())

        // Agents: load cap progress for the top strip. Only rendered when
        // the plan actually has a cap (New Agent Plan shows progress too).
        if (!data.canViewAll) {
          try {
            const capRes = await fetch('/api/agent/commission-preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_lease: false }),
            })
            if (capRes.ok) setCapInfo(await capRes.json())
          } catch { /* strip works without cap info */ }
        }
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

  const formatTransactionType = (type: string | null) => {
    return getTransactionTypeLabel(type)
  }

  // ── Quarter qualification - the EXACT rules the quarterly report uses ────
  // Leases (type mentions tenant/landlord/lease): counted by move-in date
  // (falling back to closing date), any status except cancelled. Sales:
  // counted by closing date and only when closed.
  const isLeaseTxn = (t: any) => /tenant|landlord|lease/i.test(String(t.transaction_type || ''))
  const qualDate = (t: any) => (isLeaseTxn(t) ? t.move_in_date || t.closing_date : t.closing_date)
  const qualifiesInRange = (t: any, start: string, end: string) => {
    const d = qualDate(t)
    if (!d || d < start || d > end) return false
    return isLeaseTxn(t) ? t.status !== 'cancelled' : t.status === 'closed'
  }
  const quarterRange = (q: string): [string, string] | null => {
    const m = q.match(/^(\d{4})-Q([1-4])$/)
    if (!m) return null
    const y = m[1]
    const starts = ['01-01', '04-01', '07-01', '10-01']
    const ends = ['03-31', '06-30', '09-30', '12-31']
    const i = parseInt(m[2]) - 1
    return [`${y}-${starts[i]}`, `${y}-${ends[i]}`]
  }

  // Agents only see 2026 forward. A deal with no dates at all stays visible
  // only if it was created in 2026 or later. Admin views are unfiltered.
  const visible = useMemo(() => {
    if (canViewAll) return transactions
    return transactions.filter(t => {
      const d = qualDate(t) || t.closing_date || t.move_in_date || t.created_at
      return !d || String(d).slice(0, 10) >= '2026-01-01'
    })
  }, [transactions, canViewAll])

  // Quarter options generated from the years actually present in the data.
  const quarterOptions = useMemo(() => {
    const years = new Set<string>()
    for (const t of visible) {
      const d = qualDate(t)
      if (d) years.add(String(d).slice(0, 4))
    }
    const opts: string[] = []
    Array.from(years).sort().reverse().forEach(y => {
      for (let i = 4; i >= 1; i--) opts.push(`${y}-Q${i}`)
    })
    return opts
  }, [visible])

  // ── Funding filter (admin only) ──────────────────────────────────────────
  // One definition, shared with the dashboard tiles: fundingFilterState()
  // decides both scope and state, so a tile count always matches this list.
  const checksByTxn = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const c of checks) {
      if (!c.transaction_id) continue
      const list = map.get(c.transaction_id) || []
      list.push(c)
      map.set(c.transaction_id, list)
    }
    return map
  }, [checks])

  const agentSummaryByTxn = useMemo(() => {
    const map = new Map<string, { anyPaid: boolean; anyBasis: boolean; btsaTotal: number }>()
    for (const r of fundingAgents) {
      if (!r?.transaction_id) continue
      map.set(r.transaction_id, {
        anyPaid: !!r.any_paid,
        anyBasis: !!r.any_basis,
        // Part of what the deal expects to receive - BTSA rides in on the same
        // check. Omitting it made every BTSA deal read as a mismatch here.
        btsaTotal: parseFloat(String(r.btsa_total ?? 0)) || 0,
      })
    }
    return map
  }, [fundingAgents])

  const fundingByTxn = useMemo(() => {
    const map = new Map<string, FundingState>()
    if (!canViewAll) return map
    for (const t of transactions) {
      // A deal with no agent rows at all gets an explicit all-false summary
      // rather than undefined, so the "no payout data" rule can fire on it.
      const st = fundingFilterState(
        t,
        checksByTxn.get(t.id) || [],
        agentSummaryByTxn.get(t.id) || { anyPaid: false, anyBasis: false, btsaTotal: 0 }
      )
      if (st) map.set(t.id, st)
    }
    return map
  }, [transactions, checksByTxn, agentSummaryByTxn, canViewAll])

  const fundingCounts = useMemo(() => {
    const counts: Record<FundingState, number> = { waiting: 0, partial: 0, matched: 0, mismatch: 0 }
    for (const st of Array.from(fundingByTxn.values())) counts[st]++
    return counts
  }, [fundingByTxn])

  const setFundingFilterAndUrl = (f: FundingState | 'all') => {
    setFundingFilter(f)
    const params = new URLSearchParams(window.location.search)
    if (f === 'all') params.delete('funding')
    else params.set('funding', f)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  const filtered = useMemo(() => {
    let list = [...visible]

    if (canViewAll && fundingFilter !== 'all') {
      list = list.filter(t => fundingByTxn.get(t.id) === fundingFilter)
      if (fundingFilter === 'waiting') {
        // Oldest first: the longest-waiting money at the top.
        list.sort((a, b) =>
          String(a.closing_date || '9999').localeCompare(String(b.closing_date || '9999'))
        )
      }
    }

    if (quarterFilter !== 'all') {
      const range = quarterRange(quarterFilter)
      if (range) list = list.filter(t => qualifiesInRange(t, range[0], range[1]))
    }

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
  }, [visible, quarterFilter, searchQuery, statusFilter, agentFilter, typeFilter, agents, canViewAll, fundingFilter, fundingByTxn])

  const statusCounts = useMemo(
    () => ({
      all: visible.length,
      active: visible.filter(t => STATUS_GROUPS.active.includes(t.status)).length,
      compliance: visible.filter(t => STATUS_GROUPS.compliance.includes(t.status)).length,
      processing: visible.filter(t => STATUS_GROUPS.processing.includes(t.status)).length,
      complete: visible.filter(t => STATUS_GROUPS.complete.includes(t.status)).length,
    }),
    [visible]
  )

  // My commission rows by transaction (agents: only their rows come back).
  const myTiaByTxn = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of tia) {
      const list = map.get(r.transaction_id) || []
      list.push(r)
      map.set(r.transaction_id, list)
    }
    return map
  }, [tia])

  // Totals for the current filtered set, counted the way the quarterly
  // report counts: production roles' commission rows, units defaulting to 1.
  const totals = useMemo(() => {
    const ids = new Set(filtered.map(t => t.id))
    const prodRoles = ['primary_agent', 'listing_agent']
    let units = 0
    let volume = 0
    let myNet = 0
    for (const r of tia) {
      if (!ids.has(r.transaction_id)) continue
      if (canViewAll && agentFilter !== 'all' && r.agent_id !== agentFilter) continue
      if (prodRoles.includes(r.agent_role)) {
        units += r.units == null ? 1 : parseFloat(String(r.units)) || 0
        volume += parseFloat(String(r.sales_volume ?? 0)) || 0
      }
      myNet += parseFloat(String(r.agent_net ?? 0)) || 0
    }
    return {
      deals: filtered.length,
      units,
      volume: Math.round(volume * 100) / 100,
      myNet: Math.round(myNet * 100) / 100,
    }
  }, [filtered, tia, canViewAll, agentFilter])

  const formatVolume = (t: any) => {
    const amount = t.sales_volume
    if (!amount) return ''
    return `$${parseFloat(amount).toLocaleString()}`
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const fmtMoney = (n: any) => {
    const v = parseFloat(String(n ?? 0)) || 0
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const quarterLabel = (q: string) => {
    const m = q.match(/^(\d{4})-Q([1-4])$/)
    return m ? `Q${m[2]} ${m[1]}` : q
  }

  // Download the current filtered view as a CSV report, totals included.
  const downloadReport = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [
      'Property', ...(canViewAll ? ['Agent'] : []), 'Type', 'Client', 'Status', 'Compliance',
      'Closing Date', 'Move In Date', 'Sales Volume', ...(canViewAll ? [] : ['My Net', 'Payment Status']),
    ]
    const lines = [header.map(esc).join(',')]
    for (const t of filtered) {
      const mine = (myTiaByTxn.get(t.id) || [])
      const myNetRow = mine.reduce((s, r) => s + (parseFloat(String(r.agent_net ?? 0)) || 0), 0)
      const payStatus = mine.map(r => r.payment_status).filter(Boolean).join(' / ')
      lines.push([
        t.property_address || '',
        ...(canViewAll ? [getAgentName(t.submitted_by)] : []),
        formatTransactionType(t.transaction_type),
        t.client_name || '',
        t.status || '',
        t.compliance_status || '',
        t.closing_date || '',
        t.move_in_date || '',
        t.sales_volume || '',
        ...(canViewAll ? [] : [myNetRow ? myNetRow.toFixed(2) : '', payStatus]),
      ].map(esc).join(','))
    }
    lines.push('')
    lines.push([`Totals (${quarterFilter === 'all' ? 'all time' : quarterLabel(quarterFilter)})`,
      `Deals: ${totals.deals}`, `Units: ${totals.units}`, `Volume: ${totals.volume.toFixed(2)}`,
      ...(canViewAll ? [] : [`My Net: ${totals.myNet.toFixed(2)}`])].map(esc).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `transactions_report_${quarterFilter === 'all' ? 'all_time' : quarterFilter}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const gt0 = (v: any) => (parseFloat(String(v ?? 0)) || 0) > 0

  // Expanded row panel: the deal's key dates + compliance, and the money on
  // the commission rows (agents see only their own rows; admins see all).
  const renderExpanded = (t: any) => {
    const rows = myTiaByTxn.get(t.id) || []
    return (
      <div className="bg-luxury-light rounded p-4 text-xs text-luxury-gray-2 space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Compliance: <span className="font-medium">{t.compliance_status?.replace(/_/g, ' ') || 'not requested'}</span>
          </span>
          {t.acceptance_date && <span>Accepted: {formatDate(t.acceptance_date)}</span>}
          {t.closing_date && <span>Closing: {formatDate(t.closing_date)}</span>}
          {t.move_in_date && <span>Move-in: {formatDate(t.move_in_date)}</span>}
          {gt0(t.sales_price) && <span>Sales price: {fmtMoney(t.sales_price)}</span>}
          {gt0(t.monthly_rent) && <span>Monthly rent: {fmtMoney(t.monthly_rent)}</span>}
          {t.lease_term && <span>Term: {t.lease_term} months</span>}
          {gt0(t.sales_volume) && <span>Volume: {fmtMoney(t.sales_volume)}</span>}
        </div>
        {rows.length === 0 ? (
          <p className="text-luxury-gray-3">No commission rows {canViewAll ? 'on this deal yet.' : 'for you on this deal yet.'}</p>
        ) : (
          rows.map((r: any) => (
            <div key={r.id} className="border-t border-luxury-gray-5 pt-2">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-luxury-gray-1">
                  {canViewAll && getAgentName(r.agent_id) ? `${getAgentName(r.agent_id)} · ` : ''}
                  {String(r.agent_role || '').replace(/_/g, ' ')}
                  {r.side ? ` · ${r.side}` : ''}
                </p>
                <span className={`px-2 py-0.5 rounded ${r.payment_status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-luxury-light text-luxury-gray-3 border border-luxury-gray-5'}`}>
                  {r.payment_status === 'paid' ? `Paid${r.payment_date ? ` ${formatDate(r.payment_date)}` : ''}` : (r.payment_status || 'pending')}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                <span>Gross: {fmtMoney(r.agent_gross)}</span>
                <span>Brokerage split: {fmtMoney(r.brokerage_split)}</span>
                {gt0(r.processing_fee) && <span>Processing fee: -{fmtMoney(r.processing_fee)}</span>}
                {gt0(r.coaching_fee) && <span>Coaching fee: -{fmtMoney(r.coaching_fee)}</span>}
                {gt0(r.other_fees) && <span>Other fees: -{fmtMoney(r.other_fees)}</span>}
                {gt0(r.btsa_amount) && <span>BTSA: {fmtMoney(r.btsa_amount)}</span>}
                {gt0(r.rebate_amount) && <span>Rebate: -{fmtMoney(r.rebate_amount)}</span>}
                <span className="font-semibold text-luxury-gray-1">Net: {fmtMoney(r.agent_net)}</span>
              </div>
            </div>
          ))
        )}
        {canViewAll && (
          <div>
            <a
              href={`/admin/transactions/${t.id}${fundingFilter !== 'all' ? '?tab=check_payouts' : ''}`}
              className="underline hover:text-luxury-gray-1"
              onClick={e => e.stopPropagation()}
            >
              Open full deal
            </a>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">
          {canViewAll ? 'TRANSACTIONS' : 'MY TRANSACTIONS'} ({filtered.length})
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadReport}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <Download size={14} /> Download Report
          </button>
          {/* Creating a deal is office work: agents file a compliance request
              and the office creates the transaction from it. The POST route
              already enforces can_create_transactions, so gate the button on
              the same permission rather than on role, which keeps per-user
              overrides working. */}
          {permissions.can_create_transactions && (
            <button
              onClick={() => setShowNewModal(true)}
              className="btn btn-primary flex items-center gap-1.5"
            >
              <Plus size={14} /> New Transaction
            </button>
          )}
        </div>
      </div>

      {!canViewAll && (
        <div className={`grid grid-cols-2 ${Number(capInfo?.cap_amount) > 0 || capInfo?.new_agent_deals != null ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 mb-6`}>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Units{quarterFilter !== 'all' ? ` · ${quarterLabel(quarterFilter)}` : ''}</p>
            <p className="text-lg font-semibold text-luxury-gray-1">{totals.units}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Volume{quarterFilter !== 'all' ? ` · ${quarterLabel(quarterFilter)}` : ''}</p>
            <p className="text-lg font-semibold text-luxury-gray-1">{fmtMoney(totals.volume)}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">My Net{quarterFilter !== 'all' ? ` · ${quarterLabel(quarterFilter)}` : ''}</p>
            <p className="text-lg font-semibold text-luxury-gray-1">{fmtMoney(totals.myNet)}</p>
          </div>
          {Number(capInfo?.cap_amount) > 0 && (
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Cap Progress</p>
              <p className="text-lg font-semibold text-luxury-gray-1">
                {capInfo.capped ? 'CAPPED' : `${fmtMoney(capInfo.ytd_brokerage_split)} of ${fmtMoney(capInfo.cap_amount)}`}
              </p>
            </div>
          )}
          {capInfo?.new_agent_deals != null && (
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">New Agent Plan Progress</p>
              <p className="text-lg font-semibold text-luxury-gray-1">
                {capInfo.new_agent_deals} of {capInfo.new_agent_required || 5} qualifying sales
              </p>
              {capInfo.new_agent_deals >= (capInfo.new_agent_required || 5) && (
                <p className="text-xs text-luxury-gray-3">Time to pick Cap or No Cap</p>
              )}
            </div>
          )}
        </div>
      )}

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
              value={quarterFilter}
              onChange={e => setQuarterFilter(e.target.value)}
              className="select-luxury text-xs flex-1 min-w-[140px]"
            >
              <option value="all">All Time</option>
              {quarterOptions.map(q => (
                <option key={q} value={q}>
                  {quarterLabel(q)} (deals that count)
                </option>
              ))}
            </select>

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
                    {formatTransactionType(t)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Funding chips — canViewAll ONLY. Agents never see these chips
              or the Expected/Received columns below. */}
          {canViewAll && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-luxury-gray-3">Funding</span>
                {(['waiting', 'partial', 'matched', 'mismatch'] as FundingState[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFundingFilterAndUrl(fundingFilter === f ? 'all' : f)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      fundingFilter === f
                        ? 'bg-luxury-accent/10 border-luxury-accent text-luxury-accent font-medium'
                        : 'border-luxury-gray-5 text-luxury-gray-3 hover:text-luxury-gray-1'
                    }`}
                  >
                    {FUNDING_FILTER_LABELS[f]} · {fundingCounts[f]}
                  </button>
                ))}
              </div>
              {fundingFilter === 'waiting' && (
                <p className="text-xs text-luxury-gray-3 mt-1.5">
                  Sorted oldest first - the longest-waiting money is at the top.
                </p>
              )}
            </div>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No transactions yet</p>
            <button onClick={() => setShowNewModal(true)} className="btn btn-primary">
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
                    <th className="th-luxury">Sales Volume</th>
                    <th className="th-luxury">Status</th>
                    {canViewAll && <th className="th-luxury">Compliance</th>}
                    {canViewAll && fundingFilter !== 'all' && (
                      <th className="th-luxury text-right">Expected</th>
                    )}
                    {canViewAll && fundingFilter !== 'all' && (
                      <th className="th-luxury text-right">Received</th>
                    )}
                    <th className="th-luxury">Closing Date</th>
                    <th className="th-luxury">Move In Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <Fragment key={t.id}>
                    <tr
                      id={`txn-${t.id}`}
                      className="tr-luxury-clickable"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
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
                        {formatTransactionType(t.transaction_type)}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {t.client_name || ''}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{formatVolume(t)}</td>
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
                      {canViewAll && fundingFilter !== 'all' && (() => {
                        const txnChecks = checksByTxn.get(t.id) || []
                        const expected = parseFloat(String(t.office_gross ?? 0)) || 0
                        const received = txnChecks
                          .filter((c: any) => c.cleared_date)
                          .reduce((s: number, c: any) => s + (parseFloat(String(c.check_amount ?? 0)) || 0), 0)
                        const waitingDays = received === 0 && t.closing_date
                          ? Math.max(0, Math.floor((Date.now() - new Date(t.closing_date).getTime()) / 86400000))
                          : null
                        return (
                          <>
                            <td className="py-3 px-4 text-xs text-luxury-gray-2 text-right">
                              {fmtMoney(expected)}
                            </td>
                            <td className="py-3 px-4 text-xs text-luxury-gray-2 text-right">
                              {fmtMoney(received)}
                              {waitingDays != null && (
                                <span className="text-luxury-gray-3"> · {waitingDays} days</span>
                              )}
                            </td>
                          </>
                        )
                      })()}
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {formatDate(t.closing_date)}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {formatDate(t.move_in_date)}
                      </td>
                    </tr>
                    {expandedId === t.id && (
                      <tr>
                        <td colSpan={canViewAll ? (fundingFilter !== 'all' ? 11 : 9) : 7} className="px-4 pb-3">
                          {renderExpanded(t)}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {filtered.map(t => (
                <div
                  key={t.id}
                  id={`txn-m-${t.id}`}
                  className="inner-card cursor-pointer"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
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
                      {formatTransactionType(t.transaction_type)}
                      {t.client_name ? ` · ${t.client_name}` : ''}
                    </p>
                    {formatVolume(t) && <p>{formatVolume(t)}</p>}
                    {canViewAll &&
                      t.compliance_status &&
                      t.compliance_status !== 'not_requested' && (
                        <p>{t.compliance_status.replace(/_/g, ' ')}</p>
                      )}
                  </div>
                  {expandedId === t.id && <div className="mt-3">{renderExpanded(t)}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showNewModal && (
        <NewTransactionModal
          onClose={() => setShowNewModal(false)}
          canAssignAgent={canViewAll}
          agents={agents}
        />
      )}
    </div>
  )
}
