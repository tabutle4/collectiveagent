/**
 * Central source of truth for transaction_type codes and their display labels.
 *
 * This file replaces four hardcoded label maps that had drifted out of sync.
 * It also includes legacy code aliases so UI continues to work BEFORE and
 * AFTER the tenant_other_v2 → tenant_non_apt_v2 data migration.
 *
 * Keep this file in sync with the `processing_fee_types` table (code column).
 */

/** Canonical v2 code labels — keys match the DB `processing_fee_types.code` column. */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  // Sale — buyer side
  buyer_v2: 'Buyer',
  nc_buyer_v2: 'New Construction Buyer',
  land_buyer_v2: 'Land/Lot Buyer',
  commercial_buyer_v2: 'Commercial Buyer',
  business_buyer_v2: 'Business Buyer',

  // Sale — seller side
  seller_v2: 'Seller',
  land_seller_v2: 'Land/Lot Seller',
  commercial_seller_v2: 'Commercial Seller',
  business_seller_v2: 'Business Seller',

  // Lease — landlord side
  landlord_v2: 'Landlord',
  landlord_apt_v2: 'Landlord (apartment)',
  commercial_landlord_v2: 'Commercial Landlord',

  // Lease — tenant side
  tenant_apt_v2: 'Tenant (apartment)',
  tenant_non_apt_v2: 'Tenant (not apartment)',
  tenant_simplyhome_v2: 'Tenant (SimplyHome Rental)',
  tenant_commercial_v2: 'Tenant (commercial lease)',

  // Other
  referred_out_v2: 'Referred Out',
}

/**
 * Legacy code aliases. Used when:
 *   1. DB still has old codes awaiting migration (e.g., tenant_other_v2 before the
 *      fee-types migration runs).
 *   2. Old code in other modules still references renamed codes.
 *
 * Each alias maps to the canonical code's label, not to the alias itself.
 */
const LEGACY_ALIASES: Record<string, string> = {
  tenant_other_v2: TRANSACTION_TYPE_LABELS.tenant_non_apt_v2,
  new_construction_buyer_v2: TRANSACTION_TYPE_LABELS.nc_buyer_v2,
  land_lot_buyer_v2: TRANSACTION_TYPE_LABELS.land_buyer_v2,
  land_lot_seller_v2: TRANSACTION_TYPE_LABELS.land_seller_v2,
}

/**
 * Returns a human-readable label for a transaction_type code.
 * Falls back to a de-snake-cased version of the code if unknown.
 */
export function getTransactionTypeLabel(
  code: string | null | undefined
): string {
  if (!code) return '--'
  if (code in TRANSACTION_TYPE_LABELS) return TRANSACTION_TYPE_LABELS[code]
  if (code in LEGACY_ALIASES) return LEGACY_ALIASES[code]
  // Unknown code — prettify it as a fallback so UI still reads
  return code.replace(/_v2$/, '').replace(/_/g, ' ')
}

/**
 * Dropdown options sorted by logical grouping (buyer side → seller side →
 * landlord side → tenant side → other).
 */
export const TRANSACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'buyer_v2', label: TRANSACTION_TYPE_LABELS.buyer_v2 },
  { value: 'nc_buyer_v2', label: TRANSACTION_TYPE_LABELS.nc_buyer_v2 },
  { value: 'land_buyer_v2', label: TRANSACTION_TYPE_LABELS.land_buyer_v2 },
  { value: 'commercial_buyer_v2', label: TRANSACTION_TYPE_LABELS.commercial_buyer_v2 },
  { value: 'business_buyer_v2', label: TRANSACTION_TYPE_LABELS.business_buyer_v2 },
  { value: 'seller_v2', label: TRANSACTION_TYPE_LABELS.seller_v2 },
  { value: 'land_seller_v2', label: TRANSACTION_TYPE_LABELS.land_seller_v2 },
  { value: 'commercial_seller_v2', label: TRANSACTION_TYPE_LABELS.commercial_seller_v2 },
  { value: 'business_seller_v2', label: TRANSACTION_TYPE_LABELS.business_seller_v2 },
  { value: 'landlord_v2', label: TRANSACTION_TYPE_LABELS.landlord_v2 },
  { value: 'landlord_apt_v2', label: TRANSACTION_TYPE_LABELS.landlord_apt_v2 },
  { value: 'commercial_landlord_v2', label: TRANSACTION_TYPE_LABELS.commercial_landlord_v2 },
  { value: 'tenant_apt_v2', label: TRANSACTION_TYPE_LABELS.tenant_apt_v2 },
  { value: 'tenant_non_apt_v2', label: TRANSACTION_TYPE_LABELS.tenant_non_apt_v2 },
  { value: 'tenant_simplyhome_v2', label: TRANSACTION_TYPE_LABELS.tenant_simplyhome_v2 },
  { value: 'tenant_commercial_v2', label: TRANSACTION_TYPE_LABELS.tenant_commercial_v2 },
  { value: 'referred_out_v2', label: TRANSACTION_TYPE_LABELS.referred_out_v2 },
]

/**
 * Substring-based lease detection. Works for all current v2 codes and any
 * future codes that contain one of these markers.
 */
export function isLeaseTransactionType(
  code: string | null | undefined
): boolean {
  if (!code) return false
  const c = code.toLowerCase()
  return (
    c.includes('lease') ||
    c.includes('apartment') ||
    c.includes('rent') ||
    c.includes('tenant') ||
    c.includes('landlord')
  )
}

export type TransactionTypeCategory =
  | 'Buyers'
  | 'Sellers'
  | 'Tenants'
  | 'Landlords'
  | 'Referred Out'

/**
 * Category bucket for dashboard aggregations. Returns null for unknown codes.
 */
export function getTransactionTypeCategory(
  code: string | null | undefined
): TransactionTypeCategory | null {
  if (!code) return null

  // Explicit mappings for the canonical + aliased codes
  const BUYER_CODES = new Set([
    'buyer_v2',
    'nc_buyer_v2',
    'land_buyer_v2',
    'commercial_buyer_v2',
    'business_buyer_v2',
    // legacy aliases
    'new_construction_buyer_v2',
    'land_lot_buyer_v2',
  ])
  const SELLER_CODES = new Set([
    'seller_v2',
    'land_seller_v2',
    'commercial_seller_v2',
    'business_seller_v2',
    // legacy aliases
    'land_lot_seller_v2',
  ])
  const TENANT_CODES = new Set([
    'tenant_apt_v2',
    'tenant_non_apt_v2',
    'tenant_simplyhome_v2',
    'tenant_commercial_v2',
    // legacy aliases
    'tenant_other_v2',
  ])
  const LANDLORD_CODES = new Set([
    'landlord_v2',
    'landlord_apt_v2',
    'commercial_landlord_v2',
  ])

  if (BUYER_CODES.has(code)) return 'Buyers'
  if (SELLER_CODES.has(code)) return 'Sellers'
  if (TENANT_CODES.has(code)) return 'Tenants'
  if (LANDLORD_CODES.has(code)) return 'Landlords'
  if (code === 'referred_out_v2') return 'Referred Out'

  return null
}
