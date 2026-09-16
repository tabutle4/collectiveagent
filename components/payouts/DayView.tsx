'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'

// One day in the payouts account, written for Courtney.
//
// She asked what happened, not for a report. So this is a single day, in
// plain English, with a link to the full ledger for anything older. Nothing
// here says "office net", "sweep" or "entry type": every label comes from
// lib/payouts/ledger, and the balance at the bottom is the sum of the lines
// above it, which is the only claim the screen makes.
//
// Addresses are never shortened on this screen.

interface Row {
  id: string
  entry_date: string
  category: string
  category_label: string
  direction: 'in' | 'out' | 'none'
  description: string
  amount: number
  transaction_id: string | null
  payment_method_label: string
  warnings: { transaction_id: string | null; property_address: string | null; warning: string }[]
  children: Row[]
}

interface Totals {
  opening: number
  in: number
  out: number
  swept: number
  closing: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

function todayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DayView({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayCentral())
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals>({ opening: 0, in: 0, out: 0, swept: 0, closing: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ledger?date=${date}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load that day')
      setRows(json.entries || [])
      setTotals(json.totals || { opening: 0, in: 0, out: 0, swept: 0, closing: 0 })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isToday = date === todayCentral()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-luxury-gray-5">
          <div>
            <h3 className="text-sm font-semibold text-luxury-gray-1">
              What happened in the payouts account
            </h3>
            <p className="text-xs text-luxury-gray-3 mt-0.5">{longDate(date)}</p>
          </div>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-2 border-b border-luxury-gray-5">
          <button
            onClick={() => setDate(shiftDay(date, -1))}
            className="text-xs text-luxury-gray-2 hover:text-luxury-gray-1 flex items-center gap-1"
          >
            <ChevronLeft size={14} />
            Day before
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(todayCentral())}
              className="text-xs text-luxury-accent hover:underline"
            >
              Back to today
            </button>
          )}
          <button
            onClick={() => setDate(shiftDay(date, 1))}
            disabled={isToday}
            className="text-xs text-luxury-gray-2 hover:text-luxury-gray-1 flex items-center gap-1 disabled:opacity-30"
          >
            Day after
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-xs text-red-700 mb-3">{error}</p>}

          <div className="flex items-center justify-between text-sm mb-3 pb-3 border-b border-luxury-gray-5">
            <span className="text-luxury-gray-2">Started the day with</span>
            <span className="font-medium text-luxury-gray-1 tabular-nums">{fmt(totals.opening)}</span>
          </div>

          {loading ? (
            <p className="text-xs text-luxury-gray-3 text-center py-8">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 text-center py-8">
              Nothing moved in or out of the account on this day.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const isOpen = open.has(row.id)
                const hasChildren = row.children.length > 0
                return (
                  <div key={row.id} className="border-b border-luxury-gray-5 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-luxury-gray-1">{row.category_label}</p>
                        <p className="text-xs text-luxury-gray-2">
                          {row.description}
                          {row.payment_method_label && ` by ${row.payment_method_label}`}
                        </p>
                        {hasChildren && (
                          <button
                            onClick={() => toggle(row.id)}
                            className="text-xs text-luxury-accent hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            <ChevronDown
                              size={12}
                              className={isOpen ? '' : '-rotate-90 transition-transform'}
                            />
                            {isOpen ? 'Hide' : 'Show'} the {row.children.length} deal
                            {row.children.length === 1 ? '' : 's'}
                          </button>
                        )}
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                          row.direction === 'in'
                            ? 'text-green-700'
                            : row.direction === 'out'
                            ? 'text-red-700'
                            : 'text-luxury-gray-2'
                        }`}
                      >
                        {row.direction === 'in' ? '+' : row.direction === 'out' ? '-' : ''}
                        {fmt(row.amount)}
                      </span>
                    </div>
                    {isOpen && row.warnings.length > 0 && (
                      <div className="pl-4 pt-2 space-y-1">
                        <p className="text-xs text-amber-700 font-medium">Flagged at the time</p>
                        {row.warnings.map((w, i) => (
                          <p key={`${w.transaction_id}-${i}`} className="text-xs text-amber-700">
                            {w.property_address || 'A deal'}: {w.warning}
                          </p>
                        ))}
                      </div>
                    )}
                    {isOpen && (
                      <div className="pl-4 pt-2 space-y-1">
                        {row.children.map(child => (
                          <div key={child.id} className="flex justify-between text-xs gap-3">
                            <span className="text-luxury-gray-2">{child.description}</span>
                            <span className="text-luxury-gray-2 tabular-nums whitespace-nowrap">
                              {fmt(child.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between text-sm mt-4 pt-3 border-t border-luxury-gray-5">
            <span className="font-semibold text-luxury-gray-1">Ended the day with</span>
            <span className="font-bold text-luxury-gray-1 tabular-nums">{fmt(totals.closing)}</span>
          </div>
        </div>

        <div className="border-t border-luxury-gray-5 px-5 py-3 flex items-center justify-between">
          <Link
            href="/admin/reports/money-movement"
            className="text-xs text-luxury-accent hover:underline inline-flex items-center gap-1"
          >
            See the full ledger
            <ExternalLink size={12} />
          </Link>
          <button onClick={onClose} className="btn btn-secondary text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
