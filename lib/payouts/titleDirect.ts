import { fetchAllRows } from '@/lib/supabase'

/**
 * Deals where title paid someone at the closing table.
 *
 * Both sides count. An internal agent and an outside brokerage are the same
 * event from the payouts account's point of view: title handed the money over
 * directly, no CRC account moved, and the check that would otherwise have
 * carried that money never arrived here as one sum.
 *
 * Centralised because three places need the same answer and had no business
 * disagreeing about it: the ledger posting rules, the sweep screen, and the
 * All Payouts office-net state. The rule was written inline in the first of
 * those; a second copy in the other two is how they drift.
 *
 * Read as two filtered queries rather than one join. PostgREST has no join to
 * offer here, and both tables are small once filtered (53 agent rows and 0
 * brokerage rows today). fetchAllRows is used regardless because
 * transaction_internal_agents is past 1,000 rows and a bare select would
 * truncate the moment the filter widened.
 */
export async function titleDirectTransactionIds(): Promise<Set<string>> {
  const [agents, externals] = await Promise.all([
    fetchAllRows<{ id: string; transaction_id: string | null }>(
      'transaction_internal_agents',
      'id, transaction_id',
      { filters: [{ type: 'eq', column: 'funding_source', value: 'title_direct' }] }
    ),
    fetchAllRows<{ id: string; transaction_id: string | null }>(
      'transaction_external_brokerages',
      'id, transaction_id',
      { filters: [{ type: 'eq', column: 'funding_source', value: 'title_direct' }] }
    ),
  ])

  const ids = new Set<string>()
  for (const row of [...(agents || []), ...(externals || [])]) {
    if (row.transaction_id) ids.add(row.transaction_id)
  }
  return ids
}
