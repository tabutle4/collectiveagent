/**
 * The tenant's current lease, resolved one way.
 *
 * Several places need to answer "which lease is this tenant on right now": the
 * tenant dashboard, the tenant repair submission, and anything added later.
 * They each had their own copy of the filter and the ordering. That is fine
 * until one of them changes, at which point a tenant whose dashboard shows
 * lease A files a repair against lease B and nobody notices, because both
 * leases are real and both belong to them. Renewals make this concrete: a
 * tenant part way through one is genuinely on two active leases at once.
 *
 * Most recently created active lease wins. Callers that need extra columns pass
 * their own select string, but the filter, the ordering and the tie-break all
 * live here, so callers cannot disagree about WHICH lease is current.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const ACTIVE_LEASE_FIELDS = 'id, property_id, landlord_id'

export interface ActiveLease {
  id: string
  property_id: string
  landlord_id: string
}

export interface ActiveLeaseResult<T> {
  lease: T | null
  /** Set only when the lookup itself failed. A tenant with no lease is lease: null, error: null. */
  error: { message: string } | null
}

/**
 * The tenant's current active lease, or null if they have none.
 *
 * Pass `selectFields` to get more columns back; the filter and tie-break are
 * fixed here so every caller resolves the same lease.
 */
export async function fetchActiveLease<T = ActiveLease>(
  supabase: SupabaseClient,
  tenantId: string,
  selectFields: string = ACTIVE_LEASE_FIELDS
): Promise<ActiveLeaseResult<T>> {
  const { data, error } = await supabase
    .from('pm_leases')
    .select(selectFields)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    // Secondary sort so the answer is deterministic. Two leases created in the
    // same transaction (a renewal written by a script) otherwise come back in
    // whatever order Postgres feels like, which is the exact disagreement
    // between callers this module exists to prevent.
    .order('id', { ascending: true })
    .limit(1)

  if (error) {
    return { lease: null, error }
  }

  return { lease: ((data as unknown as T[])?.[0] as T) || null, error: null }
}
