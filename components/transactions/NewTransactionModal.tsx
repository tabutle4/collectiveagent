'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus } from 'lucide-react'
import { TRANSACTION_TYPE_OPTIONS } from '@/lib/transactions/transactionTypes'

interface NewTransactionModalProps {
  onClose: () => void
  canAssignAgent?: boolean
  agents?: { id: string; preferred_first_name?: string; preferred_last_name?: string; first_name?: string; last_name?: string; email?: string }[]
}

const STATUS_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'active_listing', label: 'Active Listing' },
  { value: 'pending', label: 'Pending' },
] as const

function fmtAgentName(a: any): string {
  const fn = a.preferred_first_name || a.first_name || ''
  const ln = a.preferred_last_name || a.last_name || ''
  const full = `${fn} ${ln}`.trim()
  return full || a.email || 'Unknown'
}

export default function NewTransactionModal({
  onClose,
  canAssignAgent = false,
  agents = [],
}: NewTransactionModalProps) {
  const router = useRouter()
  const [propertyAddress, setPropertyAddress] = useState('')
  const [transactionType, setTransactionType] = useState('')
  const [status, setStatus] = useState<string>('prospect')
  const [submittedBy, setSubmittedBy] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!propertyAddress.trim()) {
      setError('Property address is required')
      return
    }
    if (!transactionType) {
      setError('Pick a transaction type')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const body: any = {
        property_address: propertyAddress.trim(),
        transaction_type: transactionType,
        status,
      }
      if (canAssignAgent && submittedBy) {
        body.submitted_by = submittedBy
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to create transaction')
      }

      const data = await res.json()
      const newId = data.transaction?.id
      if (!newId) throw new Error('No transaction id returned')

      router.push(canAssignAgent ? `/admin/transactions/${newId}` : `/transactions/${newId}`)
    } catch (e: any) {
      setError(e.message || 'Failed to create transaction')
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
          <h2 className="text-base font-semibold text-luxury-black">New Transaction</h2>
          <button
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Property Address */}
          <div>
            <label className="field-label">Property Address</label>
            <input
              type="text"
              className="input-luxury w-full"
              value={propertyAddress}
              onChange={e => setPropertyAddress(e.target.value)}
              placeholder="123 Main St, Houston, TX 77001"
              autoFocus
              disabled={creating}
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label className="field-label">Transaction Type</label>
            <select
              className="select-luxury w-full"
              value={transactionType}
              onChange={e => setTransactionType(e.target.value)}
              disabled={creating}
            >
              <option value="">Select type...</option>
              {TRANSACTION_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="field-label">Status</label>
            <select
              className="select-luxury w-full"
              value={status}
              onChange={e => setStatus(e.target.value)}
              disabled={creating}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Agent (admins only) */}
          {canAssignAgent && (
            <div>
              <label className="field-label">Submit on Behalf Of (optional)</label>
              <select
                className="select-luxury w-full"
                value={submittedBy}
                onChange={e => setSubmittedBy(e.target.value)}
                disabled={creating}
              >
                <option value="">Me</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {fmtAgentName(a)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-luxury-gray-5">
          <button
            onClick={onClose}
            disabled={creating}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !propertyAddress.trim() || !transactionType}
            className="btn btn-primary flex items-center gap-1.5"
          >
            {creating ? (
              'Creating...'
            ) : (
              <>
                <Plus size={14} /> Create
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
