'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Undo2 } from 'lucide-react'
import { LEDGER_CATEGORIES, ledgerCategoryLabel } from '@/lib/payouts/ledger'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/transactions/constants'
import { useAuth } from '@/lib/context/AuthContext'

// The payouts account ledger. Every line explains the balance, and the balance
// is their sum.
//
// Courtney reaches this from the Full ledger link on her day view, so nothing
// here shows a raw category: the API sends a plain-English label with every
// row. A sweep covering four deals is one line that opens into the four.

interface LedgerRow {
  id: string
  entry_date: string
  category: string
  category_label: string
  direction: 'in' | 'out' | 'none'
  description: string
  amount: number
  transaction_id: string | null
  bank_reference: string | null
  payment_method: string | null
  payment_method_label: string
  reconciled: boolean
  notes: string | null
  children: LedgerRow[]
  warnings: { transaction_id: string | null; property_address: string | null; warning: string }[]
}

interface SinceLast {
  since_date: string
  ledger: number
  holds: number
  payload: number
  unswept: number
  bank_typed: number
}

interface Totals {
  opening: number
  in: number
  out: number
  swept: number
  closing: number
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
}

function formatDate(d: string | null): string {
  if (!d) return '-'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// A single overnight change. Zero is stated rather than hidden, because "this
// did not move" is information on a screen whose job is explaining movement.
function Change({ label, amount }: { label: string; amount: number }) {
  const cls =
    amount > 0 ? 'text-green-700' : amount < 0 ? 'text-red-700' : 'text-luxury-gray-2'
  return (
    <div>
      <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold ${cls}`}>
        {amount > 0 ? '+' : ''}
        {formatCurrency(amount)}
      </p>
      {amount === 0 && <p className="text-xs text-luxury-gray-3">No change</p>}
    </div>
  )
}

export default function MoneyMovementPage() {
  const { hasPermission } = useAuth()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [totals, setTotals] = useState<Totals>({ opening: 0, in: 0, out: 0, swept: 0, closing: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Undoing a transfer. Without this the reversal endpoint has no way in, and
  // a transfer recorded by mistake can only be unpicked by hand in the
  // database, which is how a ledger stops being a ledger.
  // What changed since last night's snapshot. Null when no snapshot exists
  // yet, which is different from "nothing changed" and has to read differently.
  const [since, setSince] = useState<SinceLast | null>(null)
  const [snapshotChecked, setSnapshotChecked] = useState(false)
  // Adding a line by hand. Without this the ledger had no writer reachable
  // from any screen: the opening balance, a bill paid, a correction, all of
  // them had a route and no way in. The first entry anyone needs is the
  // opening balance, and until it exists the account reads as zero.
  const [adding, setAdding] = useState(false)
  const [ledgerStarted, setLedgerStarted] = useState<boolean | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [startBalance, setStartBalance] = useState('')
  const [starting, setStarting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [addCategory, setAddCategory] = useState('opening_balance')
  const [addAmount, setAddAmount] = useState('')
  const [addDate, setAddDate] = useState(today())
  const [addDescription, setAddDescription] = useState('')
  const [addMethod, setAddMethod] = useState('')
  const [addReference, setAddReference] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [undoing, setUndoing] = useState<LedgerRow | null>(null)
  const [undoReason, setUndoReason] = useState('')
  const [undoSaving, setUndoSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ledger?from=${from}&to=${to}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not load the ledger')
      }
      const json = await res.json()
      setRows(json.entries || [])
      setTotals(json.totals || { opening: 0, in: 0, out: 0, swept: 0, closing: 0 })
      // An empty list cannot tell a ledger that has not been opened apart from
      // a quiet fortnight, so the route says which it is.
      setLedgerStarted(!!json.started)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  // Separate from the ledger read: this compares against last night rather
  // than against the date range, so it does not change when the range does.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/snapshots?days=1')
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled) return
        setSince(json?.since ?? null)
        setSnapshotChecked(true)
      })
      .catch(() => {
        if (!cancelled) setSnapshotChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const undo = async () => {
    if (!undoing) return
    setUndoSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/sweeps/${undoing.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: undoReason || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not undo that transfer')
      setUndoing(null)
      setUndoReason('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUndoSaving(false)
    }
  }

  const addEntry = async () => {
    setAddSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: addCategory,
          amount: addAmount,
          entry_date: addDate,
          description: addDescription,
          payment_method: addMethod || null,
          bank_reference: addReference || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not add that line')
      setAdding(false)
      setAddAmount('')
      setAddDescription('')
      setAddMethod('')
      setAddReference('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAddSaving(false)
    }
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // The API sends newest first, which is how a person reads a register. A
  // running balance has to accumulate oldest first, so build it once here and
  // look it up rather than recomputing per row.
  const ascending = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const balanceAfter: Record<string, number> = {}
  let running = totals.opening
  for (const r of ascending) {
    if (r.direction === 'in') running += r.amount
    else if (r.direction === 'out') running -= r.amount
    balanceAfter[r.id] = Math.round(running * 100) / 100
  }

  // Catch-up is idempotent, so pressing it twice is harmless. It exists
  // because "is the ledger current?" is a question asked while looking at the
  // screen, and the honest answer has to be available then rather than after
  // the next nightly run.
  async function runSync() {
    setSyncing(true)
    setSyncNote(null)
    const res = await fetch('/api/admin/ledger/sync', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setSyncing(false)
    if (!res.ok) {
      setSyncNote(json.error || 'Could not catch the ledger up')
      return
    }
    const added =
      (json.deposits?.added || 0) + (json.agent_payouts?.added || 0) + (json.external_payouts?.added || 0)
    const removed =
      (json.deposits?.reversed || 0) + (json.agent_payouts?.reversed || 0) + (json.external_payouts?.reversed || 0)
    const review: string[] = json.left_for_review || []
    const base =
      added === 0 && removed === 0
        ? 'Already up to date.'
        : `Added ${added} line${added === 1 ? '' : 's'}${removed ? `, removed ${removed}` : ''}.`
    // Saying "Already up to date" while the sync knows some records could not
    // be posted is a false statement on the one screen anybody checks.
    setSyncNote(
      review.length > 0
        ? `${base} ${review.length} record${review.length === 1 ? '' : 's'} could not be posted and need a look.`
        : base
    )
    load()
  }

  async function startLedger() {
    setStarting(true)
    const res = await fetch('/api/admin/ledger/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_balance: startBalance }),
    })
    const json = await res.json().catch(() => ({}))
    setStarting(false)
    if (!res.ok) {
      alert(json.error || 'Could not start the ledger')
      return
    }
    setStartOpen(false)
    setLedgerStarted(true)
    load()
  }

  return (
    <div className="min-h-screen bg-luxury-cream p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/reports" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="page-title">Money Movement</h1>
          {hasPermission('can_manage_ledger') && ledgerStarted === false && (
            <button onClick={() => setStartOpen(true)} className="btn btn-primary text-xs flex items-center gap-1.5">
              Start the ledger
            </button>
          )}
          {hasPermission('can_manage_ledger') && ledgerStarted === true && (
            <button
              onClick={runSync}
              disabled={syncing}
              className="btn btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Look for anything that has happened but is not on the ledger yet"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Catch up the ledger
            </button>
          )}
          <Link href="/admin/reports/payouts" className="text-xs text-luxury-accent hover:underline">
            Payouts Report
          </Link>
          <Link href="/admin/reports/reconciliation" className="text-xs text-luxury-accent hover:underline">
            Bank Reconciliation
          </Link>
        </div>

        {syncNote && (
          <p className="text-xs text-luxury-gray-3 mb-4">{syncNote}</p>
        )}

        {startOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
              <div className="px-5 py-4 border-b border-luxury-gray-5">
                <h3 className="text-sm font-semibold text-luxury-gray-1">Start the ledger</h3>
                <p className="text-xs text-luxury-gray-3 mt-0.5">
                  From today, the balance is worked out from what comes in and goes out instead of
                  being typed.
                </p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="field-label">The bank's balance at the start of today</label>
                  <input
                    type="number"
                    step="0.01"
                    value={startBalance}
                    onChange={e => setStartBalance(e.target.value)}
                    className="input-luxury w-full text-xs"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-luxury-gray-3">
                  Use today's opening figure, not the balance right now. Everything dated today gets
                  added on top of it, so a mid-morning figure would count this morning's activity
                  twice.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-luxury-gray-5">
                <button onClick={() => setStartOpen(false)} disabled={starting} className="btn btn-secondary text-xs">Cancel</button>
                <button onClick={startLedger} disabled={starting || !startBalance} className="btn btn-primary text-xs">
                  {starting ? 'Starting...' : 'Start the ledger'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="container-card">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Opening</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(totals.opening)}</p>
            <p className="text-xs text-luxury-gray-3">before {formatDate(from)}</p>
          </div>
          <div className="container-card">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Came In</p>
            <p className="text-xl font-semibold text-green-700">{formatCurrency(totals.in)}</p>
          </div>
          <div className="container-card">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Went Out</p>
            <p className="text-xl font-semibold text-red-700">{formatCurrency(totals.out)}</p>
          </div>
          <div className="container-card">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Moved To Income</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(totals.swept)}</p>
          </div>
          <div className="container-card">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Closing</p>
            <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(totals.closing)}</p>
            <p className="text-xs text-luxury-gray-3">to {formatDate(to)}</p>
          </div>
        </div>

        {/* What moved overnight. The account is photographed every night, so a
            change since then is read by subtraction rather than reconstructed,
            which is the whole reason the nightly job exists. */}
        {snapshotChecked && (
          <div className="container-card mb-6">
            {since ? (
              <>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-luxury-gray-1">
                    Since {formatDate(since.since_date)}
                  </h2>
                  <span className="text-xs text-luxury-gray-3">Compared with the nightly snapshot</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Change label="In the account" amount={since.ledger} />
                  <Change label="On hold at bank" amount={since.holds} />
                  <Change label="On hold at Payload" amount={since.payload} />
                  <Change label="Our share not yet moved" amount={since.unswept} />
                </div>
              </>
            ) : (
              <p className="text-xs text-luxury-gray-3">
                No overnight snapshot yet. The first one is taken tonight, and from then on this
                shows what moved while nobody was watching.
              </p>
            )}
          </div>
        )}

        <div className="container-card mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-luxury-gray-3 uppercase tracking-wide mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="input-luxury"
              />
            </div>
            <div>
              <label className="block text-xs text-luxury-gray-3 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="input-luxury"
              />
            </div>
            <button onClick={load} className="btn btn-secondary flex items-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            {hasPermission('can_manage_ledger') && (
              <button onClick={() => setAdding(true)} className="btn btn-primary flex items-center gap-2">
                <Plus size={14} />
                Add a line
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="container-card mb-6 border-l-4 border-l-red-500">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="container-card">
          {loading ? (
            <p className="text-center py-12 text-luxury-gray-3">Loading the ledger...</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-luxury-gray-3">Nothing moved in this account between those dates.</p>
              <p className="text-xs text-luxury-gray-3 mt-1">
                Every deposit, payment, bill and transfer appears here once it is recorded.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-luxury-gray-5">
                    <th className="th-luxury text-left">Date</th>
                    <th className="th-luxury text-left">What happened</th>
                    <th className="th-luxury text-left">Detail</th>
                    <th className="th-luxury text-right">In</th>
                    <th className="th-luxury text-right">Out</th>
                    <th className="th-luxury text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const isOpen = expanded.has(row.id)
                    const hasChildren = row.children.length > 0
                    return (
                      <Fragment key={row.id}>
                        <tr className="tr-luxury">
                          <td className="py-3 px-4 text-luxury-gray-3 whitespace-nowrap">
                            {formatDate(row.entry_date)}
                          </td>
                          <td className="py-3 px-4 font-medium text-luxury-gray-1">
                            {hasChildren ? (
                              <button
                                onClick={() => toggle(row.id)}
                                className="inline-flex items-center gap-1 hover:text-luxury-accent"
                              >
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {row.category_label}
                                <span className="text-xs text-luxury-gray-3">
                                  ({row.children.length} deal{row.children.length === 1 ? '' : 's'})
                                </span>
                                {row.warnings.length > 0 && (
                                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                    {row.warnings.length} flagged
                                  </span>
                                )}
                              </button>
                            ) : (
                              row.category_label
                            )}
                          </td>
                          <td className="py-3 px-4 text-luxury-gray-2">
                            {row.description}
                            {row.payment_method_label && (
                              <span className="text-xs text-luxury-gray-3 ml-2">
                                by {row.payment_method_label}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-green-700">
                            {row.direction === 'in' ? formatCurrency(row.amount) : ''}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-red-700">
                            {row.direction === 'out' ? formatCurrency(row.amount) : ''}
                          </td>
                          <td className="py-3 px-4 text-right text-luxury-gray-1">
                            {formatCurrency(balanceAfter[row.id] ?? 0)}
                            {row.category === 'sweep' && hasPermission('can_manage_sweeps') && (
                              <button
                                onClick={() => { setUndoing(row); setUndoReason('') }}
                                className="ml-3 text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                                title="Undo this transfer"
                              >
                                <Undo2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && row.warnings.length > 0 && (
                          <tr className="bg-amber-50">
                            <td className="py-2 px-4"></td>
                            <td className="py-2 px-4 pl-10 text-xs text-amber-700">Flagged at the time</td>
                            <td className="py-2 px-4 text-xs text-amber-700" colSpan={4}>
                              {row.warnings.map((w, i) => (
                                <span key={`${w.transaction_id}-${i}`} className="block">
                                  {w.property_address || 'A deal'}: {w.warning}
                                </span>
                              ))}
                            </td>
                          </tr>
                        )}
                        {isOpen &&
                          row.children.map(child => (
                            <tr key={child.id} className="bg-luxury-cream">
                              <td className="py-2 px-4"></td>
                              <td className="py-2 px-4 pl-10 text-xs text-luxury-gray-3">Deal</td>
                              <td className="py-2 px-4 text-xs text-luxury-gray-2">
                                {child.transaction_id ? (
                                  <Link
                                    href={`/admin/transactions/${child.transaction_id}`}
                                    className="text-luxury-accent hover:underline"
                                  >
                                    {child.description}
                                  </Link>
                                ) : (
                                  child.description
                                )}
                              </td>
                              <td className="py-2 px-4"></td>
                              <td className="py-2 px-4 text-right text-xs text-luxury-gray-2">
                                {formatCurrency(child.amount)}
                              </td>
                              <td className="py-2 px-4"></td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-luxury-gray-5">
              <h3 className="text-sm font-semibold text-luxury-gray-1">Add a line</h3>
              <p className="text-xs text-luxury-gray-3 mt-0.5">
                For anything that moved which the app did not record itself.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="field-label">What happened</label>
                <select
                  value={addCategory}
                  onChange={e => setAddCategory(e.target.value)}
                  className="select-luxury w-full text-xs"
                >
                  {/* Sweeps and their reversals are recorded by the sweep
                      dialog, which reads the amount from the deal. The route
                      refuses them here, so they are not offered. */}
                  {LEDGER_CATEGORIES.filter(c => c !== 'sweep' && c !== 'sweep_reversal').map(c => (
                    <option key={c} value={c}>{ledgerCategoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={addAmount}
                  onChange={e => setAddAmount(e.target.value)}
                  className="input-luxury w-full text-xs"
                />
              </div>
              <div>
                <label className="field-label">Date</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={e => setAddDate(e.target.value)}
                  className="input-luxury w-full text-xs"
                />
              </div>
              <div>
                <label className="field-label">Detail</label>
                <input
                  type="text"
                  value={addDescription}
                  onChange={e => setAddDescription(e.target.value)}
                  placeholder="Opening balance at cutover"
                  className="input-luxury w-full text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">How it moved</label>
                  <select
                    value={addMethod}
                    onChange={e => setAddMethod(e.target.value)}
                    className="select-luxury w-full text-xs"
                  >
                    <option value="">Not recorded</option>
                    {PAYMENT_METHOD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Bank reference</label>
                  <input
                    type="text"
                    value={addReference}
                    onChange={e => setAddReference(e.target.value)}
                    className="input-luxury w-full text-xs"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-luxury-gray-5">
              <button onClick={() => setAdding(false)} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={addEntry}
                disabled={addSaving || !addAmount || !addDescription}
                className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {addSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Add the line
              </button>
            </div>
          </div>
        </div>
      )}

      {undoing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-luxury-gray-5">
              <h3 className="text-sm font-semibold text-luxury-gray-1">Undo this transfer</h3>
              <p className="text-xs text-luxury-gray-3 mt-0.5">
                {formatCurrency(undoing.amount)} on {formatDate(undoing.entry_date)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-luxury-gray-2 mb-3">
                This writes a line putting the money back and reopens the deals so their share can
                be moved again. Nothing is deleted, so the original transfer stays on the record. A
                deal that has already been moved again since is left alone.
              </p>
              <label className="field-label">Why (optional)</label>
              <input
                type="text"
                value={undoReason}
                onChange={e => setUndoReason(e.target.value)}
                className="input-luxury w-full text-xs"
                placeholder="Recorded against the wrong deals"
              />
              <p className="text-xs text-luxury-gray-3 mt-3">
                This records the undo. Move the money back in the bank as well.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-luxury-gray-5">
              <button onClick={() => setUndoing(null)} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={undo}
                disabled={undoSaving}
                className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {undoSaving ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                Undo the transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
