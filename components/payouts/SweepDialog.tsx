'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, AlertTriangle, ArrowRight } from 'lucide-react'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/transactions/constants'

// Moving our share from the payouts account to the income account.
//
// The whole point of this screen is that the amount is not typed. Every figure
// comes back from the server, which reads office net off the deal; the dialog
// sends nothing but a list of deals and a date. Moving the wrong amount is the
// problem this build exists to solve, so there is no field here that could
// carry a wrong one.
//
// Ready deals are pre-ticked. An unready one can still be ticked by hand, with
// what it is waiting on shown beside it, because the standing rule is warn and
// never block. The single exception is a deal the server refuses: a negative or
// zero office net means the commission inputs are wrong, and moving it would
// mean nothing.

interface SweepDeal {
  transaction_id: string
  property_address: string | null
  office_net: number
  ready: boolean
  refusal: string | null
  waiting_on: string[]
  sides_badge: string | null
  last_cleared_date: string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

function todayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

export default function SweepDialog({
  onClose,
  onSwept,
  bottomLine,
}: {
  onClose: () => void
  onSwept: () => void
  /**
   * The Bottom Line as it stands before this transfer. Passed in rather than
   * refetched so the warning below is measured against exactly the figure the
   * person is looking at on the report behind this dialog.
   */
  bottomLine?: number
}) {
  const [deals, setDeals] = useState<SweepDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [transferDate, setTransferDate] = useState(todayCentral())
  const [bankReference, setBankReference] = useState('')
  // Left blank on purpose. Defaulting it would put a method on the record that
  // nobody chose, and the point of this screen is that the record says what
  // actually happened.
  const [paymentMethod, setPaymentMethod] = useState('')
  // For deals whose share left the account before the ledger was opened. Marks
  // them as moved without recording a transfer today, because the opening
  // balance already accounts for that money.
  const [alreadyMoved, setAlreadyMoved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sweeps')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load deals')
      const list: SweepDeal[] = json.deals || []
      setDeals(list)
      setPicked(new Set(list.filter(d => d.ready).map(d => d.transaction_id)))
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

  const chosen = deals.filter(d => picked.has(d.transaction_id))
  const total = chosen.reduce((s, d) => s + d.office_net, 0)
  const warned = chosen.filter(d => !d.ready && !d.refusal)

  // Moving our share takes money out of the payouts account without changing
  // what we owe, so the Bottom Line drops by exactly the amount transferred.
  // Nothing in the sweep gates checks this: funds cleared, checklist and
  // compliance all describe the DEAL, and none of them knows whether enough is
  // left in the account to pay the agents afterwards.
  //
  // Warns, never blocks, like every other gate here.
  const bottomLineAfter = bottomLine === undefined ? null : Math.round((bottomLine - total) * 100) / 100
  const wouldGoShort =
    !alreadyMoved && bottomLineAfter !== null && bottomLineAfter < 0 && total > 0

  const record = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sweeps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_ids: Array.from(picked),
          transfer_date: transferDate,
          bank_reference: bankReference || null,
          payment_method: paymentMethod || null,
          already_moved: alreadyMoved,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.refused) {
          throw new Error(
            json.refused
              .map((r: any) => `${r.property_address || 'A deal'}: ${r.reason}`)
              .join(' ')
          )
        }
        throw new Error(json.error || 'Could not record the transfer')
      }
      onSwept()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-luxury-gray-5">
          <div>
            <h3 className="text-sm font-semibold text-luxury-gray-1">
              Move our share to the income account
            </h3>
            <p className="text-xs text-luxury-gray-3 mt-0.5">
              Tick the deals whose money is moving. The amount comes from each deal, so it is
              always what the deal actually earned.
            </p>
          </div>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="inner-card mb-4 border-l-4 border-l-red-500">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-luxury-gray-3 text-center py-8">Loading deals...</p>
          ) : deals.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 text-center py-8">
              Nothing to move. Every deal whose money is in this account has already been moved.
            </p>
          ) : (
            <div className="space-y-2">
              {deals.map(d => {
                const isPicked = picked.has(d.transaction_id)
                return (
                  <label
                    key={d.transaction_id}
                    className={`inner-card flex items-start gap-3 cursor-pointer ${
                      d.refusal ? 'opacity-60' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      disabled={!!d.refusal}
                      onChange={() => toggle(d.transaction_id)}
                      className="h-4 w-4 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-luxury-gray-1">
                          {d.property_address || 'Unnamed deal'}
                        </span>
                        {d.ready ? (
                          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                            Ready
                          </span>
                        ) : d.refusal ? (
                          <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
                            Cannot move
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                            Not ready
                          </span>
                        )}
                        {d.sides_badge && (
                          <span className="text-xs text-luxury-gray-2 bg-luxury-gray-5/40 px-2 py-0.5 rounded">
                            {d.sides_badge} sides
                          </span>
                        )}
                      </div>
                      {d.refusal ? (
                        <p className="text-xs text-red-700 mt-1 flex items-start gap-1">
                          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                          {d.refusal}
                        </p>
                      ) : (
                        d.waiting_on.length > 0 && (
                          <p className="text-xs text-amber-700 mt-1">
                            Waiting on: {d.waiting_on.join(', ')}
                          </p>
                        )
                      )}
                    </div>
                    <span className="text-sm font-semibold text-luxury-gray-1 tabular-nums flex-shrink-0">
                      {fmt(d.office_net)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-luxury-gray-5 px-5 py-4">
          <label className="flex items-start gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alreadyMoved}
              onChange={e => setAlreadyMoved(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-luxury-gray-2">
              This money already left, before the ledger was opened. Just mark the deals, do not
              record a transfer.
            </span>
          </label>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="w-40">
              <label className="field-label">Date it moved</label>
              <input
                type="date"
                value={transferDate}
                onChange={e => setTransferDate(e.target.value)}
                className="input-luxury w-full text-xs"
              />
            </div>
            <div className="w-36">
              <label className="field-label">How it moved</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="select-luxury w-full text-xs"
              >
                <option value="">Not recorded</option>
                {PAYMENT_METHOD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="field-label">Bank reference (optional)</label>
              <input
                type="text"
                value={bankReference}
                onChange={e => setBankReference(e.target.value)}
                placeholder="Transfer confirmation number"
                className="input-luxury w-full text-xs"
              />
            </div>
          </div>

          {warned.length > 0 && (
            <p className="text-xs text-amber-700 mb-3 flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              {warned.length} of the deals you ticked {warned.length === 1 ? 'is' : 'are'} not
              ready yet. You can still move {warned.length === 1 ? 'it' : 'them'}, and what
              {warned.length === 1 ? ' it is' : ' they are'} waiting on is saved with the
              transfer so the reason is on the record.
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              {wouldGoShort && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                  <p className="text-xs text-amber-800">
                    After this transfer the account is short {fmt(Math.abs(bottomLineAfter as number))} of
                    covering everyone queued. You can still move it.
                  </p>
                </div>
              )}
              <p className="text-xs text-luxury-gray-3 uppercase tracking-wide">Moving</p>
              <p className="text-lg font-bold text-luxury-gray-1">{fmt(total)}</p>
              <p className="text-xs text-luxury-gray-3">
                {chosen.length} deal{chosen.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={record}
                disabled={saving || chosen.length === 0}
                className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                Record the transfer
              </button>
            </div>
          </div>
          <p className="text-xs text-luxury-gray-3 mt-2">
            This records the move. Make the transfer in the bank as well.
          </p>
        </div>
      </div>
    </div>
  )
}
