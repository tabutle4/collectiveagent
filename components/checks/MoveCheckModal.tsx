'use client'

import { useState } from 'react'
import { Search, RefreshCw, ArrowRightLeft } from 'lucide-react'

interface TxnResult {
  id: string
  property_address: string | null
  client_name: string | null
  status: string | null
}

interface MoveCheckModalProps {
  checkId: string
  /** Shown so the user can confirm they picked the right check before moving it. */
  checkLabel: string
  currentAddress: string | null
  onClose: () => void
  onMoved: () => void
}

/**
 * Move a check to a different deal. Used by the payouts report and the
 * transaction detail page, which is why it lives here rather than inside
 * either page.
 */
export default function MoveCheckModal({
  checkId,
  checkLabel,
  currentAddress,
  onClose,
  onMoved,
}: MoveCheckModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TxnResult[]>([])
  const [searching, setSearching] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async (value: string) => {
    setQuery(value)
    setError(null)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch('/api/admin/checks/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: value }),
      })
      const json = await res.json()
      setResults(json.transactions || [])
    } catch {
      setError('Search failed. Check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const moveTo = async (transactionId: string) => {
    setMoving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/checks/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'relink', check_id: checkId, transaction_id: transactionId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Move failed.')
        return
      }
      onMoved()
    } catch {
      setError('Move failed. Check your connection and try again.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-luxury-gray-5">
          <h2 className="text-lg font-semibold text-luxury-gray-1">Move Check to Another Deal</h2>
          <p className="text-sm text-luxury-gray-3 mt-1">{checkLabel}</p>
          {currentAddress && (
            <p className="text-xs text-luxury-gray-3 mt-1">Currently on: {currentAddress}</p>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="field-label">Search for the correct deal</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
              <input
                type="text"
                value={query}
                onChange={e => runSearch(e.target.value)}
                placeholder="Search by property address or client name"
                className="input-luxury text-xs pl-7 py-1.5 w-full"
                autoFocus
              />
            </div>
          </div>

          {searching ? (
            <p className="text-xs text-luxury-gray-3">Searching...</p>
          ) : results.length > 0 ? (
            <div className="border border-luxury-gray-5 rounded divide-y divide-luxury-gray-5 max-h-64 overflow-y-auto">
              {results.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-xs text-luxury-gray-1 truncate">
                      {t.property_address || 'No address'}
                    </span>
                    <span className="block text-xs text-luxury-gray-3 truncate">
                      {[t.client_name, t.status].filter(Boolean).join(' - ')}
                    </span>
                  </div>
                  <button
                    onClick={() => moveTo(t.id)}
                    disabled={moving}
                    className="btn btn-secondary text-xs whitespace-nowrap disabled:opacity-50"
                  >
                    Move Here
                  </button>
                </div>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <p className="text-xs text-luxury-gray-3">No deals matched that search.</p>
          ) : null}

          <p className="text-xs text-luxury-gray-3">
            Moving a check recalculates the commission and the compliance pay-by date on both deals.
          </p>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-6 border-t border-luxury-gray-5 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary" disabled={moving}>
            Cancel
          </button>
          <span className="flex items-center gap-2 text-xs text-luxury-gray-3">
            {moving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
            {moving ? 'Moving...' : 'Pick a deal above'}
          </span>
        </div>
      </div>
    </div>
  )
}
