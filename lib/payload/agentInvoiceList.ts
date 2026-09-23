/**
 * Reading an agent's invoices out of Payload, one page at a time.
 *
 * Lifted verbatim from app/api/admin/payload/cleanup-offset-duplicates, which
 * defined it privately and was the only caller. The autopay sweep needs the
 * same walk, and two copies of a paging loop whose whole job is "did we
 * actually see all of them" is how they drift.
 */

import { isCommissionOffsetItem } from '@/lib/payload/commissionOffsetItems'

const PAYLOAD_API = 'https://api.payload.com'

export const PAUSE_MS = 120
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

// Payload documents limit and offset on list endpoints but publishes no
// maximum limit (https://docs.payload.com/apis/api-design/). A single
// limit=200 request would therefore miss everything past whatever cap Payload
// actually applies, with no error. So page explicitly with a conservative page
// size and keep going until a short page arrives.
const PAGE_SIZE = 100
const MAX_PAGES = 20

export interface InvoicePageResult {
  values: any[]
  rateLimited: boolean
  /**
   * True when this agent's invoice list could NOT be read in full, for any
   * reason. Every path that returns early without reaching the end of the set
   * must set this.
   *
   * The point is that an agent whose list is incomplete must never be counted
   * as done. A partial list with no flag would report a transient failure on
   * page two as a fully scanned, clean agent.
   */
  incomplete: boolean
  reason?: string
}

export async function listAgentInvoices(customerId: string): Promise<InvoicePageResult> {
  const all: any[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `${PAYLOAD_API}/invoices/?customer_id=${customerId}&limit=${PAGE_SIZE}&offset=${
        page * PAGE_SIZE
      }&fields[]=*&fields[]=items`,
      { headers: { Authorization: authHeader() } }
    )
    if (res.status === 429) {
      return { values: all, rateLimited: true, incomplete: true, reason: 'rate limited' }
    }
    if (!res.ok) {
      // Includes a customer_id Payload does not recognise (404), which is the
      // expected result for an agent billed on a different Payload account.
      // Reported rather than assumed empty: the honest statement is that this
      // agent's invoices could not be read, not that they have none.
      return {
        values: all,
        rateLimited: false,
        incomplete: true,
        reason: `HTTP ${res.status}${page > 0 ? ` on page ${page + 1}` : ''}`,
      }
    }
    const data = await res.json()
    const values = data?.values || []
    all.push(...values)
    // A page shorter than what was asked for is the end of the set. This also
    // covers the case where Payload caps limit below PAGE_SIZE: the short page
    // ends the loop early, which is why PAGE_SIZE is conservative.
    if (values.length < PAGE_SIZE) {
      return { values: all, rateLimited: false, incomplete: false }
    }
    await sleep(PAUSE_MS)
  }
  // MAX_PAGES * PAGE_SIZE invoices for one agent means something unexpected.
  // Report it rather than silently truncating.
  return {
    values: all,
    rateLimited: false,
    incomplete: true,
    reason: `more than ${MAX_PAGES * PAGE_SIZE} invoices`,
  }
}

/** The monthly brokerage fee itself. */
export const MONTHLY_FEE_ITEM_TYPES = ['Monthly Fee', 'Monthly Fee (Prorated)']

/**
 * Lines that legitimately ride along on a monthly fee invoice without changing
 * what it is. A late fee is a consequence of not paying the monthly fee, not a
 * separate bill, so an overdue monthly invoice is still a monthly invoice.
 * app/api/cron/apply-late-fees appends this to unpaid monthly invoices the
 * morning after the due date.
 */
export const MONTHLY_FEE_COMPANION_TYPES = ['Late Fee']

/**
 * ── Why `type` alone cannot be trusted ─────────────────────────────────────
 *
 * Payload's LineItem reference calls `type` an optional "Arbitrary type
 * classification" (https://docs.payload.com/apis/object-reference/line-items/).
 * It is not reliably kept. Kennedy Dixon's September 2026 monthly invoice came
 * back from the invoice inspector with `type: null` on its only line item,
 * while Breia Gordon's and Amanda Clarke's monthly invoices from the same cron
 * carry theirs. Same code, same month, different outcome per invoice.
 *
 * An invoice whose type was dropped is invisible to every predicate here: the
 * sweep reads a real monthly fee as a custom invoice and would switch autopay
 * off on it, and the late fee cron skips the agent entirely.
 *
 * `description` is stored intact - 36 characters survived on the same invoice
 * whose type was lost, and the 24-character truncation documented in
 * claude/payload-type-field-24-char-truncation.md applies only to `type`. So
 * every line predicate below matches on type OR description.
 *
 * NOTE: the truncation-tolerant `typeMatches` helper in commissionOffsetItems
 * is deliberately NOT used here. It accepts a stored value that is a prefix of
 * the expected one, and 'Monthly Fee' is a prefix of 'Monthly Fee (Prorated)',
 * so it would blur the two. These type strings are all well under 24
 * characters and are never truncated, so exact comparison is correct.
 */

/**
 * Matches every monthly fee description this app writes:
 *
 *   'October 2026 Monthly Brokerage Fee'              create-monthly-invoices,
 *                                                     create-invoice (monthly)
 *   'Prorated monthly fee, 14 days remaining in ...'  create-invoice (onboarding)
 *   'Prorated Monthly Fee - 10/03/26 to 10/31/26'     onboarding/create-payment
 *
 * Deliberately requires the word "fee" next to "monthly" rather than "monthly"
 * on its own, so a custom invoice for something billed monthly does not read as
 * the brokerage fee. It does not match either onboarding line
 * ('One-time onboarding fee', 'Non-Refundable Onboarding Fee'), which is what
 * keeps a $399 join invoice out.
 */
const MONTHLY_FEE_DESCRIPTION = /monthly\s+(?:brokerage\s+)?fee/i

/** Matches 'Late fee: payment not received by the 5th', written by apply-late-fees. */
const LATE_FEE_DESCRIPTION = /late\s+fee/i

const typeOf = (item: any): string => String(item?.type ?? '')
const descriptionOf = (item: any): string => String(item?.description ?? '')

/** One line item that is the monthly brokerage fee, prorated or not. */
export const isMonthlyFeeLine = (item: any): boolean =>
  MONTHLY_FEE_ITEM_TYPES.includes(typeOf(item)) ||
  MONTHLY_FEE_DESCRIPTION.test(descriptionOf(item))

/** One line item that is a late fee. */
export const isLateFeeLine = (item: any): boolean =>
  MONTHLY_FEE_COMPANION_TYPES.includes(typeOf(item)) ||
  LATE_FEE_DESCRIPTION.test(descriptionOf(item))

/**
 * True when this invoice already carries a late fee.
 *
 * Scans every item rather than only the positive charge lines, which is what
 * the inline check in apply-late-fees did before this module existed. The
 * question being asked is "has a late fee already been applied", and a late fee
 * found in any shape must block a second one. Erring toward finding one means
 * erring toward not charging.
 */
export const hasLateFeeLine = (inv: any): boolean =>
  (inv?.items || []).some(isLateFeeLine)

/**
 * The lines that represent something the agent was actually billed for.
 *
 * Everything else on a Payload invoice is bookkeeping and must not be read as
 * a charge:
 *
 *   entry_type 'payment'            a real card or bank payment
 *   negative 'charge' lines         how this app records a settlement, both
 *                                   the commission offset and the Zelle/check/
 *                                   ACH rows mark-invoice-paid writes
 *   commission offset + reversal    synthetic staging rows, positive OR
 *                                   negative, caught by the shared predicate
 */
const chargeLines = (inv: any): any[] =>
  (inv?.items || []).filter(
    (i: any) =>
      i?.entry_type === 'charge' && Number(i?.amount) > 0 && !isCommissionOffsetItem(i)
  )

/**
 * True when this invoice is the agent's monthly brokerage fee.
 *
 * This has now been wrong in both directions, so the rule is spelled out:
 *
 *   `some` was wrong.  The join invoice is 'Onboarding Fee' + 'Monthly Fee
 *   (Prorated)', so matching on any line let a $399 invoice pass as a monthly
 *   fee - waved through by the code written to keep it out.
 *
 *   `every` over ALL items was also wrong, and worse in practice. An unpaid
 *   monthly fee picks up a 'Late Fee' line on the 6th, and may carry commission
 *   offset or settlement rows. Requiring every line to be a monthly fee meant
 *   every OVERDUE monthly fee was classified as something else - so the sweep
 *   listed them and would have switched autopay off on exactly the invoices
 *   autopay exists to collect.
 *
 * The rule that holds: look only at real charge lines, require at least one to
 * be the monthly fee, and require all of them to be the fee or something that
 * rides along with it. A join invoice fails because the onboarding line is
 * neither, by type or by description.
 */
export const isMonthlyFeeInvoice = (inv: any): boolean => {
  const charges = chargeLines(inv)
  if (charges.length === 0) return false

  return (
    charges.some(isMonthlyFeeLine) &&
    charges.every((i: any) => isMonthlyFeeLine(i) || isLateFeeLine(i))
  )
}

/**
 * True if the invoice's description, or any of its line item descriptions, is
 * for the given month and year.
 *
 * Lifted verbatim from app/api/cron/create-monthly-invoices, which defined it
 * privately. It now has a second caller with money attached: apply-late-fees
 * uses it to refuse to touch any month but the one that just came due, so the
 * two must not be allowed to drift apart.
 *
 * Reading both the invoice description and the item descriptions is what makes
 * it survive editing. The office can retype an invoice's description in the
 * Payload dashboard; the line item description written at creation is left
 * alone, and either one is enough.
 *
 * Note the failure direction. An invoice whose month can no longer be read
 * matches nothing, so it is skipped rather than charged. That costs the
 * brokerage a late fee it was owed. The reverse - charging the wrong month -
 * costs an agent money they do not owe, and is the one this must never do.
 */
export function isInvoiceForTargetMonth(inv: any, monthName: string, year: number): boolean {
  const haystack = (
    (inv.description || '') + ' ' +
    (inv.items || []).map((i: any) => i.description || '').join(' ')
  ).toLowerCase()
  return haystack.includes(monthName.toLowerCase()) && haystack.includes(String(year))
}
