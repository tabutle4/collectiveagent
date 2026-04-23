'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, X } from 'lucide-react'
import AgentCard from './AgentCard'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

const AGENT_ROLE_OPTIONS = [
  { value: 'primary_agent', label: 'Primary Agent' },
  { value: 'listing_agent', label: 'Listing Agent' },
  { value: 'co_agent', label: 'Co-Agent' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'referral_agent', label: 'Referral Agent' },
  { value: 'momentum_partner', label: 'Momentum Partner' },
]

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

// Alias local usage to the central helper (preserves existing call sites)
const isLeaseType = isLeaseTransactionType

export default function AgentsSection({
  transactionId, transaction, agents, onRefresh,
}: {
  transactionId: string
  transaction: any
  agents: any[]
  onRefresh: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [searchText, setSearchText] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [role, setRole] = useState('co_agent')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load users for picker
  useEffect(() => {
    if (showAdd && allUsers.length === 0) {
      fetch('/api/admin/users?active=true', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { users: [] })
        .then(d => setAllUsers(d.users || []))
        .catch(() => {})
    }
  }, [showAdd, allUsers.length])

  const resetAdd = () => {
    setSelectedUser(null)
    setSearchText('')
    setRole('co_agent')
    setShowAdd(false)
    setError(null)
  }

  const addAgent = async () => {
    if (!selectedUser) { setError('Pick an agent'); return }
    setAdding(true)
    setError(null)
    try {
      const isLease = isLeaseType(transaction?.transaction_type)
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
            commission_plan: planFromUser,
            counts_toward_progress: countsToward,
            units: 1,
            funding_source: 'crc',
            payment_status: 'pending',
          },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Add agent failed')
      }
      resetAdd()
      onRefresh()
    } catch (e: any) {
      setError(e.message || 'Failed to add agent')
    } finally {
      setAdding(false)
    }
  }

  const filtered = searchText
    ? allUsers.filter(u => {
        const name = fmtName(u).toLowerCase()
        return name.includes(searchText.toLowerCase())
      })
    : allUsers.slice(0, 10)

  // Role priority for ordering
  const rolePriority: Record<string, number> = {
    primary_agent: 0,
    listing_agent: 1,
    co_agent: 2,
    team_lead: 3,
    momentum_partner: 4,
    referral_agent: 5,
  }
  const sortedAgents = [...agents].sort((a, b) =>
    (rolePriority[a.agent_role] ?? 99) - (rolePriority[b.agent_role] ?? 99)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Agents</h2>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
          >
            <Plus size={12} /> Add Agent
          </button>
        )}
      </div>

      {showAdd && (
        <div className="container-card mb-3 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-luxury-gray-1">Add agent to transaction</p>
            <button onClick={resetAdd} className="text-luxury-gray-3 hover:text-luxury-gray-1">
              <X size={14} />
            </button>
          </div>

          <div className="mb-2">
            <label className="field-label">Agent</label>
            {selectedUser ? (
              <div className="flex items-center justify-between bg-luxury-accent/10 px-2 py-1.5 rounded">
                <span className="text-xs text-luxury-gray-1">{fmtName(selectedUser)}</span>
                <button onClick={() => setSelectedUser(null)} className="text-xs text-luxury-gray-3">Change</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-2.5 text-luxury-gray-3" />
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Search agents..."
                    className="input-luxury text-xs w-full pl-6"
                  />
                </div>
                {filtered.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto border border-luxury-gray-5 rounded">
                    {filtered.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUser(u); setSearchText('') }}
                        className="w-full text-left px-2 py-1 text-xs hover:bg-luxury-gray-5/40"
                      >
                        <div className="text-luxury-gray-1">{fmtName(u)}</div>
                        {u.office && <div className="text-luxury-gray-3 text-xs">{u.office}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mb-3">
            <label className="field-label">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="select-luxury text-xs w-full"
            >
              {AGENT_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={resetAdd} disabled={adding} className="btn btn-secondary text-xs px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={addAgent}
              disabled={adding || !selectedUser}
              className="btn btn-primary text-xs px-3 py-1.5"
            >
              {adding ? 'Adding...' : 'Add Agent'}
            </button>
          </div>

          <p className="text-xs text-luxury-gray-3 mt-2">
            Tip: After adding the primary agent, use the "Apply Split" button on their card
            to pull in team lead and momentum partner if applicable.
          </p>
        </div>
      )}

      {sortedAgents.length === 0 && !showAdd && (
        <div className="container-card text-center py-6">
          <p className="text-xs text-luxury-gray-3">No agents on this transaction yet.</p>
        </div>
      )}

      {sortedAgents.map(agent => {
        const src = agent.source_tia_id
          ? agents.find(a => a.id === agent.source_tia_id)
          : null
        const sourceTiaName = src
          ? fmtName(src.user)
          : null
        const updatedAt = agent.updated_at ? new Date(agent.updated_at).getTime() : 0
        const recentlyUpdated = Boolean(
          agent.source_tia_id && updatedAt > Date.now() - 5 * 60 * 1000
        )
        return (
          <AgentCard
            key={agent.id}
            tia={{ ...agent, source_tia_name: sourceTiaName }}
            transactionId={transactionId}
            transaction={transaction}
            onRefresh={onRefresh}
            recentlyUpdated={recentlyUpdated}
          />
        )
      })}
    </div>
  )
}
