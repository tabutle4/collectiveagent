'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'

// Bank reconciliation for the payouts account.
//
// Three pots, each tying on its own. Two mistakes of the same size in
// different pots cancel out in a single grand total, so a period can close
// clean while being wrong in two places. Tying each pot separately also names
// the pot before anyone starts hunting.
//
// The outstanding list is what keeps this usable through payroll. Payroll
// lands on the 15th and the last day, the same days this gets reconciled, so
// without it the period shows a gap twice a month with no visible cause.

interface Pot {
  label: string
  typed: number
  app: number
  difference: number
  ties: boolean
}

interface HoldLine {
  check_id: string
  label: string
  amount: number
}

interface PayloadBreakdown {
  commission_link: number
  retainer_link: number
  pm_rent: number
  other: number
  total: number
}

interface Outstanding {
  id: string
  entry_date: string
  description: string
  amount: number
  category: string
}

interface ReconData {
  pots: Pot[]
  all_tie: boolean
  totals: { typed: number; app: number }
  hold_lines: HoldLine[]
  payload_breakdown: PayloadBreakdown
  outstanding: Outstanding[]
  last_typed_at: string | null
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

export default function ReconciliationPage() {
  const { hasPermission } = useAuth()
  const [data, setData] = useState<ReconData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [available, setAvailable] = useState('')
  const [onHold, setOnHold] = useState('')
  const [payloadHold, setPayloadHold] = useState('')
  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/reconciliation')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not load reconciliation')
      }
      const json: ReconData = await res.json()
      setData(json)
      setAvailable(String(json.pots[0]?.typed ?? 0))
      setOnHold(String(json.pots[1]?.typed ?? 0))
      setPayloadHold(String(json.pots[2]?.typed ?? 0))
      setCheckedOff(new Set())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_balance: available,
          funds_on_hold: onHold,
          payload_pending_balance: payloadHold,
          reconciled_entry_ids: Array.from(checkedOff),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save')
      setMessage(
        json.reconciled > 0
          ? `Saved. ${json.reconciled} line${json.reconciled === 1 ? '' : 's'} marked as cleared the bank.`
          : 'Saved.'
      )
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: string) => {
    setCheckedOff(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-luxury-cream p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/reports" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="page-title">Bank Reconciliation</h1>
          <Link href="/admin/reports/money-movement" className="text-xs text-luxury-accent hover:underline">
            Money Movement
          </Link>
          <Link href="/admin/reports/payouts" className="text-xs text-luxury-accent hover:underline">
            Payouts Report
          </Link>
        </div>

        {error && (
          <div className="container-card mb-6 border-l-4 border-l-red-500">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {message && (
          <div className="container-card mb-6 border-l-4 border-l-green-500">
            <p className="text-sm text-green-700">{message}</p>
          </div>
        )}

        {loading ? (
          <div className="container-card">
            <p className="text-center py-12 text-luxury-gray-3">Loading...</p>
          </div>
        ) : !data ? null : (
          <>
            <div className="container-card mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-luxury-gray-1">Three pots</h2>
                  <p className="text-xs text-luxury-gray-3">
                    Type what the bank and Payload show. Each pot has to match on its own.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {data.all_tie ? (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                      <CheckCircle size={12} /> All three tie
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> Something does not tie
                    </span>
                  )}
                  <button onClick={load} className="btn btn-secondary flex items-center gap-2">
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="th-luxury text-left">Pot</th>
                      <th className="th-luxury text-right">What the statement says</th>
                      <th className="th-luxury text-right">What the app says</th>
                      <th className="th-luxury text-right">Difference</th>
                      <th className="th-luxury text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pots.map((pot, i) => {
                      const value = i === 0 ? available : i === 1 ? onHold : payloadHold
                      const setter = i === 0 ? setAvailable : i === 1 ? setOnHold : setPayloadHold
                      return (
                        <tr key={pot.label} className="tr-luxury">
                          <td className="py-3 px-4 font-medium text-luxury-gray-1">{pot.label}</td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={value}
                              onChange={e => setter(e.target.value)}
                              readOnly={!hasPermission('can_manage_reconciliation')}
                              className="input-luxury text-right w-40"
                            />
                          </td>
                          <td className="py-3 px-4 text-right text-luxury-gray-1">
                            {formatCurrency(pot.app)}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-medium ${
                              pot.ties ? 'text-luxury-gray-3' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(pot.difference)}
                          </td>
                          <td className="py-3 px-4">
                            {pot.ties ? (
                              <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                                Ties
                              </span>
                            ) : (
                              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Off by {formatCurrency(Math.abs(pot.difference))}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-luxury-gray-5">
                      <td className="py-3 px-4 font-semibold text-luxury-gray-1">Total</td>
                      <td className="py-3 px-4 text-right font-semibold text-luxury-gray-1">
                        {formatCurrency(data.totals.typed)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-luxury-gray-1">
                        {formatCurrency(data.totals.app)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-luxury-gray-1">
                        {formatCurrency(data.totals.typed - data.totals.app)}
                      </td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-luxury-gray-3">
                  {data.last_typed_at
                    ? `Last saved ${new Date(data.last_typed_at).toLocaleString('en-US')}`
                    : 'Never saved'}
                </p>
                {/* Viewing is can_view_reconciliation, which support and tc
                    hold; saving is can_manage_reconciliation, which they do
                    not. They could read the page and press a button that
                    403s. */}
                {hasPermission('can_manage_reconciliation') ? (
                  <button onClick={save} disabled={saving} className="btn btn-primary flex items-center gap-2">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Save reconciliation
                  </button>
                ) : (
                  <p className="text-xs text-luxury-gray-3">View only</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="container-card">
                <h2 className="text-lg font-semibold text-luxury-gray-1 mb-1">On hold at bank</h2>
                <p className="text-xs text-luxury-gray-3 mb-4">
                  Checks that have come in but have not cleared yet.
                </p>
                {data.hold_lines.length === 0 ? (
                  <p className="text-sm text-luxury-gray-3 py-4">Nothing is on hold.</p>
                ) : (
                  <div className="space-y-2">
                    {data.hold_lines.map(line => (
                      <div
                        key={line.check_id}
                        className="flex items-center justify-between text-sm border-b border-luxury-gray-5 pb-2"
                      >
                        <span className="text-luxury-gray-2">{line.label}</span>
                        <span className="text-luxury-gray-1 font-medium">
                          {formatCurrency(line.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="container-card">
                <h2 className="text-lg font-semibold text-luxury-gray-1 mb-1">On hold at Payload</h2>
                <p className="text-xs text-luxury-gray-3 mb-4">
                  Payments taken through Payload whose funds have not settled.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between border-b border-luxury-gray-5 pb-2">
                    <span className="text-luxury-gray-2">Commission pay link</span>
                    <span className="text-luxury-gray-1 font-medium">
                      {formatCurrency(data.payload_breakdown.commission_link)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-luxury-gray-5 pb-2">
                    <span className="text-luxury-gray-2">Retainer pay link</span>
                    <span className="text-luxury-gray-1 font-medium">
                      {formatCurrency(data.payload_breakdown.retainer_link)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-luxury-gray-5 pb-2">
                    <span className="text-luxury-gray-2">Property management rent</span>
                    <span className="text-luxury-gray-1 font-medium">
                      {formatCurrency(data.payload_breakdown.pm_rent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-luxury-gray-5 pb-2">
                    <span className="text-luxury-gray-2">Other links</span>
                    <span className="text-luxury-gray-1 font-medium">
                      {formatCurrency(data.payload_breakdown.other)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-luxury-gray-1 font-semibold">Total</span>
                    <span className="text-luxury-gray-1 font-semibold">
                      {formatCurrency(data.payload_breakdown.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="container-card">
              <h2 className="text-lg font-semibold text-luxury-gray-1 mb-1">
                Not yet checked off ({data.outstanding.length})
              </h2>
              <p className="text-xs text-luxury-gray-3 mb-4">
                Ledger lines that have not been matched to the statement. Tick the ones you can see
                on the statement, then save. Payroll usually sits here for a day or two, and that is
                normal.
              </p>
              {data.outstanding.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 py-4">
                  Every line has been matched to a statement.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-luxury-gray-5">
                        <th className="th-luxury text-left w-10"></th>
                        <th className="th-luxury text-left">Date</th>
                        <th className="th-luxury text-left">Detail</th>
                        <th className="th-luxury text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.outstanding.map(row => (
                        <tr key={row.id} className="tr-luxury">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={checkedOff.has(row.id)}
                              onChange={() => toggle(row.id)}
                              disabled={!hasPermission('can_manage_reconciliation')}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="py-3 px-4 text-luxury-gray-3 whitespace-nowrap">
                            {formatDate(row.entry_date)}
                          </td>
                          <td className="py-3 px-4 text-luxury-gray-2">{row.description}</td>
                          <td className="py-3 px-4 text-right text-luxury-gray-1">
                            {formatCurrency(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
