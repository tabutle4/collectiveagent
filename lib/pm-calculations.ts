/**
 * Property Management calculations
 *
 * Centralizes the held-in-trust formula and per-property agreement lookup
 * so disbursement code, statement code, and dashboard widgets all read
 * from the same source of truth.
 *
 * Held-in-trust formula:
 *   sum(tenant_invoices.deposit_amount) where status = 'paid'
 *   - sum(landlord_disbursements.deposit_amount) where type='deposit' and paid
 *   - sum(tenant_disbursements.amount) where paid
 *   + sum(landlord_disbursements.reserve_amount) where type='rent' (any status)
 *   - sum(landlord_disbursements.deposit_amount) where type='reserve' and paid
 *
 * Both sides are computed live from the canonical tables; nothing is cached.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface HeldInTrustOptions {
  landlordId: string
  propertyId?: string
}

export interface HeldInTrustResult {
  depositsPaidIn: number
  returnedToLandlord: number
  returnedToTenant: number
  reserveHeld: number
  reserveReleased: number
  depositBalance: number
  reserveBalance: number
  heldInTrust: number
}

const COMPLETED_DISB_STATUSES = ['completed', 'paid']

export async function computeHeldInTrust(
  supabase: SupabaseClient,
  opts: HeldInTrustOptions
): Promise<HeldInTrustResult> {
  // 1. Security deposits paid in via tenant invoices
  let depositsQuery = supabase
    .from('tenant_invoices')
    .select('deposit_amount')
    .eq('status', 'paid')
    .eq('landlord_id', opts.landlordId)
  if (opts.propertyId) depositsQuery = depositsQuery.eq('property_id', opts.propertyId)
  const { data: paidInvoices } = await depositsQuery
  const depositsPaidIn = (paidInvoices || []).reduce(
    (sum, inv: any) => sum + Number(inv.deposit_amount || 0), 0
  )

  // 2. All landlord_disbursements for this landlord/property
  let disbQuery = supabase
    .from('landlord_disbursements')
    .select('deposit_amount, reserve_amount, disbursement_type, payment_status')
    .eq('landlord_id', opts.landlordId)
  if (opts.propertyId) disbQuery = disbQuery.eq('property_id', opts.propertyId)
  const { data: allDisbs } = await disbQuery

  // Security deposits returned to landlord (paid deposit-type disbursements)
  const returnedToLandlord = (allDisbs || [])
    .filter((d: any) => d.disbursement_type === 'deposit' && COMPLETED_DISB_STATUSES.includes(d.payment_status))
    .reduce((sum: number, d: any) => sum + Number(d.deposit_amount || 0), 0)

  // Reserve withheld from rent (all rent disbursements regardless of status)
  const reserveHeld = (allDisbs || [])
    .filter((d: any) => d.disbursement_type === 'rent')
    .reduce((sum: number, d: any) => sum + Number(d.reserve_amount || 0), 0)

  // Reserve released back to landlord (paid reserve-type disbursements)
  const reserveReleased = (allDisbs || [])
    .filter((d: any) => d.disbursement_type === 'reserve' && COMPLETED_DISB_STATUSES.includes(d.payment_status))
    .reduce((sum: number, d: any) => sum + Number(d.deposit_amount || 0), 0)

  // 3. Deposits refunded to tenant
  let tenantReturnsQuery = supabase
    .from('tenant_disbursements')
    .select('amount')
    .eq('landlord_id', opts.landlordId)
    .in('payment_status', COMPLETED_DISB_STATUSES)
  if (opts.propertyId) tenantReturnsQuery = tenantReturnsQuery.eq('property_id', opts.propertyId)
  const { data: tenantReturns } = await tenantReturnsQuery
  const returnedToTenant = (tenantReturns || []).reduce(
    (sum: number, d: any) => sum + Number(d.amount || 0), 0
  )

  const depositBalance = depositsPaidIn - returnedToLandlord - returnedToTenant
  const reserveBalance = reserveHeld - reserveReleased
  const heldInTrust = depositBalance + reserveBalance

  return {
    depositsPaidIn: round2(depositsPaidIn),
    returnedToLandlord: round2(returnedToLandlord),
    returnedToTenant: round2(returnedToTenant),
    reserveHeld: round2(reserveHeld),
    reserveReleased: round2(reserveReleased),
    depositBalance: round2(depositBalance),
    reserveBalance: round2(reserveBalance),
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
