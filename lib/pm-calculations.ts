/**
 * Property Management calculations
 *
 * Centralizes the held-in-trust formula and per-property agreement lookup
 * so disbursement code, statement code, and dashboard widgets all read
 * from the same source of truth.
 *
 * Held-in-trust formula (post pm_ledger deprecation):
 *   sum(tenant_invoices.deposit_amount) where status = 'paid'
 *   - sum(landlord_disbursements.deposit_amount)
 *   - sum(tenant_disbursements.amount)
 *
 * Both sides are computed live from the canonical tables; nothing is
 * cached. If you change a deposit on an invoice or post a new tenant
 * disbursement, the held-in-trust number updates immediately on next read.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface HeldInTrustOptions {
  landlordId: string
  propertyId?: string // optional - omit to compute landlord-wide total
}

export interface HeldInTrustResult {
  depositsPaidIn: number
  returnedToLandlord: number
  returnedToTenant: number
  heldInTrust: number
}

/**
 * Compute the deposits-held-in-trust balance for a landlord (and
 * optionally narrowed to one property). Reads only from canonical
 * tables; no pm_ledger access.
 *
 * IMPORTANT: only counts disbursements with payment_status in
 * ('completed', 'paid'). Pending refunds (still queued, money hasn't
 * left the trust account yet) do NOT reduce the held-in-trust balance.
 * This matches TREC-style trust accounting: balance reflects actual
 * cash in the trust bank account, not future commitments.
 */
const COMPLETED_DISB_STATUSES = ['completed', 'paid']

export async function computeHeldInTrust(
  supabase: SupabaseClient,
  opts: HeldInTrustOptions
): Promise<HeldInTrustResult> {
  // 1. Deposits paid in via tenant invoices
  let depositsQuery = supabase
    .from('tenant_invoices')
    .select('deposit_amount, property_id, landlord_id')
    .eq('status', 'paid')
    .eq('landlord_id', opts.landlordId)
  if (opts.propertyId) {
    depositsQuery = depositsQuery.eq('property_id', opts.propertyId)
  }
  const { data: paidInvoices } = await depositsQuery
  const depositsPaidIn = (paidInvoices || []).reduce(
    (sum, inv: any) => sum + Number(inv.deposit_amount || 0),
    0
  )

  // 2. Deposits returned to landlord via disbursements - completed only
  let landlordReturnsQuery = supabase
    .from('landlord_disbursements')
    .select('deposit_amount, property_id, landlord_id, payment_status')
    .eq('landlord_id', opts.landlordId)
    .in('payment_status', COMPLETED_DISB_STATUSES)
  if (opts.propertyId) {
    landlordReturnsQuery = landlordReturnsQuery.eq('property_id', opts.propertyId)
  }
  const { data: landlordReturns } = await landlordReturnsQuery
  const returnedToLandlord = (landlordReturns || []).reduce(
    (sum, d: any) => sum + Number(d.deposit_amount || 0),
    0
  )

  // 3. Deposits returned to tenant directly - completed only
  let tenantReturnsQuery = supabase
    .from('tenant_disbursements')
    .select('amount, property_id, landlord_id, payment_status')
    .eq('landlord_id', opts.landlordId)
    .in('payment_status', COMPLETED_DISB_STATUSES)
  if (opts.propertyId) {
    tenantReturnsQuery = tenantReturnsQuery.eq('property_id', opts.propertyId)
  }
  const { data: tenantReturns } = await tenantReturnsQuery
  const returnedToTenant = (tenantReturns || []).reduce(
    (sum, d: any) => sum + Number(d.amount || 0),
    0
  )

  const heldInTrust = depositsPaidIn - returnedToLandlord - returnedToTenant

  return {
    depositsPaidIn: round2(depositsPaidIn),
    returnedToLandlord: round2(returnedToLandlord),
    returnedToTenant: round2(returnedToTenant),
    heldInTrust: round2(heldInTrust),
  }
}

export interface AgreementForProperty {
  id: string
  management_fee_pct: number | null
  management_fee_flat: number | null
  referring_agent_id: string | null
  agent_fee_pct: number | null
}

/**
 * Find the active PM agreement attached to a specific property.
 *
 * managed_properties.pm_agreement_id is the foreign key. A landlord
 * may have multiple agreements (one per property), so callers MUST
 * resolve by property, not by landlord.
 *
 * Returns null if the property has no agreement attached yet.
 */
export async function getAgreementForProperty(
  supabase: SupabaseClient,
  propertyId: string
): Promise<AgreementForProperty | null> {
  const { data: property } = await supabase
    .from('managed_properties')
    .select('pm_agreement_id')
    .eq('id', propertyId)
    .single()

  if (!property?.pm_agreement_id) return null

  const { data: agreement } = await supabase
    .from('pm_agreements')
    .select('id, management_fee_pct, management_fee_flat, referring_agent_id, agent_fee_pct')
    .eq('id', property.pm_agreement_id)
    .single()

  return agreement as AgreementForProperty | null
}

/**
 * Calculate the management fee for a rent amount given a specific
 * property's agreement. Flat fee wins when set; otherwise percentage
 * applies to RENT ONLY (not the deposit portion).
 *
 * Returns 0 if no agreement is attached - caller can decide whether
 * to error, fall back to a default, or let admin enter manually.
 */
export function calculateManagementFee(
  rentAmount: number,
  agreement: AgreementForProperty | null
): { amount: number; source: 'flat' | 'percentage' | 'none' } {
  if (!agreement) {
    return { amount: 0, source: 'none' }
  }
  if (agreement.management_fee_flat != null && Number(agreement.management_fee_flat) > 0) {
    return { amount: round2(Number(agreement.management_fee_flat)), source: 'flat' }
  }
  if (agreement.management_fee_pct != null && Number(agreement.management_fee_pct) > 0) {
    return {
      amount: round2(rentAmount * (Number(agreement.management_fee_pct) / 100)),
      source: 'percentage',
    }
  }
  return { amount: 0, source: 'none' }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
