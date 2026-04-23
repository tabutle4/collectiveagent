'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const fmt$ = (n: any): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(parseFloat(String(n ?? 0)) || 0)

/**
 * Inline panel shown when user clicks "Mark paid" on any TIA row.
 * Fetches the agent's outstanding debts, lets user toggle which apply, and
 * submits the Mark Paid action.
 *
 * Works for ALL TIA roles (primary, listing, co, team_lead, momentum_partner,
 * referral). Debts can be deducted from any role at payout.
 */
export default function MarkPaidPanel({
  transactionId,
  tia,
  onCancel,
  onMarked,
}: {
  transactionId: string
  tia: any
  onCancel: () => void
  onMarked: () => void
}) {
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [paymentMethod, setPaymentMethod] = useState('ACH')
  const [paymentRef, setPaymentRef] = useState('')
  const [fundingSource, setFundingSource] = useState('CRC')
  const [debts, setDebts] = useState<any[]>([])
  const [selectedDebts, setSelectedDebts] = useState<Record<string, boolean>>({})
  const [countsProgress, setCountsProgress] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/transactions/${transactionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_agent_debts',
            agent_id: tia.agent_id,
          }),
        })
        const d = await res.json()
        setDebts(d.debts || [])
      } catch {
        setDebts([])
      } finally {
        setLoading(false)
      }
    })()
  }, [tia.agent_id, transactionId])

  const selectedDebtTotal = debts
    .filter((d) => selectedDebts[d.id])
    .reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0)

  const subtotal = parseFloat(tia.agent_net || 0)
  const finalNet = subtotal - selectedDebtTotal

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const debts_to_apply = debts
      .filter((d) => selectedDebts[d.id])
      .map((d) => ({ id: d.id, amount: parseFloat(d.remaining_amount || 0) }))
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid',
          internal_agent_id: tia.id,
          transaction_type: tia.transaction_type || null,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_reference: paymentRef || null,
          funding_source: fundingSource,
          debts_to_apply,
          counts_toward_progress: countsProgress,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Mark paid failed')
      }
      onMarked()
    } catch (e: any) {
      setError(e.message || 'Mark paid failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="inner-card mt-4">
      <p className="field-label mb-3">Mark paid</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="field-label">Payment date</label>
          <input
            type="date"
            className="input-luxury text-xs"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Method</label>
          <select
            className="select-luxury text-xs"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="ACH">ACH</option>
            <option value="Check">Check</option>
            <option value="Zelle">Zelle</option>
            <option value="Wire">Wire</option>
          </select>
        </div>
        <div>
          <label className="field-label">Reference</label>
          <input
            type="text"
            className="input-luxury text-xs"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="field-label">Funded from</label>
          <select
            className="select-luxury text-xs"
            value={fundingSource}
            onChange={(e) => setFundingSource(e.target.value)}
          >
            <option value="CRC">CRC</option>
            <option value="RC">RC</option>
            <option value="Title">Title</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-luxury-gray-3 text-center py-2">
          <Loader2 size={12} className="inline-block animate-spin mr-1" />
          Loading debts...
        </p>
      ) : debts.length > 0 ? (
        <div className="mb-3">
          <p className="field-label">Apply debts</p>
          <div className="space-y-1">
            {debts.map((d) => (
              <label
                key={d.id}
                className="flex items-center justify-between text-xs cursor-pointer py-1"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!selectedDebts[d.id]}
                    onChange={(e) =>
                      setSelectedDebts((p) => ({
                        ...p,
                        [d.id]: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-luxury-gray-2">
                    {d.description || 'Debt'}
                  </span>
                </span>
                <span className="text-luxury-gray-2">
                  {fmt$(d.remaining_amount)}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-luxury-gray-3 mb-3">No outstanding debts.</p>
      )}

      <div className="border-t border-luxury-gray-5 pt-2 space-y-1 text-xs">
        <div className="flex justify-between text-luxury-gray-3">
          <span>Subtotal</span>
          <span>{fmt$(subtotal)}</span>
        </div>
        {selectedDebtTotal > 0 && (
          <div className="flex justify-between text-luxury-gray-3">
            <span>Debts</span>
            <span>−{fmt$(selectedDebtTotal)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-luxury-gray-1">
          <span>Net payout</span>
          <span>{fmt$(finalNet)}</span>
        </div>
      </div>

      {tia.agent_role === 'primary_agent' ||
      tia.agent_role === 'listing_agent' ? (
        <label className="flex items-center gap-2 mt-3 text-xs">
          <input
            type="checkbox"
            checked={countsProgress}
            onChange={(e) => setCountsProgress(e.target.checked)}
          />
          <span className="text-luxury-gray-2">
            Counts toward agent's cap progress
          </span>
        </label>
      ) : null}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="btn btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || loading}
          className="btn btn-primary text-xs"
        >
          {submitting ? 'Saving...' : 'Confirm paid'}
        </button>
      </div>
    </div>
  )
}
