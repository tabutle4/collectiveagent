import { fetchAllRows } from '@/lib/supabase'
import {
  isLeaseTransactionType,
  isReferredOutTransactionType,
} from '@/lib/transactions/transactionTypes'

/**
 * Derived New Agent Plan progress.
 *
 * users.qualifying_transaction_count used to be a stored counter that Mark Paid
 * incremented and unmark decremented. Three problems with that: it moved at
 * Mark Paid rather than when the money was real, a cancelled deal needed a
 * decrement to fire and nothing guaranteed one did, and six surfaces read the
 * column so any missed write showed a different number on a different screen.
 *
 * Counting the deals instead removes all three. A deal that cancels or is
 * archived drops off the next read with no code needing to notice, and every
 * surface asks the same question of the same rows.
 *
 * A deal counts when ALL of these hold:
 *   - the agent holds a primary_agent or listing_agent row on it
 *   - that row's counts_toward_progress is not false (the office's opt-out)
 *   - the deal's status is 'closed' -- the money is real, and it no longer
 *     waits on an admin clicking Mark Paid
 *   - the deal is not a lease
 *   - the deal is not referred out
 *   - the deal is not archived
 *
 * Referred out is tested at two levels on purpose. transaction_type excludes
 * the whole deal, for a file where CRC only made the referral. tia.side
 * excludes a single row, so on a split deal where CRC refers one side out and
 * works the other, the referred side does not count and the CRC side still
 * does. The side signal is unpopulated today; it is here for that case.
 */

const QUALIFYING_ROLES = ['primary_agent', 'listing_agent']

function rowQualifies(row: any): boolean {
  if (!QUALIFYING_ROLES.includes(String(row?.agent_role || ''))) return false
  if (row?.counts_toward_progress === false) return false
  if (String(row?.side || '').toLowerCase() === 'referred_out') return false
  return true
}

function dealQualifies(txn: any): boolean {
  if (!txn) return false
  // An archived deal is one the office has retired, and the reason it is
  // archived is almost always that it duplicates another deal that IS counted.
  // Status stays 'closed' on an archived row, so unlike cancelling, archiving
  // is invisible to the status test above and would credit the agent twice for
  // one sale. Guarded here so both the count and the will-this-count preview
  // agree without either having to remember.
  if (txn.archived_at) return false
  if (isLeaseTransactionType(txn.transaction_type)) return false
  if (isReferredOutTransactionType(txn.transaction_type)) return false
  return true
}

/**
 * Whether THIS deal would count for this agent once it closes, ignoring the
 * closed test itself. The statement uses it to say a pending deal will count,
 * without pre-counting it.
 */
export function dealWouldQualifyForAgent(txn: any, agentRows: any[]): boolean {
  if (!dealQualifies(txn)) return false
  return (agentRows || []).some(rowQualifies)
}

/** Derived count for several agents at once. Missing agents come back as 0. */
export async function qualifyingCountsForAgents(
  agentIds: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const ids = Array.from(new Set((agentIds || []).filter(Boolean)))
  if (ids.length === 0) return out
  for (const id of ids) out[id] = 0

  // fetchAllRows, not a bare select: transaction_internal_agents is already past
  // the 1000-row PostgREST cap, and a silently truncated page here would show an
  // agent a count lower than the deals they closed.
  let data: any[]
  try {
    data = await fetchAllRows(
      'transaction_internal_agents',
      'agent_id, agent_role, counts_toward_progress, side, transaction_id, transaction:transactions!inner(id, status, transaction_type, archived_at)',
      {
        filters: [
          { type: 'in', column: 'agent_id', value: ids },
          { type: 'in', column: 'agent_role', value: QUALIFYING_ROLES },
        ],
      }
    )
  } catch (error) {
    console.error('qualifyingCountsForAgents failed:', error)
    return out
  }

  // Distinct DEALS, not rows: an agent holding two qualifying rows on one deal
  // (a primary row plus additional comp) has closed one sale, not two.
  const seen = new Set<string>()
  for (const row of data || []) {
    const txn: any = (row as any).transaction
    if (String(txn?.status || '') !== 'closed') continue
    if (!dealQualifies(txn)) continue
    if (!rowQualifies(row)) continue
    const key = `${row.agent_id}:${row.transaction_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out[String(row.agent_id)] = (out[String(row.agent_id)] || 0) + 1
  }
  return out
}

/** Derived count for one agent. */
export async function qualifyingCountForAgent(agentId: string): Promise<number> {
  if (!agentId) return 0
  const counts = await qualifyingCountsForAgents([agentId])
  return counts[agentId] || 0
}
