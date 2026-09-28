'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Receipt } from 'lucide-react'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/transactions/constants'

// Recording bills as paid.
//
// Deliberately not a list of what is due. A bill that is due has not left the
// bank, and a screen that pre-ticks the month's bills invites recording money
// that never moved. So: every active bill is offered, none is ticked, and
// nothing is written until somebody picks.
//
// The amount is prefilled with what the bill usually costs and is editable,
// because Payload's ACH fees vary every month and rent changes mid-lease. What
// gets recorded is what actually left; the stored figure is never touched.
//
// Shared between Money Movement and the Payouts Report. The same act from two
// screens has to produce the same record, and two copies of this would drift.

type Bill = {
  id: string
  name: string
  usual_amount: number
  account: string
  last_paid: { amount: number; paid_date: string } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

function todayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function BillPaymentDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  /** Called after a successful write so the caller can reload its own figures. */
  onSaved: () => void
}) {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** Keyed by bill id. Held as strings so a half-typed figure is not clobbered. */
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [paidDate, setPaidDate] = useState(todayCentral())
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bill-payments')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load the bills')
      const list: Bill[] = json.bills || []
      setBills(list)
      const seed: Record<string, string> = {}
      for (const b of list) seed[b.id] = b.usual_amount ? String(b.usual_amount) : ''
      setAmounts(seed)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = bills
    .filter(b => picked.has(b.id))
    .reduce((s, b) => s + (Number(amounts[b.id]) || 0), 0)

  const everyPickedHasAmount = bills
    .filter(b => picked.has(b.id))
    .every(b => Number(amounts[b.id]) > 0)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bill-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid_date: paidDate,
          payment_method: method || null,
          reference: reference || null,
          bills: bills
            .filter(b => picked.has(b.id))
            .map(b => ({ recurring_bill_id: b.id, amount: Number(amounts[b.id]) })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not record those')
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl max-h-[92vh] sm:max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-luxury-gray-5">
          <h3 className="text-sm font-semibold text-luxury-gray-1">Record a bill payment</h3>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Pick what you paid and correct the amount if it came to something else. Each one
            becomes a line on the ledger.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-xs text-red-700 mb-3">{error}</p>}

          {loading ? (
            <p className="text-xs text-luxury-gray-3 text-center py-8">Loading...</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 py-6 text-center">
              No active bills are set up. Add them in Settings, under Recurring Bills.
            </p>
          ) : (
            <div className="space-y-2">
              {bills.map(b => {
                const on = picked.has(b.id)
                return (
                  <div key={b.id} className={on ? 'inner-card' : 'inner-card opacity-70'}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(b.id)}
                        className="h-4 w-4 mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-luxury-gray-1">{b.name}</p>
                        <p className="text-xs text-luxury-gray-3">
                          Usually {fmt(b.usual_amount)}
                          {b.last_paid
                            ? ` - last paid ${fmt(b.last_paid.amount)} on ${shortDate(
                                b.last_paid.paid_date
                              )}`
                            : ' - never recorded'}
                        </p>
                      </div>
                    </label>
                    {on && (
                      <div className="mt-2 pl-7">
                        <label className="field-label">What actually left *</label>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={amounts[b.id] ?? ''}
                          onChange={e => setAmounts({ ...amounts, [b.id]: e.target.value })}
                          className="input-luxury w-full text-xs"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && bills.length > 0 && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="field-label">Date it left</label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                  className="input-luxury w-full text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">How it moved</label>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    className="select-luxury w-full text-xs"
                  >
                    <option value="">Not recorded</option>
                    {PAYMENT_METHOD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Bank reference (optional)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="input-luxury w-full text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-luxury-gray-5 px-5 py-4">
          {picked.size > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-luxury-gray-3">
                {picked.size} bill{picked.size === 1 ? '' : 's'}
              </span>
              <span className="text-sm font-semibold text-luxury-gray-1 tabular-nums">
                {fmt(total)}
              </span>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              onClick={onClose}
              className="btn btn-secondary text-xs w-full sm:w-auto justify-center"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || picked.size === 0 || !everyPickedHasAmount}
              className="btn btn-primary text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 w-full sm:w-auto"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}
              Record {picked.size > 0 ? fmt(total) : 'the payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
