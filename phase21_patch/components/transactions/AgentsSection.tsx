'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import AgentCard from './AgentCard'
import AddAgentModal from './AddAgentModal'

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

export default function AgentsSection({
  transactionId, transaction, agents, onRefresh,
}: {
  transactionId: string
  transaction: any
  agents: any[]
  onRefresh: () => void
}) {
  const [showAddModal, setShowAddModal] = useState(false)

  // Role priority for ordering
  const rolePriority: Record<string, number> = {
    primary_agent: 0,
    listing_agent: 1,
    co_agent: 2,
    team_lead: 3,
    momentum_partner: 4,
    referral_agent: 5,
  }

  // Sort agents: by side category first (listing-side rows together,
  // buying-side rows together), then by role priority within each group.
  const sortedAgents = [...agents].sort((a, b) => {
    const sideCatA = ['seller', 'landlord'].includes(a.side) ? 0 : ['buyer', 'tenant'].includes(a.side) ? 1 : 2
    const sideCatB = ['seller', 'landlord'].includes(b.side) ? 0 : ['buyer', 'tenant'].includes(b.side) ? 1 : 2
    if (sideCatA !== sideCatB) return sideCatA - sideCatB
    return (rolePriority[a.agent_role] ?? 99) - (rolePriority[b.agent_role] ?? 99)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Agents</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
        >
          <Plus size={12} /> Add Agent
        </button>
      </div>

      {showAddModal && (
        <AddAgentModal
          transactionId={transactionId}
          transaction={transaction}
          existingAgents={agents}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            onRefresh()
          }}
        />
      )}

      {sortedAgents.length === 0 && (
        <div className="container-card text-center py-6">
          <p className="text-xs text-luxury-gray-3">No agents on this transaction yet.</p>
          <p className="text-xs text-luxury-gray-3 mt-1">Click <strong>Add Agent</strong> to add one.</p>
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
