'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Trash2, Save, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/context/AuthContext'

// Types

interface AgentRow { agent_id: string; name: string; amount: number }
interface ExternalRow { name: string; amount: number }

interface PayoutRow {
  check_id: string
  transaction_id: string | null
  address: string
  crc_amount: number
  check_amount: number
  agents: AgentRow[]
  externals: ExternalRow[]
  standalone_agent: string | null
  cleared_date: string | null
  received_date: string | null
  compliance_status: string
  crc_transferred: boolean
  agents_paid: boolean
  status: string
  notes: string | null
}

interface Expense { id: string; description: string; amount: number | null }

// Helpers

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'

function complianceLabel(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    complete:      { label: 'complete',      cls: 'text-green-700' },
    approved:      { label: 'complete',      cls: 'text-green-700' },
    not_submitted: { label: 'not requested', cls: 'text-luxury-gray-3' },
    in_review:     { label: 'in review',     cls: 'text-yellow-600' },
    incomplete:    { label: 'incomplete',    cls: 'text-red-500' },
  }
  return map[status] || { label: status, cls: 'text-luxury-gray-3' }
}

function agentNames(row: PayoutRow): string {
  const names = row.agents.map(a => a.name.split(' ')[0].toLowerCase())
  const ext = row.externals.map(e => e.name.split(' ')[0].toLowerCase())
  if (names.length || ext.length) return [...names, ...ext].join(' and ')
  if (row.standalone_agent) return row.standalone_agent
  if (row.notes) {
    const match = row.notes.match(/Agent\(s\):\s*([^;]+)/i)
    if (match) return match[1].trim()
  }
  return ''
}

function cleanNotes(notes: string | null): string {
  if (!notes) return ''
  return notes
    .replace(/Agent\(s\):[^;]*;?/gi, '')
    .replace(/Imported from Monday Meeting spreadsheet/gi, '')
    .replace(/;\s*$/g, '')
    .trim()
}

function agentTotal(row: PayoutRow): number {
  return row.agents.reduce((s, a) => s + (a.amount || 0), 0) +
    row.externals.reduce((s, e) => s + (e.amount || 0), 0)
}

// Mobile card — shows all data, stacked layout

function PayoutCard({ row, dateKey }: { row: PayoutRow; dateKey: 'cleared_date' | 'received_date' }) {
  const { label, cls } = complianceLabel(row.compliance_status)
  const dateVal = dateKey === 'cleared_date' ? row.cleared_date : (row.cleared_date || row.received_date)
  const total = agentTotal(row)
  const notes = cleanNotes(row.notes)

  return (
    <div className="container-card space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {row.transaction_id ? (
            <Link
              href={`/admin/transactions/${row.transaction_id}`}
              className="text-xs font-semibold text-luxury-gray-1 hover:text-luxury-accent flex items-start gap-1"
            >
              <span>{row.address}</span>
              <ExternalLink size={10} className="opacity-40 flex-shrink-0 mt-0.5" />
            </Link>
          ) : (
            <span className="text-xs font-semibold text-luxury-gray-1">{row.address}</span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-luxury-gray-1">{total > 0 ? fmt(total) : '—'}</p>
          {row.crc_amount > 0 && (
            <p className="text-xs text-luxury-gray-3">CRC: {fmt(row.crc_amount)}</p>
          )}
        </div>
      </div>

      {(row.agents.length > 0 || row.externals.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {row.agents.map((a, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-xs text-luxury-gray-3">{a.name.split(' ')[0]}</span>
              <span className="text-xs font-medium text-luxury-gray-1">{fmt(a.amount)}</span>
            </div>
          ))}
          {row.externals.map((e, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-xs text-luxury-gray-3">{e.name.split(' ')[0]}</span>
              <span className="text-xs font-medium text-luxury-gray-1">{fmt(e.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {dateVal && (
          <span className="text-xs text-luxury-gray-3">{fmtDate(dateVal)}</span>
        )}
        <span className={`text-xs ${cls}`}>{label}</span>
        <span className={`text-xs font-medium ${row.crc_transferred ? 'text-green-700' : 'text-red-500'}`}>
          {row.crc_transferred ? 'transferred' : 'not transferred'}
        </span>
      </div>

      {notes && (
        <p className="text-xs text-luxury-gray-3">{notes}</p>
      )}
    </div>
  )
}

// Desktop table row — all columns visible, table scrolls horizontally if needed

function PayoutTableRow({ row, dateKey }: { row: PayoutRow; dateKey: 'cleared_date' | 'received_date' }) {
  const a1 = row.agents[0]
  const a2 = row.agents[1]
  const a3 = row.agents[2]
  const ext = row.externals[0]
  const { label, cls } = complianceLabel(row.compliance_status)
  const dateVal = dateKey === 'cleared_date' ? row.cleared_date : (row.cleared_date || row.received_date)

  return (
    <tr className="border-b border-luxury-gray-5/30 hover:bg-luxury-gray-6/30">
      <td className="py-2 px-2 text-xs text-luxury-gray-1 font-medium max-w-[180px]">
        {row.transaction_id ? (
          <Link href={`/admin/transactions/${row.transaction_id}`} className="hover:text-luxury-accent flex items-center gap-1">
            <span className="truncate block">{row.address}</span>
            <ExternalLink size={10} className="opacity-40 flex-shrink-0" />
          </Link>
        ) : <span className="truncate block">{row.address}</span>}
      </td>
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{row.crc_amount > 0 ? fmt(row.crc_amount) : '—'}</td>
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{a1 ? fmt(a1.amount) : '—'}</td>
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{a2 ? fmt(a2.amount) : '—'}</td>
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{a3 ? fmt(a3.amount) : '—'}</td>
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{ext ? fmt(ext.amount) : '—'}</td>
      <td className="py-2 px-2 text-xs text-right font-semibold text-luxury-gray-1 whitespace-nowrap">{agentTotal(row) > 0 ? fmt(agentTotal(row)) : '—'}</td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 max-w-[120px]">
        <span className="truncate block">{agentNames(row) || '—'}</span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 whitespace-nowrap">{fmtDate(dateVal)}</td>
      <td className={`py-2 px-2 text-xs whitespace-nowrap ${cls}`}>{label}</td>
      <td className="py-2 px-2 text-xs whitespace-nowrap">
        <span className={`font-medium ${row.crc_transferred ? 'text-green-700' : 'text-red-500'}`}>
          {row.crc_transferred ? 'yes' : 'no'}
        </span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 max-w-[130px]">
        <span className="truncate block">{cleanNotes(row.notes) || '—'}</span>
      </td>
    </tr>
  )
}

// Section component — cards on mobile, scrollable table on desktop

type SortKey = 'date' | 'compliance' | null
type SortDir = 'asc' | 'desc'

function PayoutsTable({ rows, title, collapsed, onToggle, dateLabel, dateKey }: {
  rows: PayoutRow[]; title: string; collapsed: boolean; onToggle: () => void
  dateLabel: string; dateKey: 'cleared_date' | 'received_date'
}) {
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0
    let av = '', bv = ''
    if (sortKey === 'date') { av = a.cleared_date || a.received_date || ''; bv = b.cleared_date || b.received_date || '' }
    else if (sortKey === 'compliance') { av = a.compliance_status || ''; bv = b.compliance_status || '' }
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const displayRows = sortKey ? sortedRows : rows
  const crcTotal  = rows.reduce((s, r) => s + r.crc_amount, 0)
  const agentTot  = rows.reduce((s, r) => s + agentTotal(r), 0)
  const a1Tot     = rows.reduce((s, r) => s + (r.agents[0]?.amount || 0), 0)
  const a2Tot     = rows.reduce((s, r) => s + (r.agents[1]?.amount || 0), 0)
  const a3Tot     = rows.reduce((s, r) => s + (r.agents[2]?.amount || 0), 0)
  const extTot    = rows.reduce((s, r) => s + (r.externals[0]?.amount || 0), 0)

  return (
    <div className="container-card mb-5">
      <button className="w-full flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{title}</h2>
          <span className="text-xs text-luxury-gray-3">({rows.length})</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-luxury-gray-2">Agents: <span className="font-semibold text-luxury-gray-1">{fmt(agentTot)}</span></span>
          <span className="text-xs text-luxury-gray-2">CRC: <span className="font-semibold text-luxury-gray-1">{fmt(crcTotal)}</span></span>
          {collapsed ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronUp size={14} className="text-luxury-gray-3" />}
        </div>
      </button>

      {!collapsed && (
        <div className="mt-4">

          {/* Mobile and tablet: card layout (below lg) */}
          <div className="lg:hidden space-y-2">
            {displayRows.length === 0 ? (
              <p className="text-xs text-luxury-gray-3 text-center py-4">No records</p>
            ) : (
              displayRows.map(row => <PayoutCard key={row.check_id} row={row} dateKey={dateKey} />)
            )}
            {rows.length > 0 && (
              <div className="inner-card flex items-center justify-between py-2 mt-1">
                <span className="text-xs font-semibold text-luxury-gray-1">Total ({rows.length})</span>
                <span className="text-xs font-semibold text-luxury-accent">{fmt(agentTot)}</span>
              </div>
            )}
          </div>

          {/* Desktop: full scrollable table (lg+) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full" style={{ minWidth: '960px' }}>
              <thead>
                <tr className="border-b border-luxury-gray-5/50">
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Address</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">CRC</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Agent 1</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Agent 2</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Agent 3</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Other</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Total</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Agents</th>
                  <th
                    className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left cursor-pointer select-none hover:text-luxury-gray-1 whitespace-nowrap"
                    onClick={() => toggleSort('date')}
                  >
                    {dateLabel} {sortKey === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th
                    className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left cursor-pointer select-none hover:text-luxury-gray-1"
                    onClick={() => toggleSort('compliance')}
                  >
                    Compliance {sortKey === 'compliance' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Transferred</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={12} className="py-6 text-center text-xs text-luxury-gray-3">No records</td></tr>
                ) : (
                  displayRows.map(row => <PayoutTableRow key={row.check_id} row={row} dateKey={dateKey} />)
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-luxury-gray-5/50 bg-luxury-gray-6/30">
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-luxury-gray-1">Total</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(crcTotal)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(a1Tot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(a2Tot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{a3Tot > 0 ? fmt(a3Tot) : '—'}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(extTot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(agentTot)}</td>
                    <td colSpan={5} className="pt-2 pb-1 px-2 text-xs text-luxury-gray-3">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

        </div>
      )}
    </div>
  )
}

// Main

export default function PayoutsReportPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paidCollapsed, setPaidCollapsed] = useState(false)
  const [holdCollapsed, setHoldCollapsed] = useState(false)
  const [expCollapsed, setExpCollapsed] = useState(false)

  const [bankBalance, setBankBalance] = useState('')
  const [holds, setHolds] = useState('')
  const [savingBalances, setSavingBalances] = useState(false)
  const [autoPayloadTotal, setAutoPayloadTotal] = useState(0)

  const [newDesc, setNewDesc] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const [addingExp, setAddingExp] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/payouts-report')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Error ${res.status}`)
      }
      const json = await res.json()
      setRows(json.rows || [])
      setExpenses(json.expenses || [])
      setBankBalance(json.settings?.bank_balance?.toString() || '')
      setHolds(json.settings?.funds_on_hold?.toString() || '')
      setAutoPayloadTotal(json.pending_payload_total || 0)
    } catch (err: any) {
      setError(err.message || 'Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  const paidRows = rows.filter(r => r.crc_transferred && !r.agents_paid)
  const holdRows = rows.filter(r => !r.crc_transferred && !r.agents_paid)

  const paidAgentTotal  = paidRows.reduce((s, r) => s + agentTotal(r), 0)
  const holdAgentTotal  = holdRows.reduce((s, r) => s + agentTotal(r), 0)
  const expensesTotal   = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const grandTotal      = paidAgentTotal + holdAgentTotal + expensesTotal

  const bank                  = parseFloat(bankBalance) || 0
  const holdsAmt              = parseFloat(holds) || 0
  const payloadAmt            = autoPayloadTotal
  const difference            = (bank + holdsAmt + payloadAmt) - grandTotal
  const availableAfterPaidOut = bank - (paidAgentTotal + expensesTotal)

  const saveBalances = async () => {
    setSavingBalances(true)
    await fetch('/api/admin/payouts-report', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_balance: bankBalance, funds_on_hold: holds }),
    })
    setSavingBalances(false)
  }

  const addExpense = async () => {
    if (!newDesc.trim()) return
    setAddingExp(true)
    const res = await fetch('/api/admin/payout-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc, amount: newAmt || null }),
    })
    if (res.ok) {
      const { expense } = await res.json()
      setExpenses(prev => [expense, ...prev])
      setNewDesc('')
      setNewAmt('')
    }
    setAddingExp(false)
  }

  const deleteExpense = async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
    await fetch('/api/admin/payout-expenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw size={18} className="animate-spin text-luxury-gray-3" />
    </div>
  )

  if (error) return (
    <div className="container-card max-w-md mx-auto mt-12 text-center py-8">
      <p className="text-sm text-red-500 mb-4">{error}</p>
      <button onClick={load} className="btn btn-secondary text-xs">Try Again</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">PAYOUTS REPORT</h1>
        <button onClick={load} className="btn btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="flex flex-col">

        <div className="order-2 lg:order-1">
          <PayoutsTable rows={paidRows} title="Paid Most Recently" collapsed={paidCollapsed} onToggle={() => setPaidCollapsed(v => !v)} dateLabel="Paid" dateKey="cleared_date" />
          <PayoutsTable rows={holdRows} title="On Hold" collapsed={holdCollapsed} onToggle={() => setHoldCollapsed(v => !v)} dateLabel="Cleared" dateKey="cleared_date" />
        </div>

        {/* Also In Payouts */}
        <div className="order-3 lg:order-2">
          <div className="container-card mb-5">
        <button className="w-full flex items-center justify-between" onClick={() => setExpCollapsed(v => !v)}>
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Also In Payouts</h2>
            <span className="text-xs text-luxury-gray-3">({expenses.length})</span>
          </div>
          <div className="flex items-center gap-4">
            {expensesTotal > 0 && (
              <span className="text-xs text-luxury-gray-2">Total: <span className="font-semibold text-luxury-gray-1">{fmt(expensesTotal)}</span></span>
            )}
            {expCollapsed ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronUp size={14} className="text-luxury-gray-3" />}
          </div>
        </button>

        {!expCollapsed && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Description"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpense()}
                className="input-luxury text-xs flex-1"
              />
              <input
                type="number"
                placeholder="Amount"
                value={newAmt}
                onChange={e => setNewAmt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpense()}
                className="input-luxury text-xs w-28"
              />
              <button
                onClick={addExpense}
                disabled={addingExp || !newDesc.trim()}
                className="btn btn-primary text-xs px-3 flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {expenses.length === 0 ? (
              <p className="text-xs text-luxury-gray-3 text-center py-4">No items. Add expenses above.</p>
            ) : (
              <div className="space-y-1">
                {expenses.map(exp => (
                  <div key={exp.id} className="inner-card flex items-center justify-between py-2">
                    <span className="text-sm text-luxury-gray-1">{exp.description}</span>
                    <div className="flex items-center gap-3">
                      {exp.amount != null && (
                        <span className="text-sm font-medium text-luxury-gray-1">{fmt(exp.amount)}</span>
                      )}
                      <button onClick={() => deleteExpense(exp.id)} className="text-luxury-gray-4 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
        </div>

        {/* Bottom Line — first on mobile, last on desktop */}
        <div className="order-1 lg:order-3 mb-5">
        <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Bottom Line</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="field-label">Bank balance (payouts acct)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input type="number" step="0.01" value={bankBalance} onChange={e => setBankBalance(e.target.value)} className="input-luxury flex-1" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="field-label">Bank holds</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input type="number" step="0.01" value={holds} onChange={e => setHolds(e.target.value)} className="input-luxury flex-1" placeholder="0.00" />
            </div>
          </div>
        </div>
        <div className="inner-card flex items-center justify-between mb-4">
          <div>
            <p className="field-label">Pending Payload</p>
            <p className="text-xs text-luxury-gray-3 mt-0.5">Auto-calculated from transactions</p>
          </div>
          <span className="text-sm font-semibold text-luxury-accent">{fmt(autoPayloadTotal)}</span>
        </div>
        <button onClick={saveBalances} disabled={savingBalances} className="btn btn-primary text-xs px-4 flex items-center gap-1.5 mb-5 disabled:opacity-50">
          <Save size={12} /> {savingBalances ? 'Saving...' : 'Save balances'}
        </button>
        <div className="border-t border-luxury-gray-5/50 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-luxury-gray-2">Recently paid</span>
            <span className="font-medium text-luxury-gray-1">{fmt(paidAgentTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-luxury-gray-2">On hold</span>
            <span className="font-medium text-luxury-gray-1">{fmt(holdAgentTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-luxury-gray-2">Also in payouts</span>
            <span className="font-medium text-luxury-gray-1">{fmt(expensesTotal)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-luxury-gray-5/50 pt-2">
            <span className="text-luxury-gray-2 font-medium">Grand total</span>
            <span className="font-semibold text-luxury-gray-1">{fmt(grandTotal)}</span>
          </div>
          <div className="flex justify-between text-sm pt-1">
            <span className="text-luxury-gray-2">Bank balance (payouts acct)</span>
            <span className="font-medium text-luxury-gray-1">{fmt(bank)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-luxury-gray-2">+ Bank holds</span>
            <span className="font-medium text-luxury-gray-1">{fmt(holdsAmt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-luxury-gray-2">+ Pending Payload</span>
            <span className="font-medium text-luxury-accent">{fmt(payloadAmt)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-luxury-gray-5/50 pt-2">
            <span className={`font-semibold ${difference < 0 ? 'text-red-600' : 'text-luxury-gray-1'}`}>Difference</span>
            <span className={`font-bold ${difference < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(difference)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-luxury-gray-5/50 pt-2">
            <span className="text-luxury-gray-2">Available after paid out</span>
            <span className="font-medium text-luxury-gray-1">{fmt(availableAfterPaidOut)}</span>
          </div>
        </div>
        </div>
        </div>

      </div>
    </div>
  )
}