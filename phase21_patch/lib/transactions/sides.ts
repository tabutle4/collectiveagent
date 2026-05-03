/**
 * Side utilities for transaction internal agents.
 *
 * The `side` enum captures which side of a deal an agent represents:
 *   - 'buyer' / 'tenant' — buying side
 *   - 'seller' / 'landlord' — listing side
 *
 * Phase 1 added `transaction_internal_agents.side` and
 * `transaction_external_brokerages.side` columns. This module is the single
 * source of truth for side-related logic going forward.
 */

export type Side = 'buyer' | 'seller' | 'tenant' | 'landlord'

export type SideCategory = 'buying' | 'listing'

const BUYING_SIDES: ReadonlyArray<Side> = ['buyer', 'tenant']
const LISTING_SIDES: ReadonlyArray<Side> = ['seller', 'landlord']

/**
 * Categorize a side into 'buying' or 'listing'. Returns null on invalid input.
 */
export function sideCategory(side: Side | string | null | undefined): SideCategory | null {
  if (!side) return null
  if (BUYING_SIDES.includes(side as Side)) return 'buying'
  if (LISTING_SIDES.includes(side as Side)) return 'listing'
  return null
}

/**
 * Given a transaction_type, return the matching side for a primary/listing
 * agent. Used as the default side when adding a new agent.
 *
 * Conventions:
 *   - buyer_v2                  → buyer (primary)
 *   - seller_v2                 → seller (listing)
 *   - tenant_apt_v2             → tenant (primary)
 *   - tenant_non_apt_v2         → tenant (primary)
 *   - landlord_v2               → landlord (listing)
 *   - landlord_apt_v2           → landlord (listing)
 *
 * For intermediary deals, the `transaction_type` represents the listing-side
 * type by convention. Buying-side primary agents on intermediary deals use the
 * `other_side_transaction_type` to determine their side.
 *
 * Internal — used by defaultSideForRoleAndTransaction.
 */
function defaultSideForTransactionType(
  transactionType: string | null | undefined
): Side | null {
  if (!transactionType) return null
  const t = transactionType.toLowerCase()
  if (t.includes('landlord')) return 'landlord'
  if (t.includes('seller')) return 'seller'
  if (t.includes('tenant')) return 'tenant'
  if (t.includes('buyer')) return 'buyer'
  return null
}

/**
 * Default side for an agent given (a) the transaction's type, (b) whether the
 * deal is intermediary, and (c) the role being assigned. Returns the most
 * sensible side for that role on that deal.
 */
export function defaultSideForRoleAndTransaction(
  agentRole: string,
  transactionType: string | null | undefined,
  isIntermediary: boolean,
  otherSideTransactionType?: string | null
): Side | null {
  // Listing roles always sit on the listing side (seller or landlord)
  if (agentRole === 'listing_agent') {
    return defaultSideForTransactionType(transactionType)
  }

  // Primary agents sit on the buying side for intermediary deals (since
  // transaction_type represents the listing side by convention) and on the
  // type-implied side for non-intermediary deals.
  if (agentRole === 'primary_agent') {
    if (isIntermediary) {
      return defaultSideForTransactionType(otherSideTransactionType || transactionType)
    }
    return defaultSideForTransactionType(transactionType)
  }

  // Co-agent, team_lead, momentum_partner, referral_agent: side is normally
  // inherited from the source primary at link time. Default to the
  // type-implied side.
  return defaultSideForTransactionType(transactionType)
}

/**
 * UI label for a side. e.g. 'Buyer side' / 'Listing side'.
 */
export function sideLabel(side: Side | string | null | undefined): string {
  if (!side) return ''
  switch (side) {
    case 'buyer':    return 'Buyer'
    case 'seller':   return 'Seller'
    case 'tenant':   return 'Tenant'
    case 'landlord': return 'Landlord'
    default:         return String(side)
  }
}

/**
 * Given a transaction record, return the listing-side commission amount.
 *
 * For non-intermediary deals: this equals office_gross (whole deal goes to
 * one side).
 * For intermediary deals: this is the listing_side_commission, falling back
 * to office_gross / 2 if not set.
 *
 * Internal — used by defaultBasisForSide.
 */
function listingSideCommission(transaction: any): number {
  if (!transaction) return 0
  const officeGross = parseFloat(transaction.office_gross ?? 0) || 0
  const listingSide = parseFloat(transaction.listing_side_commission ?? 0) || 0
  if (transaction.is_intermediary) {
    if (listingSide > 0) return listingSide
    // Fallback: split office_gross evenly between sides
    const buyingSide = parseFloat(transaction.buying_side_commission ?? 0) || 0
    if (buyingSide > 0 && officeGross > 0) return officeGross - buyingSide
    return officeGross / 2
  }
  // Non-intermediary: only listing_agent rows use this; whole office_gross
  return officeGross
}

/**
 * Given a transaction record, return the buying-side commission amount.
 *
 * Internal — used by defaultBasisForSide.
 */
function buyingSideCommission(transaction: any): number {
  if (!transaction) return 0
  const officeGross = parseFloat(transaction.office_gross ?? 0) || 0
  const buyingSide = parseFloat(transaction.buying_side_commission ?? 0) || 0
  if (transaction.is_intermediary) {
    if (buyingSide > 0) return buyingSide
    const listingSide = parseFloat(transaction.listing_side_commission ?? 0) || 0
    if (listingSide > 0 && officeGross > 0) return officeGross - listingSide
    return officeGross / 2
  }
  // Non-intermediary: only primary_agent rows use this; whole office_gross
  return officeGross
}

/**
 * Default agent_basis for a given side. Used when smart-calc seeds the basis
 * for a freshly added agent or for a side-aware recalc.
 */
export function defaultBasisForSide(
  transaction: any,
  side: Side | string | null | undefined
): number {
  const cat = sideCategory(side)
  if (cat === 'listing') return listingSideCommission(transaction)
  if (cat === 'buying')  return buyingSideCommission(transaction)
  // Unknown side → fall back to office_gross
  return parseFloat(transaction?.office_gross ?? 0) || 0
}

/**
 * INTERMEDIARY badge content/style helpers.
 */
export function intermediaryBadgeProps(transaction: any): {
  show: boolean
  label: string
  className: string
} {
  const show = Boolean(transaction?.is_intermediary)
  return {
    show,
    label: 'INTERMEDIARY',
    className: 'inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded text-luxury-accent border border-luxury-accent/40 bg-luxury-accent/5',
  }
}
