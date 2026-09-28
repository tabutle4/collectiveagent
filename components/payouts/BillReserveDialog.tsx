'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Receipt } from 'lucide-react'

// Putting a recurring bill into Also In Payouts by picking it.
//
// This reserves, it does not pay. The row it creates holds its amount back
// from the bottom line and nothing reaches the ledger, because nothing has
// left the bank yet. Paying is the Paid button already on each row in Also In
// Payouts, which asks what actually left and writes the ledger line then.
//
// Keeping those two acts apart is the point. A bill that is due has not been
// paid, and a screen that recorded it as paid the moment it was scheduled
// would be stating a payment nobody made.
//
// Nothing is pre-ticked. The amount defaults to what the bill usually costs
// and is editable, because a reservation is a guess and Payload's fees vary;
// the figure that ends up on the ledger is typed again at Paid time, so a
// wrong guess here cannot become a wrong ledger line later.

type Bill = {
  id: string
  name: string
  usual_amount: number
  /** Already waiting in Also In Payouts, so it cannot be reserved again. */
  pending: boolean
  last_paid: { amount: number; paid_at: string } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  })
}

export default function BillReserveDialog({
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/payout-expenses')
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
      const ids = bills.filter(b => picked.has(b.id)).map(b => b.id)
      const res = await fetch('/api/admin/payout-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recurring_bill_ids: ids,
          amounts: Object.fromEntries(ids.map(id => [id, Number(amounts[id])])),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not add those')
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const selectable = bills.filter(b => !b.pending)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl max-h-[92vh] sm:max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-luxury-gray-5">
          <h3 className="text-sm font-semibold text-luxury-gray-1">Add a bill to Also In Payouts</h3>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            This holds the money back. Press Paid on the row later, when it has actually left, and
            the ledger line is written then.
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
          ) : selectable.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 py-6 text-center">
              Every bill is already waiting in Also In Payouts.
            </p>
          ) : (
            <div className="space-y-2">
              {bills.map(b => {
                const on = picked.has(b.id)
                if (b.pending) {
                  return (
                    <div key={b.id} className="inner-card opacity-60">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-luxury-gray-1">{b.name}</p>
                        <span className="text-xs text-luxury-gray-3 flex-shrink-0">
                          Already waiting
                        </span>
                      </div>
                    </div>
                  )
                }
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
                                b.last_paid.paid_at
                              )}`
                            : ' - never recorded'}
                        </p>
                      </div>
                    </label>
                    {on && (
                      <div className="mt-2 pl-7">
                        <label className="field-label">Hold back *</label>
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
              Hold back {picked.size > 0 ? fmt(total) : 'the bill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
