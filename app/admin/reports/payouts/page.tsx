'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Plus, Trash2, Save, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  status: string
  notes: string | null
}

interface Expense { id: string; description: string; amount: number | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'

function complianceLabel(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    complete: { label: 'complete', cls: 'text-green-700' },
    approved: { label: 'complete', cls: 'text-green-700' },
    not_submitted: { label: 'not requested', cls: 'text-luxury-gray-3' },
    in_review: { label: 'in review', cls: 'text-yellow-600' },
    incomplete: { label: 'incomplete', cls: 'text-red-500' },
  }
  return map[status] || { label: status, cls: 'text-luxury-gray-3' }
}

function agentNames(row: PayoutRow): string {
  // Linked transaction — use internal agent first names
  const names = row.agents.map(a => a.name.split(' ')[0].toLowerCase())
  const ext = row.externals.map(e => e.name.split(' ')[0].toLowerCase())
  if (names.length || ext.length) return [...names, ...ext].join(' and ')
  // Standalone agent linked
  if (row.standalone_agent) return row.standalone_agent
  // Fallback: parse notes field (imported data has "Agent(s): larissa")
  if (row.notes) {
    const match = row.notes.match(/Agent\(s\):\s*([^;]+)/i)
    if (match) return match[1].trim()
  }
  return '—'
}

function cleanNotes(notes: string | null): string {
  if (!notes) return '—'
  // Strip import artifacts
  return notes
    .replace(/Agent\(s\):[^;]*;?/gi, '')
    .replace(/Imported from Monday Meeting spreadsheet/gi, '')
    .replace(/;\s*$/g, '')
    .trim() || '—'
}

function agentTotal(row: PayoutRow): number {
  return row.agents.reduce((s, a) => s + (a.amount || 0), 0) +
    row.externals.reduce((s, e) => s + (e.amount || 0), 0)
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function PayoutTableRow({ row, dateKey }: { row: PayoutRow; dateKey: 'cleared_date' | 'received_date' }) {
  const a1 = row.agents[0]
  const a2 = row.agents[1]
  const ext = row.externals[0]
  const { label, cls } = complianceLabel(row.compliance_status)
  const dateVal = dateKey === 'cleared_date' ? row.cleared_date : (row.cleared_date || row.received_date)

  return (
    <tr className="border-b border-luxury-gray-5/30 hover:bg-luxury-gray-6/30">
      <td className="py-2 px-3 text-xs text-luxury-gray-1 font-medium">
        {row.transaction_id ? (
          <Link href={`/admin/transactions/${row.transaction_id}`} className="hover:text-luxury-accent flex items-center gap-1">
            <span className="truncate max-w-[160px] block">{row.address}</span>
            <ExternalLink size={10} className="opacity-40 flex-shrink-0" />
          </Link>
        ) : <span className="truncate max-w-[160px] block">{row.address}</span>}
      </td>
      <td className="py-2 px-3 text-xs text-right text-luxury-gray-2 hidden md:table-cell">{row.crc_amount > 0 ? fmt(row.crc_amount) : '—'}</td>
      <td className="py-2 px-3 text-xs text-right text-luxury-gray-2 hidden lg:table-cell">{a1 ? fmt(a1.amount) : '—'}</td>
      <td className="py-2 px-3 text-xs text-right text-luxury-gray-2 hidden lg:table-cell">{a2 ? fmt(a2.amount) : '—'}</td>
      <td className="py-2 px-3 text-xs text-right text-luxury-gray-2 hidden lg:table-cell">{ext ? fmt(ext.amount) : '—'}</td>
      <td className="py-2 px-3 text-xs text-right font-medium text-luxury-gray-1">{agentTotal(row) > 0 ? fmt(agentTotal(row)) : '—'}</td>
      <td className="py-2 px-3 text-xs text-luxury-gray-2 hidden sm:table-cell">
        <span className="truncate max-w-[110px] block">{agentNames(row)}</span>
      </td>
      <td className="py-2 px-3 text-xs text-luxury-gray-3 hidden sm:table-cell">{fmtDate(dateVal)}</td>
      <td className={`py-2 px-3 text-xs hidden md:table-cell ${cls}`}>{label}</td>
      <td className="py-2 px-3 text-xs">
        <span className={`font-medium ${row.crc_transferred ? 'text-green-700' : 'text-red-500'}`}>
          {row.crc_transferred ? 'yes' : 'no'}
        </span>
      </td>
      <td className="py-2 px-3 text-xs text-luxury-gray-3 hidden lg:table-cell">
        <span className="truncate max-w-[110px] block">{cleanNotes(row.notes)}</span>
      </td>
    </tr>
  )
}

// ─── Section Table ────────────────────────────────────────────────────────────

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
    let av: string | number = 0
    let bv: string | number = 0
    if (sortKey === 'date') {
      av = a.cleared_date || a.received_date || ''
      bv = b.cleared_date || b.received_date || ''
    } else if (sortKey === 'compliance') {
      av = a.compliance_status || ''
      bv = b.compliance_status || ''
    }
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const displayRows = sortKey ? sortedRows : rows

  const crcTotal = rows.reduce((s, r) => s + r.crc_amount, 0)
  const agentTot = rows.reduce((s, r) => s + agentTotal(r), 0)
  const a1Tot = rows.reduce((s, r) => s + (r.agents[0]?.amount || 0), 0)
  const a2Tot = rows.reduce((s, r) => s + (r.agents[1]?.amount || 0), 0)
  const extTot = rows.reduce((s, r) => s + (r.externals[0]?.amount || 0), 0)

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
          <table className="w-full">
            <thead>
              <tr className="border-b border-luxury-gray-5/50">
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Address</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right hidden md:table-cell">CRC</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right hidden lg:table-cell">Agent 1</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right hidden lg:table-cell">Agent 2</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right hidden lg:table-cell">Other</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Total</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden sm:table-cell">Agents</th>
                <th
                  className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden sm:table-cell cursor-pointer select-none hover:text-luxury-gray-1"
                  onClick={() => toggleSort('date')}
                >
                  {dateLabel} {sortKey === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th
                  className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden md:table-cell cursor-pointer select-none hover:text-luxury-gray-1"
                  onClick={() => toggleSort('compliance')}
                >
                  Compliance {sortKey === 'compliance' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Transferred</th>
                <th className="pb-2 px-3 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left hidden lg:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr><td colSpan={11} className="py-6 text-center text-xs text-luxury-gray-3">No records</td></tr>
              ) : (
                displayRows.map(row => <PayoutTableRow key={row.check_id} row={row} dateKey={dateKey} />)
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-luxury-gray-5/50 bg-luxury-gray-6/30">
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-luxury-gray-1">Total</td>
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-right text-luxury-gray-1">{fmt(crcTotal)}</td>
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-right text-luxury-gray-1">{fmt(a1Tot)}</td>
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-right text-luxury-gray-1">{fmt(a2Tot)}</td>
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-right text-luxury-gray-1">{fmt(extTot)}</td>
                  <td className="pt-2 pb-1 px-3 text-xs font-semibold text-right text-luxury-gray-1">{fmt(agentTot)}</td>
                  <td colSpan={5} className="pt-2 pb-1 px-3 text-xs text-luxury-gray-3">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PayoutsReportPage() {
  const router = useRouter()
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [paidCollapsed, setPaidCollapsed] = useState(false)
  const [holdCollapsed, setHoldCollapsed] = useState(false)
  const [expCollapsed, setExpCollapsed] = useState(false)

  // Balance inputs
  const [bankBalance, setBankBalance] = useState('')
  const [holds, setHolds] = useState('')
  const [payloadPending, setPayloadPending] = useState('')
  const [autoPayloadTotal, setAutoPayloadTotal] = useState(0)
  const [savingBalances, setSavingBalances] = useState(false)

  // Expense form
  const [newDesc, setNewDesc] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const [addingExp, setAddingExp] = useState(false)

  const [authed, setAuthed] = useState(false)

  // Auth — load data only after confirmed
  useEffect(() => {
    fetch('/api/auth/me').then(res => {
      if (!res.ok) router.push('/auth/login')
      else setAuthed(true)
    }).catch(() => router.push('/auth/login'))
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/payouts-report')
    if (res.ok) {
      const json = await res.json()
      setRows(json.rows || [])
      setExpenses(json.expenses || [])
      setBankBalance(json.settings?.bank_balance?.toString() || '')
      setHolds(json.settings?.funds_on_hold?.toString() || '')
      setPayloadPending(json.settings?.payload_pending_balance?.toString() || '')
      setAutoPayloadTotal(json.pending_payload_total || 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (authed) load() }, [authed, load])

  const paidRows = rows.filter(r => r.crc_transferred)
  const holdRows = rows.filter(r => !r.crc_transferred)

  const paidAgentTotal = paidRows.reduce((s, r) => s + agentTotal(r), 0)
  const holdAgentTotal = holdRows.reduce((s, r) => s + agentTotal(r), 0)
  const expensesTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const grandTotal = paidAgentTotal + holdAgentTotal + expensesTotal

  const bank = parseFloat(bankBalance) || 0
  const holdsAmt = parseFloat(holds) || 0
  const payloadAmt = autoPayloadTotal
  const difference = (bank + holdsAmt + payloadAmt) - grandTotal
  const availableAfterPaidOut = bank - (paidAgentTotal + expensesTotal)

  const saveBalances = async () => {
    setSavingBalances(true)
    await fetch('/api/admin/payouts-report', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_balance: bankBalance, funds_on_hold: holds, payload_pending_balance: payloadPending }),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">PAYOUTS REPORT</h1>
        <button onClick={load} className="btn btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <PayoutsTable rows={paidRows} title="Paid Most Recently" collapsed={paidCollapsed} onToggle={() => setPaidCollapsed(v => !v)} dateLabel="Paid" dateKey="cleared_date" />
      <PayoutsTable rows={holdRows} title="On Hold" collapsed={holdCollapsed} onToggle={() => setHoldCollapsed(v => !v)} dateLabel="Cleared" dateKey="cleared_date" />

      {/* Also In Payouts */}
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

      {/* Bottom Line */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Bottom Line</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
          <div>
            <label className="field-label">Pending Payload</label>
            <div className="inner-card flex items-center justify-between py-2">
              <span className="text-xs text-luxury-gray-3">Auto-calculated from transactions</span>
              <span className="text-sm font-semibold text-luxury-gray-1">{fmt(autoPayloadTotal)}</span>
            </div>
          </div>
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
  )
}