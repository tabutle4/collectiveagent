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
 * rides along with it. A join invoice fails because 'Onboarding Fee' is neither.
 */
export const isMonthlyFeeInvoice = (inv: any): boolean => {
  const charges = chargeLines(inv)
  if (charges.length === 0) return false

  const allowed = [...MONTHLY_FEE_ITEM_TYPES, ...MONTHLY_FEE_COMPANION_TYPES]
  return (
    charges.some((i: any) => MONTHLY_FEE_ITEM_TYPES.includes(i?.type)) &&
    charges.every((i: any) => allowed.includes(i?.type))
  )
}
