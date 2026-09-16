'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Pencil, AlertTriangle } from 'lucide-react'

// The bills that come out of the payouts account on a schedule.
//
// These exist so the sweep can say how much of the balance is already spoken
// for. A bill is money that will leave whether or not anyone remembers it, so
// what matters here is the schedule shape, not a due date someone types.
//
// Four shapes: fixed days of the month, the last day, a window (reserved from
// its first day, because the money has to be there by then), and weekend
// shifting, which only ever moves a payment earlier.

interface Bill {
  id: string
  name: string
  amount: number | string
  days: number[] | null
  last_day_of_month: boolean | null
  window_start_day: number | null
  window_end_day: number | null
  shift_earlier_for_nonbusiness: boolean | null
  account: string | null
  active: boolean | null
  notes: string | null
}

interface Occurrence {
  bill_id: string
  name: string
  amount: number
  due_date: string
  shifted: boolean
}

// While a bill is being edited the amount is whatever is in the text box, so
// the draft carries the raw string. The server parses and validates it; this
// type just stops the input from having to lie about being a number.
type Draft = Omit<Partial<Bill>, 'amount'> & { amount?: number | string; days_text?: string }

function formatCurrency(n: number | string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(n) || 0
  )
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function scheduleText(b: Bill): string {
  const parts: string[] = []
  if (b.days && b.days.length > 0) {
    parts.push(`day ${b.days.join(', ')} of the month`)
  }
  if (b.last_day_of_month) parts.push('last day of the month')
  if (b.window_start_day && b.window_end_day) {
    parts.push(`between day ${b.window_start_day} and ${b.window_end_day}`)
  }
  if (b.shift_earlier_for_nonbusiness) parts.push('moved earlier if it lands on a weekend')
  return parts.length > 0 ? parts.join(', ') : 'no schedule set'
}

const EMPTY: Draft = {
  name: '',
  amount: undefined,
  days_text: '',
  last_day_of_month: false,
  window_start_day: null,
  window_end_day: null,
  shift_earlier_for_nonbusiness: false,
  account: 'payouts',
  active: true,
  notes: '',
}

export default function RecurringBillsSettings({ canManage }: { canManage: boolean }) {
  const [bills, setBills] = useState<Bill[]>([])
  const [due, setDue] = useState<Occurrence[]>([])
  const [dueTotal, setDueTotal] = useState(0)
  const [monthlyTotal, setMonthlyTotal] = useState(0)
  const [windowDays, setWindowDays] = useState(14)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/recurring-bills')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load bills')
      setBills(json.bills || [])
      setDue(json.due || [])
      setDueTotal(json.due_total || 0)
      setMonthlyTotal(json.monthly_total || 0)
      setWindowDays(json.due_window_days || 14)
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
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const days = (editing.days_text || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n >= 1 && n <= 31)

      const payload = {
        id: editing.id,
        name: editing.name,
        amount: editing.amount,
        days,
        last_day_of_month: !!editing.last_day_of_month,
        window_start_day: editing.window_start_day || null,
        window_end_day: editing.window_end_day || null,
        shift_earlier_for_nonbusiness: !!editing.shift_earlier_for_nonbusiness,
        account: editing.account || 'payouts',
        active: editing.active !== false,
        notes: editing.notes || null,
      }

      const res = await fetch('/api/admin/recurring-bills', {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save')
      setEditing(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (bill: Bill) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/recurring-bills?id=${bill.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not turn off')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const reactivate = async (bill: Bill) => {
    setEditing({
      ...bill,
      days_text: (bill.days || []).join(', '),
      active: true,
    })
  }

  return (
    <div className="container-card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="section-title">Recurring Bills</h2>
          <p className="text-xs text-luxury-gray-3">
            What comes out of the payouts account on a schedule. The sweep holds these back so the
            account is never swept below what is already owed.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing({ ...EMPTY })}
            className="btn btn-primary text-sm flex items-center gap-2"
          >
            <Plus size={14} />
            Add Bill
          </button>
        )}
      </div>

      {error && (
        <div className="inner-card mb-4 border-l-4 border-l-red-500">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="inner-card">
          <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">
            Due in the next {windowDays} days
          </p>
          <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(dueTotal)}</p>
        </div>
        <div className="inner-card">
          <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Every month</p>
          <p className="text-xl font-semibold text-luxury-gray-1">{formatCurrency(monthlyTotal)}</p>
          <p className="text-xs text-luxury-gray-3">
            Counts every run, so a bill that goes twice a month is counted twice.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-luxury-gray-3 text-center py-6">Loading...</p>
      ) : (
        <>
          {due.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-luxury-gray-1 mb-2">Coming up</h3>
              <div className="space-y-2">
                {due.map((o, i) => (
                  <div
                    key={`${o.bill_id}-${o.due_date}-${i}`}
                    className="flex items-center justify-between text-xs border-b border-luxury-gray-5 pb-2"
                  >
                    <span className="text-luxury-gray-2">
                      {formatDate(o.due_date)} · {o.name}
                      {o.shifted && (
                        <span className="text-xs text-luxury-gray-3 bg-luxury-gray-5/40 px-2 py-0.5 rounded ml-2">
                          Moved earlier
                        </span>
                      )}
                    </span>
                    <span className="text-luxury-gray-1 font-medium">{formatCurrency(o.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {bills.map(bill => (
              <div key={bill.id} className={`inner-card ${bill.active === false ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-luxury-gray-1">{bill.name}</h3>
                      {bill.account && bill.account !== 'payouts' && (
                        <span className="text-xs text-luxury-gray-2 bg-luxury-gray-5/40 px-2 py-0.5 rounded">
                          {bill.account}
                        </span>
                      )}
                      {bill.active === false && (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-luxury-gray-2 mt-1">
                      {formatCurrency(bill.amount)} · {scheduleText(bill)}
                    </p>
                    {bill.notes && <p className="text-xs text-luxury-gray-3 mt-1">{bill.notes}</p>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => (bill.active === false ? reactivate(bill) : deactivate(bill))}
                        disabled={saving}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          bill.active !== false
                            ? 'border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-gray-5/40'
                            : 'border-green-300 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {bill.active !== false ? 'Turn off' : 'Turn on'}
                      </button>
                      <button
                        onClick={() =>
                          setEditing({ ...bill, days_text: (bill.days || []).join(', ') })
                        }
                        className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {bills.length === 0 && (
              <p className="text-xs text-luxury-gray-3 text-center py-6">No recurring bills yet.</p>
            )}
          </div>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="section-title mb-4">{editing.id ? 'Edit Bill' : 'Add Bill'}</h3>
            <div className="space-y-3">
              <div>
                <label className="field-label">Name</label>
                <input
                  type="text"
                  value={editing.name || ''}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="input-luxury w-full text-xs"
                />
              </div>
              <div>
                <label className="field-label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={editing.amount === undefined || editing.amount === null ? '' : String(editing.amount)}
                  onChange={e => setEditing({ ...editing, amount: e.target.value })}
                  className="input-luxury w-full text-xs"
                />
                <p className="text-xs text-luxury-gray-3 mt-1">
                  What it usually costs. Ticking a run paid records the real amount, so a bill that
                  varies does not break the schedule.
                </p>
              </div>
              <div>
                <label className="field-label">Days of the month</label>
                <input
                  type="text"
                  value={editing.days_text || ''}
                  onChange={e => setEditing({ ...editing, days_text: e.target.value })}
                  placeholder="1, 15"
                  className="input-luxury w-full text-xs"
                />
                <p className="text-xs text-luxury-gray-3 mt-1">
                  Separate with commas. Leave empty if the bill uses the last day or a window.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                <input
                  type="checkbox"
                  checked={!!editing.last_day_of_month}
                  onChange={e => setEditing({ ...editing, last_day_of_month: e.target.checked })}
                  className="h-4 w-4"
                />
                Also runs on the last day of the month
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Window start day</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={editing.window_start_day ?? ''}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        window_start_day: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input-luxury w-full text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Window end day</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={editing.window_end_day ?? ''}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        window_end_day: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input-luxury w-full text-xs"
                  />
                </div>
              </div>
              <p className="text-xs text-luxury-gray-3">
                A window holds the money back from its first day, because it has to be there before
                the bill actually goes.
              </p>
              <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                <input
                  type="checkbox"
                  checked={!!editing.shift_earlier_for_nonbusiness}
                  onChange={e =>
                    setEditing({ ...editing, shift_earlier_for_nonbusiness: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                Move earlier when it lands on a weekend
              </label>
              <div>
                <label className="field-label">Notes</label>
                <input
                  type="text"
                  value={editing.notes || ''}
                  onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  className="input-luxury w-full text-xs"
                />
              </div>
              {editing.id && editing.active === false && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 px-2 py-2 rounded">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  Saving turns this bill back on.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn btn-primary flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
