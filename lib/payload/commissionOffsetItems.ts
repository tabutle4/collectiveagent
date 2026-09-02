/**
 * Identifying the synthetic Payload line items this app writes to settle an
 * invoice against a commission. Kept in its own module with no imports so the
 * Billing page and the agent Fees page (client components) share one
 * definition with the API routes instead of each carrying its own copy.
 *
 * ── Why the type string alone is not enough ────────────────────────────────
 *
 * `POST /api/payload/mark-invoice-paid` offers four methods, and one of them
 * is labelled "Commission Offset". It writes its line item as
 * `type: 'Payment (' + methodLabel + ')'`, which for that method produces
 * `Payment (Commission Offset)` - character for character the same type
 * string a staged commission offset uses.
 *
 * So a manually recorded settlement and a staged offset cannot be told apart
 * by type. They differ by DESCRIPTION:
 *
 *   staged offset      description = 'Commission Offset'          (exact)
 *   mark-invoice-paid  description = 'Paid via Commission Offset'
 *                                or 'Commission Offset: <note>'
 *
 * A staged offset is therefore matched on type AND an exact description. This
 * matters because `removeCommissionOffsets` DELETES what these predicates
 * return: matching on type alone would delete a real payment the office had
 * recorded, reopen the invoice, and withhold the fee from a commission on top
 * of money already collected.
 *
 * The reversal type needs no such guard - mark-invoice-paid always prefixes
 * `Payment (`, so it can never produce a `Reversal (...)` type.
 *
 * Real card payments are `entry_type: 'payment'` and carry neither type, so
 * they were never at risk.
 */

/** Type string on a staged commission offset. NOT unique on its own. */
export const COMMISSION_OFFSET_TYPE = 'Payment (Commission Offset)'

/**
 * Exact description on a staged commission offset. This is the half that
 * distinguishes it from a manually recorded "Commission Offset" settlement,
 * so every writer must use this constant and nothing else.
 */
export const COMMISSION_OFFSET_DESCRIPTION = 'Commission Offset'

/** Type string on the positive reversal the old unstage path left behind. */
export const COMMISSION_OFFSET_REVERSAL_TYPE = 'Reversal (Commission Offset Removed)'

/**
 * A commission offset written by staging a debt, or by the payout auto-settle
 * path. Safe to delete when the staging is undone.
 *
 * Both halves are required. See the module comment: type alone also matches a
 * settlement the office recorded by hand through the Mark Paid modal, which
 * must never be deleted.
 */
export function isStagedCommissionOffset(item: any): boolean {
  return (
    String(item?.type ?? '') === COMMISSION_OFFSET_TYPE &&
    String(item?.description ?? '') === COMMISSION_OFFSET_DESCRIPTION
  )
}

/**
 * The positive reversal charge the old unstage path appended instead of
 * removing the offset. This is the line item that doubled invoice totals.
 */
export function isCommissionOffsetReversal(item: any): boolean {
  return String(item?.type ?? '') === COMMISSION_OFFSET_REVERSAL_TYPE
}

/**
 * Either synthetic row: a staged offset or an offset reversal. Used by the
 * display helpers below and by the runtime removal.
 */
export function isCommissionOffsetItem(item: any): boolean {
  return isStagedCommissionOffset(item) || isCommissionOffsetReversal(item)
}

/**
 * The line items an invoice actually billed for, for the per-item breakdown
 * the Billing page and the agent Fees page render. The synthetic offset and
 * reversal rows are left out: they are bookkeeping entries the app writes to
 * settle an invoice against a commission, and listing them read as extra
 * charges on the invoice.
 */
export function realChargeItems(invoice: any): any[] {
  return (invoice?.items || []).filter(
    (i: any) => i?.entry_type === 'charge' && !isCommissionOffsetItem(i)
  )
}

/**
 * Sum of the real charges on an invoice: what the agent was actually billed.
 *
 * Excludes the synthetic offset and reversal rows, which is what made a $50
 * fee that had been staged and unstaged read $100 in Payment History. The old
 * unstage path reversed the offset by appending a second positive $50 charge
 * rather than removing the offset, so every positive-line-item sum doubled.
 */
export function billedChargeTotal(invoice: any): number {
  return (invoice?.items || []).reduce((sum: number, item: any) => {
    if (isCommissionOffsetItem(item)) return sum
    const amt = Number(item?.amount) || 0
    return amt > 0 ? sum + amt : sum
  }, 0)
}
