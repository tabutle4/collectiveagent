'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Trash2, Save, ChevronDown, ChevronUp, ExternalLink, Check, X, ArrowRightLeft, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/context/AuthContext'
import MarkPaidPanelModal from '@/components/transactions/MarkPaidPanelModal'
import MoveCheckModal from '@/components/checks/MoveCheckModal'
import SweepDialog from '@/components/payouts/SweepDialog'
import DayView from '@/components/payouts/DayView'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/transactions/constants'
import {
  type SweepGates,
  payoutBucket,
  waitingOn,
  CLEARED_VERIFIED_EMPTY,
} from '@/lib/payouts/sweep'

// Types

interface AgentRow {
  id: string
  agent_id: string
  agent_role: string
  name: string
  amount: number
  payment_status: string | null
  payment_date: string | null
  is_lease: boolean
}
interface ExternalRow {
  id: string
  name: string
  amount: number
  payment_status: string | null
  payment_date: string | null
  is_lease: boolean
}

interface PayoutRow {
  check_id: string
  transaction_id: string | null
  address: string
  // Null means the deal's office net has not been computed. A null is not a
  // zero: "$0.00" reads as "we made nothing on this", which is a different
  // and wrong claim, so a null renders as Unknown.
  crc_amount: number | null
  check_amount: number
  agents: AgentRow[]
  externals: ExternalRow[]
  standalone_agent: string | null
  cleared_date: string | null
  received_date: string | null
  compliance_status: string
  sides_complete: number | null
  sides_expected: number | null
  checklist_complete: boolean
  checklist_done: number
  checklist_required: number
  funds_cleared: boolean
  office_net_state: 'paid_at_closing' | 'not_swept' | 'swept'
  office_net_swept_at: string | null
  office_net_swept_amount: number | null
  pay_by_date: string | null
  crc_transferred: boolean
  /** Derived from the agent and external rows, not the stored column. */
  agents_paid: boolean
  agents_paid_stored: boolean
  status: string
  notes: string | null
  is_anchor?: boolean
}

interface Expense { id: string; description: string; amount: number | null }

interface PMFee {
  id: string
  payee_name: string
  payee_id: string
  amount: number
  address: string
  period: string
  payment_status: string
  payment_date: string | null
  payment_method: string | null
}

interface LandlordPayout {
  id: string
  payee_name: string
  amount: number
  address: string
  period: string
  payment_status: string
  payment_date: string | null
  payment_method: string | null
}

// Helpers

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '-'

// Full timestamp for the last-balanced line in the Bottom Line verdict bar
const fmtStamp = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null

// Cleared dates: green when the check has cleared (date is today or earlier),
// red when it has not cleared yet (date is in the future). No date stays neutral.
// Mirrors the not-cleared rule in app/api/admin/payouts-report/route.ts (cleared_date > today).
const clearedDateClass = (d: string | null): string => {
  if (!d) return 'text-luxury-gray-3'
  // Central date, not UTC: matches the report route so coloring and the holds
  // math agree during the evening hours when UTC has rolled to tomorrow.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return d > today ? 'text-red-500' : 'text-green-700'
}

function complianceLabel(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    complete:      { label: 'complete',      cls: 'text-green-700' },
    approved:      { label: 'complete',      cls: 'text-green-700' },
    not_submitted: { label: 'not requested', cls: 'text-luxury-gray-3' },
    not_requested: { label: 'not requested', cls: 'text-luxury-gray-3' },
    in_review:     { label: 'in review',     cls: 'text-yellow-600' },
    submitted:     { label: 'in review',     cls: 'text-yellow-600' },
    incomplete:    { label: 'incomplete',    cls: 'text-red-500' },
  }
  return map[status] || { label: status, cls: 'text-luxury-gray-3' }
}

// Only intermediary deals get a fraction. A single-sided deal reading "1/1"
// on every row buries the two-sided ones this exists to surface. Null counts
// mean the deal filed no sides and its status came from the stored date, so
// there is nothing honest to count.
function sidesBadge(row: PayoutRow, className = '') {
  if (row.sides_expected === null || row.sides_complete === null) return null
  if (row.sides_expected < 2) return null
  const done = row.sides_complete >= row.sides_expected
  const cls = done ? 'text-green-700 bg-green-50' : 'text-yellow-700 bg-yellow-50'
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${className} ${cls}`}>{row.sides_complete}/{row.sides_expected} sides</span>
  )
}

// The gates a deal has to pass, in the shape lib/payouts/sweep expects. The
// sweep dialog and this report must never answer "is this deal ready" two
// different ways, so both read the same function.
//
// A deal that filed no compliance sides sends null counts: its status came
// from the stored date instead. Treat that as one side, complete or not
// according to the status already shown in the Compliance column, rather than
// counting zero sides and burying the deal in Needs Attention.
function gatesFor(row: PayoutRow): SweepGates {
  const filedSides = row.sides_expected !== null && row.sides_complete !== null
  return {
    fundsCleared: row.funds_cleared,
    checklistDone: row.checklist_done,
    checklistRequired: row.checklist_required,
    sidesComplete: filedSides
      ? (row.sides_complete as number)
      : (row.compliance_status === 'complete' || row.compliance_status === 'approved' ? 1 : 0),
    sidesExpected: filedSides ? (row.sides_expected as number) : 1,
  }
}

function agentNames(row: PayoutRow): string {
  // Only show names of unpaid agents
  const names = row.agents.filter(a => a.payment_status !== 'paid').map(a => a.name.split(' ')[0].toLowerCase())
  const ext = row.externals.filter(e => e.payment_status !== 'paid').map(e => e.name.split(' ')[0].toLowerCase())
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

function unpaidAgentTotal(row: PayoutRow): number {
  return row.agents.filter(a => a.payment_status !== 'paid').reduce((s, a) => s + (a.amount || 0), 0) +
    row.externals.filter(e => e.payment_status !== 'paid').reduce((s, e) => s + (e.amount || 0), 0)
}

// Check if all agents/externals in a row are paid
function allAgentsPaid(row: PayoutRow): boolean {
  const hasAgents = row.agents.length > 0 || row.externals.length > 0
  if (!hasAgents) return false // standalone check with no agents - don't hide
  const allAgentsPaid = row.agents.every(a => a.payment_status === 'paid')
  const allExternalsPaid = row.externals.every(e => e.payment_status === 'paid')
  return allAgentsPaid && allExternalsPaid
}

// Get only unpaid agents for display
function unpaidAgents(row: PayoutRow): AgentRow[] {
  return row.agents.filter(a => a.payment_status !== 'paid')
}

// Get only unpaid externals for display
function unpaidExternals(row: PayoutRow): ExternalRow[] {
  return row.externals.filter(e => e.payment_status !== 'paid')
}

// Keep all checks of one transaction together, anchor check first, while
// preserving the order the rows were already sorted in. Single-check deals are
// one-row groups, so nothing changes for them.
function groupByTransaction(rows: PayoutRow[]): PayoutRow[] {
  const keyOf = (r: PayoutRow) => r.transaction_id || `c:${r.check_id}`
  const seen = new Set<string>()
  const out: PayoutRow[] = []
  for (const r of rows) {
    const key = keyOf(r)
    if (seen.has(key)) continue
    seen.add(key)
    const group = rows.filter(x => keyOf(x) === key)
    group.sort((a, b) => (b.is_anchor ? 1 : 0) - (a.is_anchor ? 1 : 0))
    out.push(...group)
  }
  return out
}

// Mobile card - clean stacked layout

function PayoutCard({ row, dateKey, showWaitingOn, onMarkAgentPaid, onMarkExternalPaid, onMoveCheck }: {
  row: PayoutRow
  dateKey: 'cleared_date' | 'received_date'
  showWaitingOn?: boolean
  onMarkAgentPaid?: (tiaId: string, checkId: string) => void
  onMarkExternalPaid?: (externalId: string, checkId: string) => void
  onMoveCheck?: (row: PayoutRow) => void
}) {
  const { label, cls } = complianceLabel(row.compliance_status)
  const dateVal = dateKey === 'cleared_date' ? row.cleared_date : (row.cleared_date || row.received_date)
  const total = unpaidAgentTotal(row)
  const notes = cleanNotes(row.notes)
  const waiting = showWaitingOn ? waitingOn(gatesFor(row)) : []

  return (
    <div className="container-card rounded-lg overflow-hidden">
      {/* Header row - address + total */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          {row.transaction_id ? (
            <Link
              href={`/admin/transactions/${row.transaction_id}`}
              className="text-xs font-semibold text-luxury-gray-1 hover:text-luxury-accent flex items-center gap-1 leading-snug"
            >
              <span className="leading-snug">{row.address}</span>
              <ExternalLink size={10} className="opacity-40 flex-shrink-0" />
            </Link>
          ) : (
            <span className="text-xs font-semibold text-luxury-gray-1 leading-snug">{row.address}</span>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-xs text-luxury-gray-3">{fmt(row.check_amount)} check</p>
          <p className="text-sm font-semibold text-luxury-gray-1">{total > 0 ? fmt(total) : '-'}</p>
          {row.crc_amount === null ? (
            <p className="text-xs text-amber-700 mt-0.5">Our share unknown</p>
          ) : row.crc_amount > 0 && (
            <p className="text-xs text-luxury-gray-3 mt-0.5">+{fmt(row.crc_amount)} our share</p>
          )}
        </div>
      </div>

      {/* Agent payouts - only show unpaid, tap to mark paid */}
      {unpaidAgents(row).length > 0 && (
        <div className="px-4 pb-1 flex flex-col gap-0.5">
          {unpaidAgents(row).map((a) => (
            <div key={a.id} className="flex items-center justify-between">
              <span className="text-xs text-luxury-gray-3 capitalize">
                {a.name.split(' ').slice(0, 2).join(' ')}
              </span>
              {onMarkAgentPaid ? (
                <button
                  onClick={() => onMarkAgentPaid(a.id, row.check_id)}
                  className="text-xs font-medium text-luxury-gray-2 tabular-nums hover:text-green-600"
                >
                  {fmt(a.amount)}
                </button>
              ) : (
                <span className="text-xs font-medium tabular-nums text-luxury-gray-2">
                  {fmt(a.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* External payouts - only show unpaid, tap to mark paid */}
      {unpaidExternals(row).length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-0.5">
          {unpaidExternals(row).map((e) => (
            <div key={e.id} className="flex items-center justify-between">
              <span className="text-xs text-luxury-gray-3 capitalize">
                {e.name.split(' ').slice(0, 2).join(' ')}
              </span>
              {onMarkExternalPaid ? (
                <button
                  onClick={() => onMarkExternalPaid(e.id, row.check_id)}
                  className="text-xs font-medium text-luxury-gray-2 tabular-nums hover:text-green-600"
                >
                  {fmt(e.amount)}
                </button>
              ) : (
                <span className="text-xs font-medium tabular-nums text-luxury-gray-2">
                  {fmt(e.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer - date, compliance, pay by, checklist */}
      <div className="border-t border-luxury-gray-5/40 px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {dateVal && (
            <span className={`text-xs tabular-nums ${dateKey === 'cleared_date' ? clearedDateClass(dateVal) : 'text-luxury-gray-3'}`}>{fmtDate(dateVal)}</span>
          )}
          {label && <span className={`text-xs ${cls}`}>{label}</span>}
          {sidesBadge(row)}
          {row.pay_by_date && (
            <span className="text-xs text-luxury-gray-3">pay by {fmtDate(row.pay_by_date)}</span>
          )}
        </div>
        <span className={`text-xs font-medium flex-shrink-0 ${row.checklist_complete ? 'text-green-700' : 'text-luxury-gray-3'}`}>
          {row.checklist_complete ? '✓ checklist' : 'checklist pending'}
        </span>
      </div>

      {/* Why this deal is sitting here, in the order a person would fix it. */}
      {showWaitingOn && waiting.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {waiting.map(w => (
            <span key={w} className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{w}</span>
          ))}
        </div>
      )}

      {/* Notes - only if present */}
      {notes && (
        <div className="px-4 pb-2">
          <p className="text-xs text-luxury-gray-3 italic">{notes}</p>
        </div>
      )}

      {onMoveCheck && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => onMoveCheck(row)}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <ArrowRightLeft size={13} />
            Move Check
          </button>
        </div>
      )}
    </div>
  )
}

// Desktop table row - all columns visible, table scrolls horizontally if needed

function PayoutTableRow({ row, dateKey, showWaitingOn, onMarkAgentPaid, onMarkExternalPaid, onMoveCheck }: {
  row: PayoutRow
  dateKey: 'cleared_date' | 'received_date'
  showWaitingOn?: boolean
  onMarkAgentPaid?: (tiaId: string, checkId: string) => void
  onMarkExternalPaid?: (externalId: string, checkId: string) => void
  onMoveCheck?: (row: PayoutRow) => void
}) {
  // Only show unpaid agents/externals in table cells
  const agents = unpaidAgents(row)
  const externals = unpaidExternals(row)
  const a1 = agents[0]
  const a2 = agents[1]
  const a3 = agents[2]
  const ext = externals[0]
  const { label, cls } = complianceLabel(row.compliance_status)
  const dateVal = dateKey === 'cleared_date' ? row.cleared_date : (row.cleared_date || row.received_date)
  const waiting = showWaitingOn ? waitingOn(gatesFor(row)) : []

  const renderAgentCell = (agent: AgentRow | undefined) => {
    if (!agent) return <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">-</td>
    return (
      <td className="py-2 px-2 text-xs text-right whitespace-nowrap">
        {onMarkAgentPaid ? (
          <button
            onClick={() => onMarkAgentPaid(agent.id, row.check_id)}
            className="text-luxury-gray-2 hover:text-green-600 hover:font-semibold transition-colors"
            title={`Mark ${agent.name} paid`}
          >
            {fmt(agent.amount)}
          </button>
        ) : (
          <span className="text-luxury-gray-2">
            {fmt(agent.amount)}
          </span>
        )}
      </td>
    )
  }

  const renderExternalCell = (external: ExternalRow | undefined) => {
    if (!external) return <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">-</td>
    return (
      <td className="py-2 px-2 text-xs text-right whitespace-nowrap">
        {onMarkExternalPaid ? (
          <button
            onClick={() => onMarkExternalPaid(external.id, row.check_id)}
            className="text-luxury-gray-2 hover:text-green-600 hover:font-semibold transition-colors"
            title={`Mark ${external.name} paid`}
          >
            {fmt(external.amount)}
          </button>
        ) : (
          <span className="text-luxury-gray-2">
            {fmt(external.amount)}
          </span>
        )}
      </td>
    )
  }

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
      <td className="py-2 px-2 text-xs text-right text-luxury-gray-2 whitespace-nowrap">{row.check_amount > 0 ? fmt(row.check_amount) : '-'}</td>
      <td className="py-2 px-2 text-xs text-right whitespace-nowrap">
        {row.crc_amount === null
          ? <span className="text-amber-700">Unknown</span>
          : <span className="text-luxury-gray-2">{row.crc_amount > 0 ? fmt(row.crc_amount) : '-'}</span>}
      </td>
      {renderAgentCell(a1)}
      {renderAgentCell(a2)}
      {renderAgentCell(a3)}
      {renderExternalCell(ext)}
      <td className="py-2 px-2 text-xs text-right font-semibold text-luxury-gray-1 whitespace-nowrap">{unpaidAgentTotal(row) > 0 ? fmt(unpaidAgentTotal(row)) : '-'}</td>
      <td className="py-2 px-2 text-xs text-luxury-gray-2 max-w-[120px]">
        <span className="truncate block">{agentNames(row) || '-'}</span>
      </td>
      <td className={`py-2 px-2 text-xs whitespace-nowrap ${dateKey === 'cleared_date' ? clearedDateClass(dateVal) : 'text-luxury-gray-3'}`}>{fmtDate(dateVal)}</td>
      <td className="py-2 px-2 text-xs whitespace-nowrap">
        <span className={cls}>{label}</span>
        {sidesBadge(row, 'ml-2')}
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 whitespace-nowrap">{fmtDate(row.pay_by_date)}</td>
      <td className="py-2 px-2 text-xs whitespace-nowrap">
        <span className={`font-medium ${row.checklist_complete ? 'text-green-700' : 'text-luxury-gray-3'}`}>
          {row.checklist_complete
            ? '✓ done'
            : row.checklist_required > 0
              ? `${row.checklist_done} of ${row.checklist_required}`
              : 'pending'}
        </span>
      </td>
      <td className="py-2 px-2 text-xs text-luxury-gray-3 max-w-[160px]">
        {showWaitingOn && waiting.length > 0 ? (
          <span className="text-amber-700 block" title={waiting.join(', ')}>{waiting.join(', ')}</span>
        ) : (
          <span className="truncate block">{cleanNotes(row.notes) || '-'}</span>
        )}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap">
        {onMoveCheck && (
          <button
            type="button"
            onClick={() => onMoveCheck(row)}
            className="text-luxury-gray-3 hover:text-luxury-accent transition-colors"
            title="Move this check to another deal"
          >
            <ArrowRightLeft size={14} />
          </button>
        )}
      </td>
    </tr>
  )
}

// Section component - cards on mobile, scrollable table on desktop

type SortKey = 'date' | 'compliance' | 'pay_by' | null
type SortDir = 'asc' | 'desc'

function PayoutsTable({ rows, title, subtitle, emptyMessage, showWaitingOn, collapsed, onToggle, dateLabel, dateKey, onMarkAgentPaid, onMarkExternalPaid, onMoveCheck }: {
  rows: PayoutRow[]; title: string; collapsed: boolean; onToggle: () => void
  subtitle?: string
  emptyMessage?: string
  showWaitingOn?: boolean
  dateLabel: string; dateKey: 'cleared_date' | 'received_date'
  onMarkAgentPaid?: (tiaId: string, checkId: string) => void
  onMarkExternalPaid?: (externalId: string, checkId: string) => void
  onMoveCheck?: (row: PayoutRow) => void
}) {
  // Pay by is the default sort, oldest first, so the deals closest to their
  // deadline are at the top. Rows with no pay-by date sort to the bottom.
  const [sortKey, setSortKey] = useState<SortKey>('pay_by')
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
    else if (sortKey === 'pay_by') { av = a.pay_by_date || '9999-12-31'; bv = b.pay_by_date || '9999-12-31' }
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const orderedRows = sortKey ? sortedRows : rows
  const displayRows = groupByTransaction(orderedRows)
  const txnCount = new Set(rows.map(r => r.transaction_id || `c:${r.check_id}`)).size
  const checkTotal = rows.reduce((s, r) => s + r.check_amount, 0)
  const crcTotal  = rows.reduce((s, r) => s + (r.crc_amount ?? 0), 0)
  const agentTot  = rows.reduce((s, r) => s + unpaidAgentTotal(r), 0)
  const a1Tot     = rows.reduce((s, r) => s + (r.agents[0] && r.agents[0].payment_status !== 'paid' ? r.agents[0].amount : 0), 0)
  const a2Tot     = rows.reduce((s, r) => s + (r.agents[1] && r.agents[1].payment_status !== 'paid' ? r.agents[1].amount : 0), 0)
  const a3Tot     = rows.reduce((s, r) => s + (r.agents[2] && r.agents[2].payment_status !== 'paid' ? r.agents[2].amount : 0), 0)
  const extTot    = rows.reduce((s, r) => s + (r.externals[0] && r.externals[0].payment_status !== 'paid' ? r.externals[0].amount : 0), 0)

  return (
    <div className="container-card mb-5">
      <button className="w-full flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{title}</h2>
            {subtitle && <p className="text-xs text-luxury-gray-3 normal-case">{subtitle}</p>}
          </div>
          <span className="text-xs text-luxury-gray-3">({rows.length})</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-luxury-gray-2">Checks: <span className="font-semibold text-luxury-gray-1">{fmt(checkTotal)}</span></span>
          <span className="text-xs text-luxury-gray-2">Agents: <span className="font-semibold text-luxury-gray-1">{fmt(agentTot)}</span></span>
          <span className="text-xs text-luxury-gray-2">Our share: <span className="font-semibold text-luxury-gray-1">{fmt(crcTotal)}</span></span>
          {collapsed ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronUp size={14} className="text-luxury-gray-3" />}
        </div>
      </button>

      {!collapsed && (
        <div className="mt-4">

          {/* Mobile and tablet: card layout (below lg) */}
          <div className="lg:hidden space-y-2">
            {displayRows.length === 0 ? (
              <p className="text-xs text-luxury-gray-3 text-center py-4">{emptyMessage || 'No records'}</p>
            ) : (
              displayRows.map(row => <PayoutCard key={row.check_id} row={row} dateKey={dateKey} showWaitingOn={showWaitingOn} onMarkAgentPaid={onMarkAgentPaid} onMarkExternalPaid={onMarkExternalPaid} onMoveCheck={onMoveCheck} />)
            )}
            {rows.length > 0 && (
              <div className="container-card rounded-lg flex items-center justify-between px-4 py-2 mt-1">
                <span className="text-xs font-semibold text-luxury-gray-1">{txnCount} transaction{txnCount !== 1 ? 's' : ''}</span>
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
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Check</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-right">Our Share</th>
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
                  <th
                    className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left cursor-pointer select-none hover:text-luxury-gray-1"
                    onClick={() => toggleSort('pay_by')}
                  >
                    Pay By {sortKey === 'pay_by' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Checklist</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">{showWaitingOn ? 'Waiting On' : 'Notes'}</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest text-left">Move</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={15} className="py-6 text-center text-xs text-luxury-gray-3">{emptyMessage || 'No records'}</td></tr>
                ) : (
                  displayRows.map(row => <PayoutTableRow key={row.check_id} row={row} dateKey={dateKey} showWaitingOn={showWaitingOn} onMarkAgentPaid={onMarkAgentPaid} onMarkExternalPaid={onMarkExternalPaid} onMoveCheck={onMoveCheck} />)
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-luxury-gray-5/50 bg-luxury-gray-6/30">
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-luxury-gray-1">Total</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(checkTotal)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(crcTotal)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(a1Tot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(a2Tot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{a3Tot > 0 ? fmt(a3Tot) : '-'}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(extTot)}</td>
                    <td className="pt-2 pb-1 px-2 text-xs font-semibold text-right text-luxury-gray-1 whitespace-nowrap">{fmt(agentTot)}</td>
                    <td colSpan={7} className="pt-2 pb-1 px-2 text-xs text-luxury-gray-3">{txnCount} transaction{txnCount !== 1 ? 's' : ''}</td>
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
  const { user, hasPermission } = useAuth()
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [pmFees, setPmFees] = useState<PMFee[]>([])
  const [landlordPayouts, setLandlordPayouts] = useState<LandlordPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paidCollapsed, setPaidCollapsed] = useState(false)
  const [verifiedCollapsed, setVerifiedCollapsed] = useState(false)
  const [attentionCollapsed, setAttentionCollapsed] = useState(false)
  const [sweepOpen, setSweepOpen] = useState(false)
  const [dayViewOpen, setDayViewOpen] = useState(false)
  const [unsweptOfficeNet, setUnsweptOfficeNet] = useState(0)
  const [officeNetUnknown, setOfficeNetUnknown] = useState<{ transaction_id: string; address: string }[]>([])
  // Re-deriving office net across the in-scope deals. The route existed with
  // no caller at all, and the cutover depends on it: sweeping transfers
  // whatever office_net says, so a deal last edited under older commission
  // math moves the wrong amount. It batches, so this loops the cursor.
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null)
  const [expCollapsed, setExpCollapsed] = useState(false)
  const [pmFeesCollapsed, setPmFeesCollapsed] = useState(false)
  const [landlordCollapsed, setLandlordCollapsed] = useState(false)

  const [bankBalance, setBankBalance] = useState('')
  const [ledgerBalance, setLedgerBalance] = useState(0)
  const [ledgerStarted, setLedgerStarted] = useState(false)
  const [billsDue14, setBillsDue14] = useState(0)
  const [payExpense, setPayExpense] = useState<{ id: string; description: string; amount: number | null } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [paying, setPaying] = useState(false)
  const [holds, setHolds] = useState('')
  const [savingBalances, setSavingBalances] = useState(false)
  const [autoPayloadTotal, setAutoPayloadTotal] = useState(0)
  const [payloadBreakdown, setPayloadBreakdown] = useState<{ commission_link: number; retainer_link: number; pm_rent: number; other: number }>({ commission_link: 0, retainer_link: 0, pm_rent: 0, other: 0 })
  const [bankHoldRows, setBankHoldRows] = useState<{ check_id: string; label: string; amount: number }[]>([])
  const [autoHoldsTotal, setAutoHoldsTotal] = useState(0)
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null)
  const [holdsOpen, setHoldsOpen] = useState(false)
  const [payloadOpen, setPayloadOpen] = useState(false)

  const [newDesc, setNewDesc] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const [addingExp, setAddingExp] = useState(false)

  // Mark Paid Panel Modal (agent/external)
  const [agentMarkPaid, setAgentMarkPaid] = useState<{
    transactionId: string
    tia: { id: string; agent_id: string; agent_role: string; agent_net: number; transaction_type?: string }
    name: string
    isLease: boolean
  } | null>(null)
  const [externalMarkPaid, setExternalMarkPaid] = useState<{
    externalId: string; name: string; amount: number; isLease: boolean
  } | null>(null)
  const [externalMarkPaidDate, setExternalMarkPaidDate] = useState('')
  const [externalMarkPaidMethod, setExternalMarkPaidMethod] = useState('ach')
  const [externalMarkPaidRef, setExternalMarkPaidRef] = useState('')
  const [externalSaving, setExternalSaving] = useState(false)

  // Mark Paid Modal (PM fee / landlord)
  const [markPaidType, setMarkPaidType] = useState<'pm_fee' | 'landlord' | null>(null)
  const [markPaidItem, setMarkPaidItem] = useState<PMFee | LandlordPayout | null>(null)
  const [markPaidDate, setMarkPaidDate] = useState('')
  const [markPaidMethod, setMarkPaidMethod] = useState('ach')
  const [markPaidSaving, setMarkPaidSaving] = useState(false)

  const [moveCheckRow, setMoveCheckRow] = useState<PayoutRow | null>(null)

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
      setPmFees(json.pm_fees || [])
      setLandlordPayouts(json.landlord_payouts || [])
      setBankBalance(json.settings?.bank_balance?.toString() || '')
      setLedgerBalance(Number(json.ledger_balance || 0))
      setLedgerStarted(!!json.ledger_started)
      setBillsDue14(Number(json.bills_due_14_days || 0))
      setHolds(json.settings?.funds_on_hold?.toString() || '')
      setAutoPayloadTotal(json.pending_payload_total || 0)
      setPayloadBreakdown(json.payload_breakdown || { commission_link: 0, retainer_link: 0, pm_rent: 0, other: 0 })
      setBankHoldRows(json.hold_rows || [])
      setAutoHoldsTotal(json.auto_holds_total || 0)
      setBalanceUpdatedAt(json.settings?.bank_balance_updated_at || null)
      setUnsweptOfficeNet(json.unswept_office_net || 0)
      setOfficeNetUnknown(json.office_net_unknown || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  // A funding-only sibling check (not the anchor) carries no payouts of its own.
  // Once its deal is fully paid the anchor drops out of the active tables, so
  // drop the sibling with it instead of leaving an orphaned funding row.
  const settledTxnIds = new Set(
    rows
      .filter(r => r.is_anchor && r.agents.length > 0 && r.agents.every(a => a.payment_status === 'paid'))
      .map(r => r.transaction_id)
  )
  const isSettledSibling = (r: PayoutRow) =>
    r.is_anchor === false && settledTxnIds.has(r.transaction_id)

  // Three sections, from lib/payouts/sweep so the sweep dialog and this report
  // can never put the same deal in two places.
  //
  // Paid Most Recently is the checks the office has marked processed. Of the
  // rest, a deal belongs in Cleared and Verified when its funds have cleared,
  // its checklist is done and at least one compliance side is signed off: a
  // deal with one of two sides verified sits here with its fraction showing
  // rather than being buried. Everything else is Needs Attention, and each row
  // there says what it is waiting on.
  const activeRows = rows.filter(r => !isSettledSibling(r) && !r.agents_paid && !allAgentsPaid(r))
  const bucketOf = (r: PayoutRow) =>
    payoutBucket({ crcTransferred: r.crc_transferred, gates: gatesFor(r) })

  const paidRows      = activeRows.filter(r => bucketOf(r) === 'paid_recently')
  const verifiedRows  = activeRows.filter(r => bucketOf(r) === 'cleared_verified')
  const attentionRows = activeRows.filter(r => bucketOf(r) === 'needs_attention')

  const paidAgentTotal      = paidRows.reduce((s, r) => s + unpaidAgentTotal(r), 0)
  const verifiedAgentTotal  = verifiedRows.reduce((s, r) => s + unpaidAgentTotal(r), 0)
  const attentionAgentTotal = attentionRows.reduce((s, r) => s + unpaidAgentTotal(r), 0)
  const holdAgentTotal      = verifiedAgentTotal + attentionAgentTotal
  const expensesTotal    = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const pmFeesTotal      = pmFees.reduce((s, f) => s + f.amount, 0)
  const landlordTotal    = landlordPayouts.reduce((s, l) => s + l.amount, 0)
  // Landlord disbursements are deliberately NOT in here. That money lives in
  // the trust account, not this one, so subtracting it claimed the payouts
  // account owed something it was never holding. It becomes a claim on this
  // account only once a transfer in from trust has been recorded, and that
  // transfer is a ledger line like any other. Settled spec, section 6.
  const grandTotal       = paidAgentTotal + holdAgentTotal + expensesTotal + pmFeesTotal

  const bank                  = parseFloat(bankBalance) || 0
  const manualHolds           = parseFloat(holds) || 0
  const holdsAmt              = autoHoldsTotal + manualHolds
  const payloadAmt            = autoPayloadTotal
  // Once the ledger is started it IS the balance, and the typed figure stops
  // being the source of truth for this screen. Before that it is still the
  // only figure there is. Both are kept rather than one silently replacing the
  // other, so nobody has to guess which number they are reading.
  const availableFunds        = ledgerStarted ? ledgerBalance : bank
  // Waterfall values for the Bottom Line. What's left is `difference` by
  // construction: totalFunds - grandTotal, just presented top down.
  const totalFunds            = availableFunds + holdsAmt + payloadAmt
  const difference            = totalFunds - grandTotal
  const agentCommissions      = paidAgentTotal + holdAgentTotal
  const brokerageAfterAgents  = totalFunds - agentCommissions
  const afterPM               = brokerageAfterAgents - pmFeesTotal

  const saveBalances = async () => {
    setSavingBalances(true)
    await fetch('/api/admin/payouts-report', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Once the ledger is open the bank figure is no longer typed here, so
      // sending it would stamp bank_balance_updated_at and put a fresh "last
      // balanced" time on the Reconciliation screen that nobody entered.
      body: JSON.stringify(
        ledgerStarted ? { funds_on_hold: holds } : { bank_balance: bankBalance, funds_on_hold: holds }
      ),
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

  // Release keeps the item as history and stops it holding money back.
  // Delete removes it entirely, which loses the reason the account read short.
  const runRecompute = async () => {
    if (recomputing) return
    setRecomputing(true)
    setRecomputeResult(null)
    try {
      let cursor: string | null = null
      let scanned = 0
      let changed = 0
      // Bounded so a bug upstream cannot spin here forever. The in-scope
      // population is a few hundred deals against a default batch of 25.
      for (let batch = 0; batch < 200; batch++) {
        const res: Response = await fetch('/api/admin/transactions/recompute-office-net', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        })
        const json: any = await res.json()
        if (!res.ok) throw new Error(json.error || 'Recompute failed')
        // Keys match what the route actually returns: processed and changed,
        // both numbers, plus next_cursor.
        scanned += json.processed ?? 0
        changed += json.changed ?? 0
        cursor = json.next_cursor ?? null
        if (!cursor) break
      }
      setRecomputeResult(
        `Checked ${scanned} deal${scanned === 1 ? '' : 's'}. ${changed} had a different share than before.`
      )
      load()
    } catch (e: any) {
      setRecomputeResult(e.message)
    } finally {
      setRecomputing(false)
    }
  }

  const releaseExpense = async (id: string) => {
    const res = await fetch('/api/admin/payout-expenses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'release' }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(json.error || 'Could not release that item')
      return
    }
    load()
  }

  // Paid is the third ending, and the only one that moves money. Release stops
  // reserving without changing any balance; Delete says it should never have
  // existed. Neither of those could say a bill actually went out, which is why
  // paying one could not be told apart from cancelling one.
  const openPayExpense = (exp: { id: string; description: string; amount: number | null }) => {
    setPayExpense(exp)
    // Defaults to what was reserved, but it is editable, because the real
    // figure routinely differs. Payload's ACH fee varies every month.
    setPayAmount(exp.amount != null ? String(exp.amount) : '')
    setPayDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
  }

  const confirmPayExpense = async () => {
    if (!payExpense) return
    setPaying(true)
    const res = await fetch('/api/admin/payout-expenses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: payExpense.id,
        action: 'pay',
        amount: payAmount,
        paid_date: payDate,
      }),
    })
    setPaying(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(json.error || 'Could not record that payment')
      return
    }
    setPayExpense(null)
    load()
  }

  const deleteExpense = async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
    await fetch('/api/admin/payout-expenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const openMoveCheck = (row: PayoutRow) => {
    setMoveCheckRow(row)
  }

  const openAgentMarkPaid = (tiaId: string, checkId: string) => {
    const row = rows.find(r => r.check_id === checkId)
    if (!row?.transaction_id) return
    const agent = row.agents.find(a => a.id === tiaId)
    if (!agent) return
    setAgentMarkPaid({
      transactionId: row.transaction_id,
      tia: {
        id: agent.id,
        agent_id: agent.agent_id,
        agent_role: agent.agent_role,
        agent_net: agent.amount,
      },
      name: agent.name,
      isLease: agent.is_lease,
    })
  }

  const openExternalMarkPaid = (externalId: string, checkId: string) => {
    const row = rows.find(r => r.check_id === checkId)
    if (!row) return
    const ext = row.externals.find(e => e.id === externalId)
    if (!ext) return
    setExternalMarkPaid({ externalId, name: ext.name, amount: ext.amount, isLease: ext.is_lease })
    setExternalMarkPaidDate(new Date().toISOString().split('T')[0])
    setExternalMarkPaidMethod('ach')
    setExternalMarkPaidRef('')
  }

  const handleExternalMarkPaid = async () => {
    if (!externalMarkPaid || !externalMarkPaidDate) return
    setExternalSaving(true)
    try {
      const res = await fetch('/api/admin/payouts-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_external_paid',
          external_id: externalMarkPaid.externalId,
          payment_date: externalMarkPaidDate,
          payment_method: externalMarkPaidMethod,
          payment_reference: externalMarkPaidRef || null,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed') }
      setExternalMarkPaid(null)
      load()
    } catch (err: any) {
      alert(err.message || 'Failed to mark paid')
    } finally {
      setExternalSaving(false)
    }
  }

  // Mark paid handlers
  const openMarkPaid = (type: 'pm_fee' | 'landlord', item: PMFee | LandlordPayout) => {
    setMarkPaidType(type)
    setMarkPaidItem(item)
    setMarkPaidDate(new Date().toISOString().split('T')[0])
    setMarkPaidMethod(item.payment_method || 'ach')
  }

  const closeMarkPaid = () => {
    setMarkPaidType(null)
    setMarkPaidItem(null)
    setMarkPaidDate('')
    setMarkPaidMethod('ach')
  }

  const handleMarkPaid = async () => {
    if (!markPaidItem || !markPaidDate || !markPaidType) return

    setMarkPaidSaving(true)
    try {
      const endpoint = markPaidType === 'pm_fee'
        ? `/api/pm/fee-payouts/${markPaidItem.id}`
        : `/api/pm/disbursements/${markPaidItem.id}`

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
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to update')
      }

      // Remove from pending list
      if (markPaidType === 'pm_fee') {
        setPmFees(prev => prev.filter(f => f.id !== markPaidItem.id))
      } else {
        setLandlordPayouts(prev => prev.filter(l => l.id !== markPaidItem.id))
      }
      closeMarkPaid()
    } catch (err: any) {
      alert(err.message || 'Failed to mark as paid')
    } finally {
      setMarkPaidSaving(false)
    }
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
        <div className="flex items-center gap-4">
          <h1 className="page-title">PAYOUTS REPORT</h1>
          <Link href="/admin/reports/all-payouts" className="text-xs text-luxury-accent hover:underline">
            View All Payouts →
          </Link>
          <Link href="/admin/reports/money-movement" className="text-xs text-luxury-accent hover:underline">
            Money Movement →
          </Link>
          <Link href="/admin/reports/reconciliation" className="text-xs text-luxury-accent hover:underline">
            Bank Reconciliation →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDayViewOpen(true)} className="btn btn-secondary text-xs flex items-center gap-1.5">
            <CalendarDays size={13} /> What happened today
          </button>
          <button onClick={load} className="btn btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col">

        <div className="order-2 lg:order-1">
          <PayoutsTable
            rows={paidRows}
            title="Paid Most Recently"
            subtitle="Checks marked processed"
            collapsed={paidCollapsed}
            onToggle={() => setPaidCollapsed(v => !v)}
            dateLabel="Paid"
            dateKey="cleared_date"
            onMarkAgentPaid={openAgentMarkPaid}
            onMarkExternalPaid={openExternalMarkPaid}
            onMoveCheck={openMoveCheck}
          />
          <PayoutsTable
            rows={verifiedRows}
            title="Cleared and Verified"
            subtitle="Funds cleared, checklist done, compliance signed off"
            emptyMessage={CLEARED_VERIFIED_EMPTY}
            collapsed={verifiedCollapsed}
            onToggle={() => setVerifiedCollapsed(v => !v)}
            dateLabel="Cleared"
            dateKey="cleared_date"
            onMarkAgentPaid={openAgentMarkPaid}
            onMarkExternalPaid={openExternalMarkPaid}
            onMoveCheck={openMoveCheck}
          />
          <PayoutsTable
            rows={attentionRows}
            title="Needs Attention"
            subtitle="Not ready to pay yet"
            emptyMessage="Nothing is stuck."
            showWaitingOn
            collapsed={attentionCollapsed}
            onToggle={() => setAttentionCollapsed(v => !v)}
            dateLabel="Cleared"
            dateKey="cleared_date"
            onMarkAgentPaid={openAgentMarkPaid}
            onMarkExternalPaid={openExternalMarkPaid}
            onMoveCheck={openMoveCheck}
          />
        </div>

        {/* Landlord Disbursements */}
        <div className="order-3 lg:order-2">
          <div className="container-card mb-5">
            <button className="w-full flex items-center justify-between" onClick={() => setLandlordCollapsed(v => !v)}>
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Landlord Disbursements</h2>
                <span className="text-xs text-luxury-gray-3">({landlordPayouts.length})</span>
              </div>
              <div className="flex items-center gap-4">
                {landlordTotal > 0 && (
                  <span className="text-xs text-luxury-gray-2">Total: <span className="font-semibold text-luxury-gray-1">{fmt(landlordTotal)}</span></span>
                )}
                {landlordCollapsed ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronUp size={14} className="text-luxury-gray-3" />}
              </div>
            </button>

            {!landlordCollapsed && (
              <div className="mt-4">
                {landlordPayouts.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">No pending landlord disbursements</p>
                ) : (
                  <div className="space-y-1">
                    {landlordPayouts.map(item => (
                      <div key={item.id} className="inner-card flex items-center justify-between py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-luxury-gray-1 font-medium">{item.payee_name}</p>
                          <p className="text-xs text-luxury-gray-3">{item.address} - {item.period}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-medium text-luxury-gray-1">{fmt(item.amount)}</span>
                          <button
                            onClick={() => openMarkPaid('landlord', item)}
                            className="text-xs text-yellow-600 hover:text-green-700 font-medium"
                          >
                            pending
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

        {/* PM Referral Fees */}
        <div className="order-4 lg:order-3">
          <div className="container-card mb-5">
            <button className="w-full flex items-center justify-between" onClick={() => setPmFeesCollapsed(v => !v)}>
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">PM Referral Fees</h2>
                <span className="text-xs text-luxury-gray-3">({pmFees.length})</span>
              </div>
              <div className="flex items-center gap-4">
                {pmFeesTotal > 0 && (
                  <span className="text-xs text-luxury-gray-2">Total: <span className="font-semibold text-luxury-gray-1">{fmt(pmFeesTotal)}</span></span>
                )}
                {pmFeesCollapsed ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronUp size={14} className="text-luxury-gray-3" />}
              </div>
            </button>

            {!pmFeesCollapsed && (
              <div className="mt-4">
                {pmFees.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">No pending PM referral fees</p>
                ) : (
                  <div className="space-y-1">
                    {pmFees.map(fee => (
                      <div key={fee.id} className="inner-card flex items-center justify-between py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-luxury-gray-1 font-medium">{fee.payee_name}</p>
                          <p className="text-xs text-luxury-gray-3">{fee.address} - PM Fee {fee.period}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-medium text-luxury-gray-1">{fmt(fee.amount)}</span>
                          <button
                            onClick={() => openMarkPaid('pm_fee', fee)}
                            className="text-xs text-yellow-600 hover:text-green-700 font-medium"
                          >
                            pending
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

        {/* Also In Payouts */}
        <div className="order-5 lg:order-4">
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
                      {hasPermission('can_manage_ledger') && (
                        <button
                          onClick={() => openPayExpense({ id: exp.id, description: exp.description, amount: exp.amount ?? null })}
                          className="text-xs px-2 py-1 rounded border border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-gray-5/40 transition-colors"
                          title="Record that this money has left the account"
                        >
                          Paid
                        </button>
                      )}
                      {hasPermission('can_manage_ledger') && (
                        <button
                          onClick={() => releaseExpense(exp.id)}
                          className="text-xs px-2 py-1 rounded border border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-gray-5/40 transition-colors"
                          title="Stop holding this money back"
                        >
                          Release
                        </button>
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

        {/* Bottom Line - first on mobile, last on desktop */}
        <div className="order-1 lg:order-5 mb-5">
        <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Bottom Line</h2>

        {/* Verdict bar - the whole report in one line */}
        <div className={`rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3 ${difference < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div>
            <p className={`text-sm font-semibold ${difference < 0 ? 'text-red-600' : 'text-green-700'}`}>
              {difference < 0 ? `Short by ${fmt(Math.abs(difference))} to cover everything queued` : `Covered with ${fmt(difference)} to spare`}
            </p>
            {fmtStamp(balanceUpdatedAt) && (
              <p className={`text-xs mt-0.5 ${difference < 0 ? 'text-red-600/70' : 'text-green-700/70'}`}>Last balanced {fmtStamp(balanceUpdatedAt)}</p>
            )}
          </div>
          <span className={`text-lg font-bold whitespace-nowrap ${difference < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(difference)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Bank balance */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Bank Balance</p>
            {ledgerStarted ? (
              <div className="mb-3">
                <label className="field-label">Payouts account, from the ledger</label>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-luxury-gray-1">{fmt(ledgerBalance)}</span>
                  <Link href="/admin/reports/money-movement" className="text-xs text-luxury-accent hover:underline">
                    See the lines
                  </Link>
                </div>
                <p className="text-xs text-luxury-gray-3 mt-1">
                  Worked out from what came in and went out. Nothing to type. The bank statement is
                  checked against this on the Bank Reconciliation screen.
                </p>
              </div>
            ) : (
              <div className="mb-3">
                <label className="field-label">Payouts account</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-luxury-gray-3">$</span>
                  <input type="number" step="0.01" value={bankBalance} onChange={e => setBankBalance(e.target.value)} className="input-luxury flex-1" placeholder="0.00" />
                </div>
              </div>
            )}

            {/* Holds - auto from uncleared checks, expandable */}
            <button type="button" onClick={() => setHoldsOpen(v => !v)} className="w-full flex items-center justify-between text-sm py-1">
              <span className="text-luxury-gray-2 flex items-center gap-1">
                {holdsOpen ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
                Holds
              </span>
              <span className="font-medium text-luxury-gray-1">{fmt(holdsAmt)}</span>
            </button>
            {holdsOpen && (
              <div className="pl-4 pb-1 space-y-1">
                {bankHoldRows.map(h => (
                  <div key={h.check_id} className="flex justify-between text-xs">
                    <span className="text-luxury-gray-3 truncate pr-2">{h.label}</span>
                    <span className="text-luxury-gray-2 tabular-nums flex-shrink-0">{fmt(h.amount)}</span>
                  </div>
                ))}
                {bankHoldRows.length === 0 && (
                  <p className="text-xs text-luxury-gray-3">No uncleared check holds</p>
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-luxury-gray-3">Other holds (manual)</span>
                  <div className="flex items-center gap-1 w-28">
                    <span className="text-xs text-luxury-gray-3">$</span>
                    <input type="number" step="0.01" value={holds} onChange={e => setHolds(e.target.value)} className="input-luxury text-xs flex-1" placeholder="0.00" />
                  </div>
                </div>
              </div>
            )}

            {/* Pending Payload - expandable breakdown */}
            <button type="button" onClick={() => setPayloadOpen(v => !v)} className="w-full flex items-center justify-between text-sm py-1">
              <span className="text-luxury-gray-2 flex items-center gap-1">
                {payloadOpen ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
                Pending Payload
              </span>
              <span className="font-medium text-luxury-accent">{fmt(payloadAmt)}</span>
            </button>
            {payloadOpen && (
              <div className="pl-4 pb-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">Commission link</span>
                  <span className="text-luxury-gray-2 tabular-nums">{fmt(payloadBreakdown.commission_link)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">Retainer link</span>
                  <span className="text-luxury-gray-2 tabular-nums">{fmt(payloadBreakdown.retainer_link)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">PM rent</span>
                  <span className="text-luxury-gray-2 tabular-nums">{fmt(payloadBreakdown.pm_rent)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">Other Payload checks</span>
                  <span className="text-luxury-gray-2 tabular-nums">{fmt(payloadBreakdown.other)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between text-sm border-t border-luxury-gray-5/50 pt-2 mt-2">
              <span className="text-luxury-gray-2 font-medium">Total funds</span>
              <span className="font-semibold text-luxury-gray-1">{fmt(totalFunds)}</span>
            </div>
            <button onClick={saveBalances} disabled={savingBalances} className="btn btn-primary text-xs px-4 flex items-center gap-1.5 mt-3 disabled:opacity-50">
              <Save size={12} /> {savingBalances ? 'Saving...' : 'Save balances'}
            </button>
          </div>

          {/* Where it goes - waterfall */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Where It Goes</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-luxury-gray-2">Total funds</span>
                <span className="font-medium text-luxury-gray-1">{fmt(totalFunds)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-luxury-gray-2">- Agent commissions</span>
                <span className="font-medium text-luxury-gray-1">-{fmt(agentCommissions)}</span>
              </div>
              <div className="flex justify-between text-sm bg-luxury-gray-5/40 rounded px-2 py-1.5">
                <span className="font-semibold text-luxury-gray-1">Brokerage money after agents paid</span>
                <span className="font-bold text-luxury-accent whitespace-nowrap">{fmt(brokerageAfterAgents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-luxury-gray-2">- PM referral fees</span>
                <span className="font-medium text-luxury-gray-1">-{fmt(pmFeesTotal)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-luxury-gray-5/50 pt-2">
                <span className="text-luxury-gray-2 font-medium">After PM</span>
                <span className="font-semibold text-luxury-gray-1">{fmt(afterPM)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-luxury-gray-2">- Also in payouts</span>
                <span className="font-medium text-luxury-gray-1">-{fmt(expensesTotal)}</span>
              </div>
              <div className={`flex justify-between text-sm rounded px-2 py-1.5 ${difference < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <span className={`font-semibold ${difference < 0 ? 'text-red-600' : 'text-green-700'}`}>What&apos;s left</span>
                <span className={`font-bold whitespace-nowrap ${difference < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(difference)}</span>
              </div>
            </div>

            {/* Our share, still sitting in this account. Deliberately below
                What's left rather than inside the waterfall: it is not an
                obligation, it is money waiting to be collected, and putting it
                in the subtractions above would say the brokerage owes it. */}
            <div className="border-t border-luxury-gray-5/50 mt-3 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-luxury-gray-2">Our share still in this account</p>
                  <p className="text-xs text-luxury-gray-3">Not yet moved to the income account</p>
                </div>
                <span className="text-base font-bold text-luxury-accent whitespace-nowrap">{fmt(unsweptOfficeNet)}</span>
              </div>
              {officeNetUnknown.length > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {officeNetUnknown.length} deal{officeNetUnknown.length === 1 ? '' : 's'} still
                  {officeNetUnknown.length === 1 ? ' has' : ' have'} no share worked out, so
                  {officeNetUnknown.length === 1 ? ' it is' : ' they are'} not counted here.
                </p>
              )}
              {/* This page is gated on can_manage_checks, which support and tc
                  also hold, but moving money and releasing earmarks are gated
                  on can_manage_sweeps and can_manage_ledger, which they do not.
                  Without this they saw live buttons that 403 on click. */}
              {hasPermission('can_manage_sweeps') && recomputeResult && (
                <p className="text-xs text-luxury-gray-3 mt-2">{recomputeResult}</p>
              )}
              {hasPermission('can_manage_sweeps') && (
                <button
                  onClick={runRecompute}
                  disabled={recomputing}
                  className="btn btn-secondary text-xs px-4 flex items-center gap-1.5 mt-3 disabled:opacity-50"
                  title="Re-derive every deal's share through the app's own commission function"
                >
                  {recomputing ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Recheck our share on every deal
                </button>
              )}
              {billsDue14 > 0 && (
                <p className="text-xs text-luxury-gray-3 mt-2">
                  Bills due in the next 14 days: {fmt(billsDue14)}. Not subtracted, shown so a
                  transfer is decided knowing what is about to leave.
                </p>
              )}
              {hasPermission('can_manage_sweeps') && (
                <button
                  onClick={() => setSweepOpen(true)}
                  disabled={unsweptOfficeNet <= 0}
                  className="btn btn-primary text-xs px-4 flex items-center gap-1.5 mt-3 disabled:opacity-50"
                >
                  <ArrowRightLeft size={12} /> Move our share to income
                </button>
              )}
            </div>
          </div>

        </div>
        </div>
        </div>

      </div>

      {sweepOpen && (
        <SweepDialog
          bottomLine={difference}
          onClose={() => setSweepOpen(false)}
          onSwept={() => { setSweepOpen(false); load() }}
        />
      )}

      {dayViewOpen && <DayView onClose={() => setDayViewOpen(false)} />}

      {/* Agent Mark Paid Modal */}
      {agentMarkPaid && (
        <MarkPaidPanelModal
          transactionId={agentMarkPaid.transactionId}
          tia={agentMarkPaid.tia}
          isLease={agentMarkPaid.isLease}
          label={agentMarkPaid.name}
          onClose={() => setAgentMarkPaid(null)}
          onMarked={() => { setAgentMarkPaid(null); load() }}
        />
      )}

      {/* Record a payment against an item in Also In Payouts. The amount is
          editable because the figure that actually leaves the bank routinely
          differs from the one that was reserved. */}
      {payExpense && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
              <div>
                <h2 className="text-sm font-semibold text-luxury-gray-1">Record This As Paid</h2>
                <p className="text-xs text-luxury-gray-3 mt-0.5">{payExpense.description}</p>
              </div>
              <button onClick={() => setPayExpense(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Amount that left *</label>
                  <input type="number" step="0.01" className="input-luxury text-xs" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="field-label">Date it left *</label>
                  <input type="date" className="input-luxury text-xs" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-luxury-gray-3">
                This takes the money out of the ledger. To stop holding it back without paying
                anything, use Release instead.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setPayExpense(null)} disabled={paying} className="btn btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={confirmPayExpense} disabled={paying || !payAmount || !payDate} className="btn btn-primary text-xs flex-1">{paying ? 'Saving...' : 'Confirm Paid'}</button>
            </div>
          </div>
        </div>
      )}

      {/* External Mark Paid Modal */}
      {externalMarkPaid && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
              <div>
                <h2 className="text-sm font-semibold text-luxury-gray-1">Mark External Paid</h2>
                <p className="text-xs text-luxury-gray-3 mt-0.5">{externalMarkPaid.name} &middot; {externalMarkPaid.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>
              </div>
              <button onClick={() => setExternalMarkPaid(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Payment date *</label>
                  <input type="date" className="input-luxury text-xs" value={externalMarkPaidDate} onChange={e => setExternalMarkPaidDate(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Method</label>
                  <select className="select-luxury text-xs" value={externalMarkPaidMethod} onChange={e => setExternalMarkPaidMethod(e.target.value)}>
                    {PAYMENT_METHOD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="field-label">Reference</label>
                  <input type="text" className="input-luxury text-xs" value={externalMarkPaidRef} onChange={e => setExternalMarkPaidRef(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setExternalMarkPaid(null)} disabled={externalSaving} className="btn btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={handleExternalMarkPaid} disabled={externalSaving || !externalMarkPaidDate} className="btn btn-primary text-xs flex-1">{externalSaving ? 'Saving...' : 'Confirm Paid'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal (PM fee / landlord) */}
      {markPaidItem && markPaidType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-luxury-gray-1">
                Mark {markPaidType === 'landlord' ? 'Landlord Disbursement' : 'PM Fee'} as Paid
              </h2>
              <p className="text-sm text-luxury-gray-3 mt-1">{markPaidItem.payee_name} - {fmt(markPaidItem.amount)}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="field-label">Payment Date *</label>
                <input
                  type="date"
                  value={markPaidDate}
                  onChange={e => setMarkPaidDate(e.target.value)}
                  className="input-luxury w-full"
                  required
                />
              </div>
              <div>
                <label className="field-label">Payment Method</label>
                <select
                  value={markPaidMethod}
                  onChange={e => setMarkPaidMethod(e.target.value)}
                  className="select-luxury w-full"
                >
                  <option value="ach">ACH</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire</option>
                  <option value="zelle">Zelle</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={closeMarkPaid}
                className="btn btn-secondary"
                disabled={markPaidSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markPaidSaving || !markPaidDate}
                className="btn btn-primary flex items-center gap-2"
              >
                {markPaidSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {moveCheckRow && (
        <MoveCheckModal
          checkId={moveCheckRow.check_id}
          checkLabel={`${fmt(moveCheckRow.check_amount)} check`}
          currentAddress={moveCheckRow.address}
          onClose={() => setMoveCheckRow(null)}
          onMoved={() => {
            setMoveCheckRow(null)
            load()
          }}
        />
      )}
    </div>
  )
}


