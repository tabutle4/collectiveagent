'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import {
  defaultSideForRoleAndTransaction,
  sideLabel,
  type Side,
} from '@/lib/transactions/sides'
import {
  AGENT_ROLE_OPTIONS,
  SIDE_OPTIONS as ALL_SIDE_OPTIONS,
} from '@/lib/transactions/constants'

// Modal requires a side choice — drop the empty placeholder option.
const SIDE_OPTIONS = ALL_SIDE_OPTIONS.filter(s => s.value !== '') as { value: Side; label: string }[]

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

interface AddAgentModalProps {
  transactionId: string
  transaction: any
  existingAgents: any[]
  onClose: () => void
  onAdded: (createdAgentRow?: any) => void
}

/**
 * AddAgentModal — real modal with side picker. Replaces the inline panel
 * formerly inside AgentsSection. Adding a primary or listing agent
 * automatically defaults to the side implied by the transaction_type.
 */
export default function AddAgentModal({
  transactionId,
  transaction,
  existingAgents,
  onClose,
  onAdded,
}: AddAgentModalProps) {
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  const [role, setRole] = useState<string>('co_agent')
  const [side, setSide] = useState<Side | ''>('')

  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLease = isLeaseTransactionType(transaction?.transaction_type)
  const isIntermediary = Boolean(transaction?.is_intermediary)

  // Load roster
  useEffect(() => {
    fetch('/api/users/list', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setAllUsers(d.users || []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false))
  }, [])

  // Auto-pick a sensible default side whenever role changes
  useEffect(() => {
    const def = defaultSideForRoleAndTransaction(
      role,
      transaction?.transaction_type,
      isIntermediary,
      transaction?.other_side_transaction_type,
    )
    if (def) setSide(def)
  }, [role, transaction?.transaction_type, transaction?.other_side_transaction_type, isIntermediary])

  // Filter excludes anyone already on this txn (no duplicates)
  const existingAgentIds = useMemo(
    () => new Set((existingAgents || []).map(a => a.agent_id)),
    [existingAgents]
  )
  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase()
    const list = allUsers.filter(u => !existingAgentIds.has(u.id))
    if (!term) return list.slice(0, 12)
    return list
      .filter(u => fmtName(u).toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term))
      .slice(0, 25)
  }, [allUsers, searchText, existingAgentIds])

  const submit = async () => {
    if (!selectedUser) { setError('Pick an agent'); return }
    if (!side) { setError('Pick a side'); return }

    setAdding(true)
    setError(null)
    try {
      const planFromUser = isLease
        ? selectedUser.lease_commission_plan || 'Lease Plan'
        : selectedUser.commission_plan || ''

      const countsToward =
        !isLease && (role === 'primary_agent' || role === 'listing_agent')

      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_internal_agent',
          agent: {
            agent_id: selectedUser.id,
            agent_role: role,
            side,
            commission_plan: planFromUser,
            counts_toward_progress: countsToward,
            units: 1,
            funding_source: 'crc',
            payment_status: 'pending',
            uses_canonical_math: true,
          },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Add agent failed')
      }
      const result = await res.json().catch(() => ({}))
      onAdded(result.agent || null)
    } catch (e: any) {
      setError(e.message || 'Failed to add agent')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-4 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-luxury-gray-1">Add Agent</h3>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Agent picker */}
          <div>
            <label className="field-label">Agent</label>
            {selectedUser ? (
              <div className="flex items-center justify-between bg-luxury-accent/10 px-2 py-1.5 rounded">
                <div>
                  <div className="text-xs text-luxury-gray-1">{fmtName(selectedUser)}</div>
                  {selectedUser.office && <div className="text-[10px] text-luxury-gray-3">{selectedUser.office}</div>}
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1">Change</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-2.5 text-luxury-gray-3" />
                  <input
                    autoFocus
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Search agents by name or email..."
                    className="input-luxury text-xs w-full pl-6"
                  />
                </div>
                {loadingUsers && <p className="text-xs text-luxury-gray-3 mt-1">Loading roster...</p>}
                {!loadingUsers && filtered.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-y-auto border border-luxury-gray-5 rounded">
                    {filtered.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedUser(u); setSearchText('') }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-luxury-gray-5/40 border-b border-luxury-gray-5 last:border-b-0"
                      >
                        <div className="text-luxury-gray-1">{fmtName(u)}</div>
                        {u.office && <div className="text-luxury-gray-3 text-[10px]">{u.office}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {!loadingUsers && searchText && filtered.length === 0 && (
                  <p className="text-xs text-luxury-gray-3 mt-1">No matching agents.</p>
                )}
              </>
            )}
          </div>

          {/* Role picker */}
          <div>
            <label className="field-label">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="select-luxury text-xs w-full"
            >
              {AGENT_ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Side picker */}
          <div>
            <label className="field-label">
              Side
              {isIntermediary && (
                <span className="ml-2 text-[10px] text-luxury-accent uppercase tracking-wider">
                  Intermediary deal
                </span>
              )}
            </label>
            <select
              value={side}
              onChange={e => setSide(e.target.value as Side)}
              className="select-luxury text-xs w-full"
            >
              <option value="">Select side...</option>
              {SIDE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {side && (
              <p className="text-[10px] text-luxury-gray-3 mt-1">
                Agent will appear on the {sideLabel(side).toLowerCase()} side of this deal.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="bg-luxury-gray-5/30 rounded p-2.5">
            <p className="text-[10px] text-luxury-gray-3">
              Tip: After adding the primary agent, use <strong>Apply Split</strong> on
              their card to pull in team lead and momentum partner if applicable.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-luxury-gray-5 px-4 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={adding}
            className="btn btn-secondary text-xs px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={adding || !selectedUser || !side}
            className="btn btn-primary text-xs px-3 py-1.5"
          >
            {adding ? 'Adding...' : 'Add Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
