import { fetchAllRows } from '@/lib/supabase'
import { buildAddressKeys } from '@/lib/transactions/addressKey'

export { canonicalAddressKey, looseAddressKey, buildAddressKeys } from '@/lib/transactions/addressKey'

/**
 * Server-side duplicate detection and agent visibility, shared by every path
 * that creates or lists a transaction.
 *
 * Every create path in the app routes through findDuplicateTransactions before
 * inserting. Before this existed, six of the eight insert sites had no address
 * check at all and the other two used a matcher that treated "St" and "Street"
 * as different properties.
 */

/**
 * A deal is hidden from agents when it is cancelled or archived.
 *
 * These two were previously enforced ad hoc: /api/search filtered cancelled and
 * not archived, the transactions list filtered archived and not cancelled, and
 * most agent routes filtered neither. One constant means adding a third
 * condition later is a single edit rather than a hunt.
 *
 * Admin routes deliberately do NOT use this. The office keeps full visibility;
 * that is the entire premise of archiving instead of deleting.
 */
export const AGENT_HIDDEN_STATUSES = ['cancelled'] as const

export type RowFilter = {
  type: 'eq' | 'neq' | 'is' | 'not' | 'in' | 'gte' | 'lte'
  column: string
  value: any
}

/** fetchAllRows filters that hide cancelled and archived deals from agents. */
export const AGENT_VISIBLE_TRANSACTION_FILTERS: RowFilter[] = [
  { type: 'is', column: 'archived_at', value: null },
  { type: 'neq', column: 'status', value: 'cancelled' },
]

/**
 * The same rule for a PostgREST query builder, for routes that build a query
 * directly instead of going through fetchAllRows.
 */
export function applyAgentVisibility<T>(query: T): T {
  return (query as any).is('archived_at', null).neq('status', 'cancelled')
}

/** The same rule applied to rows already in memory. */
export function isVisibleToAgent(row: { status?: string | null; archived_at?: string | null } | null | undefined): boolean {
  if (!row) return false
  if (row.archived_at) return false
  return !AGENT_HIDDEN_STATUSES.includes(row.status as any)
}

export type DuplicateMatch = {
  id: string
  client_name: string
  property_address: string | null
  status: string | null
  transaction_type: string | null
  created_at: string
  confidence: 'exact' | 'similar'
  is_prospect: boolean
}

const DUPLICATE_COLUMNS =
  'id, property_address, client_name, status, transaction_type, created_at, archived_at'

/**
 * Every transaction whose address resolves to the same property as `address`.
 *
 * Scope is brokerage-wide on purpose. The duplicates that reached production
 * were not all one agent's: the Payload commission webhook creates a deal with
 * no agent row when the Realtor Name does not match, and an agent-scoped lookup
 * cannot see it, so the agent's form makes a second one. Matching across the
 * brokerage is what closes that path.
 *
 * Cancelled and archived rows are excluded. A person already decided those are
 * not live, and offering them back as attach targets would undo that decision.
 */
export async function findDuplicateTransactions(
  address: string | null | undefined,
  options: { excludeId?: string } = {}
): Promise<DuplicateMatch[]> {
  const { strict, loose } = buildAddressKeys(address)
  if (!strict) return []

  // fetchAllRows, not a bare select: transactions is past Supabase's 1000-row
  // page cap, and a truncated read would report "no duplicate" for the oldest
  // deals, which is the failure this helper exists to prevent.
  const rows = await fetchAllRows(
    'transactions',
    DUPLICATE_COLUMNS,
    { filters: [{ type: 'not', column: 'property_address', value: null }] }
  )

  const matches: DuplicateMatch[] = []
  for (const row of rows as any[]) {
    if (!row?.id) continue
    if (options.excludeId && row.id === options.excludeId) continue
    if (!isVisibleToAgent(row)) continue

    const keys = buildAddressKeys(row.property_address)
    if (!keys.strict) continue

    let confidence: 'exact' | 'similar' | null = null
    if (keys.strict === strict) confidence = 'exact'
    else if (loose && keys.loose === loose) confidence = 'similar'
    if (!confidence) continue

    matches.push({
      id: row.id,
      // The forms render client_name as the headline. Falling back to the
      // address keeps that line populated on deals created by the commission
      // webhook, which sets an address and no client.
      client_name: row.client_name || row.property_address || 'Untitled deal',
      property_address: row.property_address || null,
      status: row.status || null,
      transaction_type: row.transaction_type || null,
      created_at: row.created_at,
      confidence,
      is_prospect: row.status === 'prospect',
    })
  }

  // Exact before similar, newest first inside each.
  return matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'exact' ? -1 : 1
    return (b.created_at || '').localeCompare(a.created_at || '')
  })
}

/**
 * The one deal at this exact address, for unattended callers with nobody to ask.
 *
 * Strict tier only: a loose match is a guess, and a webhook attaching a payment
 * to a guessed deal is worse than leaving it unmatched for the office to link
 * by hand. Returns null when there is no exact match, and also when there is
 * more than one - an ambiguous attach is the same problem.
 */
export async function findExactTransactionByAddress(
  address: string | null | undefined
): Promise<DuplicateMatch | null> {
  const matches = await findDuplicateTransactions(address)
  const exact = matches.filter(m => m.confidence === 'exact')
  return exact.length === 1 ? exact[0] : null
}
