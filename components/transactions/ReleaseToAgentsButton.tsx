'use client'

/**
 * Release to Agents button + status.
 *
 * Lives at the bottom of the Commissions section, above the Commission
 * Statement / Generate CDA buttons. Visible to broker and admin only.
 *
 * When released_to_agent_at is null, renders a prominent action button.
 * Once released, renders a small confirmation line showing who released
 * and when, with an option to revoke (admins only — UX gate; server also
 * enforces).
 */

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

const fmtDateTime = (d: string | null | undefined): string => {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function ReleaseToAgentsButton({
  transactionId,
  releasedAt,
  releasedByName,
  onReleased,
}: {
  transactionId: string
  releasedAt: string | null
  releasedByName?: string | null
  onReleased: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const release = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/transactions/${transactionId}/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release' }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Release failed')
      }
      onReleased()
    } catch (e: any) {
      setError(e.message || 'Release failed')
    } finally {
      setSubmitting(false)
    }
  }

  const revoke = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/transactions/${transactionId}/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'revoke' }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Revoke failed')
      }
      setConfirmRevoke(false)
      onReleased()
    } catch (e: any) {
      setError(e.message || 'Revoke failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (releasedAt) {
    return (
      <div className="inner-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-chart-gold-7" />
            <div>
              <p className="text-xs font-medium text-luxury-gray-1">
                Released to agents
              </p>
              <p className="text-xs text-luxury-gray-3">
                {fmtDateTime(releasedAt)}
                {releasedByName ? ` · by ${releasedByName}` : ''}
              </p>
            </div>
          </div>
          {!confirmRevoke ? (
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 underline"
            >
              Revoke
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-luxury-gray-2">Revoke access?</span>
              <button
                type="button"
                onClick={revoke}
                disabled={submitting}
                className="btn btn-secondary text-xs px-2 py-1"
              >
                {submitting ? 'Working...' : 'Yes, revoke'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRevoke(false)}
                disabled={submitting}
                className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="inner-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-luxury-gray-1">
            Verify commission amounts before releasing
          </p>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Once released, agents can see their commission statement and CDA.
          </p>
        </div>
        <button
          type="button"
          onClick={release}
          disabled={submitting}
          className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Releasing...
            </>
          ) : (
            'Release to agents'
          )}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
