/**
 * Low-commission flag + BTSA redistribution helper.
 *
 * Business rule (locked 2026-05-03):
 *   - Sales: side commission must be at least btsa_min_sale_pct% of sales_price
 *   - Leases: side commission must be at least btsa_min_lease_pct% of one
 *     month's rent
 *   - When a side is below threshold AND any TIA on that side has btsa_amount
 *     greater than zero, admin can redistribute: move the shortfall from BTSA
 *     into the side's office commission, until either the threshold is met or
 *     BTSA is exhausted.
 *
 * The flag itself is calculated, not stored. Redistribution writes the new
 * side_commission to the transaction and reduces btsa_amount on the
 * TIA row that holds it (single-BTSA-row assumption per Tara — multi-BTSA
 * rows are not redistributed automatically).
 */

import { isLeaseTransactionType } from './transactionTypes'
import { sideCategory, type Side } from './sides'

export interface CompanySettings {
  btsa_min_sale_pct: number | null  // 3 = 3%
  btsa_min_lease_pct: number | null // 40 = 40%
}

const DEFAULT_SALE_PCT = 3
const DEFAULT_LEASE_PCT = 40

export interface SideFlag {
  side: 'listing' | 'buying'
  flagged: boolean
  threshold: number          // dollar amount the side commission must hit
  side_commission: number    // current side commission
  shortfall: number          // threshold - side_commission (0 if not flagged)
  total_btsa_on_side: number // sum of btsa_amount on TIAs assigned to this side
  can_redistribute: boolean  // flagged AND total_btsa_on_side > 0
  reason: string             // human-readable summary
}

export interface FlagInputs {
  transaction: {
    transaction_type: string | null
    sales_price: number | null
    monthly_rent: number | null
    listing_side_commission: number | null
    buying_side_commission: number | null
  }
  internalAgents: Array<{
    side: string | null
    btsa_amount: number | null
  }>
  settings: CompanySettings | null | undefined
}

const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Compute the threshold in dollars for a given side of a transaction.
 * Returns 0 if there's no basis (no sales price / no rent).
 */
export function thresholdForSide(args: {
  transaction_type: string | null
  sales_price: number | null
  monthly_rent: number | null
  settings: CompanySettings | null | undefined
}): number {
  const { transaction_type, sales_price, monthly_rent, settings } = args
  const isLease = isLeaseTransactionType(transaction_type || '')
  if (isLease) {
    const pct = num(settings?.btsa_min_lease_pct) || DEFAULT_LEASE_PCT
    return round2(num(monthly_rent) * (pct / 100))
  } else {
    const pct = num(settings?.btsa_min_sale_pct) || DEFAULT_SALE_PCT
    return round2(num(sales_price) * (pct / 100))
  }
}

/**
 * Compute flag state for both sides of a transaction.
 * Returns one entry per side that has a side commission set on the
 * transaction. If a side has zero/null commission, it's not flagged
 * (treated as "not applicable to this deal").
 */
export function computeLowCommissionFlags(input: FlagInputs): SideFlag[] {
  const { transaction, internalAgents, settings } = input
  const threshold = thresholdForSide({
    transaction_type: transaction.transaction_type,
    sales_price: transaction.sales_price,
    monthly_rent: transaction.monthly_rent,
    settings,
  })

  if (threshold <= 0) return []

  const flags: SideFlag[] = []

  for (const sideName of ['listing', 'buying'] as const) {
    const sideCommissionRaw =
      sideName === 'listing'
        ? transaction.listing_side_commission
        : transaction.buying_side_commission
    const sideCommission = num(sideCommissionRaw)
    // Skip sides where there's no commission set (deal isn't structured for this side)
    if (sideCommission <= 0) continue

    // Sum BTSA on TIAs whose side falls into this category
    const totalBtsa = internalAgents
      .filter(a => sideCategory(a.side as Side | null) === sideName)
      .reduce((sum, a) => sum + num(a.btsa_amount), 0)

    const flagged = sideCommission < threshold
    const shortfall = flagged ? round2(threshold - sideCommission) : 0
    const canRedistribute = flagged && totalBtsa > 0

    let reason = ''
    if (!flagged) {
      reason = `${sideName === 'listing' ? 'Listing' : 'Buying'} side commission ($${sideCommission.toFixed(2)}) meets the $${threshold.toFixed(2)} threshold.`
    } else if (canRedistribute) {
      reason = `${sideName === 'listing' ? 'Listing' : 'Buying'} side commission ($${sideCommission.toFixed(2)}) is below the $${threshold.toFixed(2)} threshold. Shortfall of $${shortfall.toFixed(2)} can be redistributed from $${totalBtsa.toFixed(2)} BTSA on this side.`
    } else {
      reason = `${sideName === 'listing' ? 'Listing' : 'Buying'} side commission ($${sideCommission.toFixed(2)}) is below the $${threshold.toFixed(2)} threshold. No BTSA on this side to redistribute. Agent may need a written warning.`
    }

    flags.push({
      side: sideName,
      flagged,
      threshold: round2(threshold),
      side_commission: round2(sideCommission),
      shortfall,
      total_btsa_on_side: round2(totalBtsa),
      can_redistribute: canRedistribute,
      reason,
    })
  }

  return flags
}

/**
 * Plan a redistribution for one side. Returns the new side_commission, the
 * TIA row id whose btsa_amount needs updating, and the new btsa_amount.
 *
 * Per Tara: "manual because they not giving out multiple btsa" — so we
 * assume exactly one TIA per side has btsa_amount > 0. If multiple do,
 * we deduct from the largest one only and surface a warning so admin
 * can resolve manually.
 *
 * Caller is responsible for: writing the side_commission update on
 * `transactions`, writing btsa_amount on the TIA row, and appending a
 * note describing the change.
 */
export interface RedistributionPlan {
  side: 'listing' | 'buying'
  newSideCommission: number
  oldSideCommission: number
  movedAmount: number
  tiaRow: {
    id: string
    oldBtsa: number
    newBtsa: number
  }
  multipleBtsaRows: boolean // warning flag
}

export function planRedistribution(args: {
  flag: SideFlag
  internalAgents: Array<{ id: string; side: string | null; btsa_amount: number | null }>
}): RedistributionPlan | null {
  const { flag, internalAgents } = args
  if (!flag.can_redistribute) return null

  // Find TIAs on this side with BTSA, sorted by BTSA amount (largest first)
  const sideRows = internalAgents
    .filter(a => sideCategory(a.side as Side | null) === flag.side && num(a.btsa_amount) > 0)
    .sort((a, b) => num(b.btsa_amount) - num(a.btsa_amount))

  if (sideRows.length === 0) return null

  const target = sideRows[0]
  const targetBtsa = num(target.btsa_amount)

  // Move up to the shortfall, but no more than what's in BTSA on this row
  const moved = Math.min(flag.shortfall, targetBtsa)

  return {
    side: flag.side,
    oldSideCommission: flag.side_commission,
    newSideCommission: round2(flag.side_commission + moved),
    movedAmount: round2(moved),
    tiaRow: {
      id: target.id,
      oldBtsa: round2(targetBtsa),
      newBtsa: round2(targetBtsa - moved),
    },
    multipleBtsaRows: sideRows.length > 1,
  }
}

/**
 * Plan a redistribution UNDO. Returns the inverse plan.
 * Caller validates the prior redistribution actually happened (by reading
 * the transaction note or a separate audit field).
 */
export function planUndoRedistribution(args: {
  side: 'listing' | 'buying'
  movedAmount: number
  currentSideCommission: number
  tiaRowId: string
  currentBtsa: number
}): RedistributionPlan {
  const { side, movedAmount, currentSideCommission, tiaRowId, currentBtsa } = args
  return {
    side,
    oldSideCommission: round2(currentSideCommission),
    newSideCommission: round2(currentSideCommission - movedAmount),
    movedAmount: -round2(movedAmount), // negative indicates undo
    tiaRow: {
      id: tiaRowId,
      oldBtsa: round2(currentBtsa),
      newBtsa: round2(currentBtsa + movedAmount),
    },
    multipleBtsaRows: false,
  }
}
