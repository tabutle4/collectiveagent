/**
 * Reading an agent's invoices out of Payload, one page at a time.
 *
 * Lifted verbatim from app/api/admin/payload/cleanup-offset-duplicates, which
 * defined it privately and was the only caller. The autopay sweep needs the
 * same walk, and two copies of a paging loop whose whole job is "did we
 * actually see all of them" is how they drift.
 */

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

/**
 * Line item types that make a line a monthly brokerage fee charge.
 *
 * NOT the same set `app/api/cron/apply-late-fees` matches on: that cron keys on
 * `'Monthly Fee'` exactly and leaves the prorated variant out. The prorated
 * type is included here because a monthly fee billed mid-month is still a
 * monthly fee, and that difference is exactly what makes the `every` below
 * load-bearing.
 */
export const MONTHLY_FEE_ITEM_TYPES = ['Monthly Fee', 'Monthly Fee (Prorated)']

/**
 * True only when EVERY line on the invoice is a monthly fee charge.
 *
 * `some` is wrong here and the difference is a $399 mistake. The join invoice
 * carries two lines:
 *
 *   app/api/onboarding/create-payment: items[0] 'Onboarding Fee'
 *                                      items[1] 'Monthly Fee (Prorated)'
 *
 * Under `some` the prorated line matched and the whole invoice was treated as a
 * monthly fee - so the largest invoice an agent can carry was classified as the
 * one thing autopay is allowed to collect, by the very code written to keep it
 * out. `app/api/payload/create-invoice` builds an onboarding invoice the same
 * way, so both writers were affected.
 *
 * An empty item list returns false: an invoice with nothing on it is not a
 * monthly fee, and callers here treat "not a monthly fee" as the cautious side.
 */
export const isMonthlyFeeInvoice = (inv: any) => {
  const items = inv?.items || []
  return items.length > 0 && items.every((i: any) => MONTHLY_FEE_ITEM_TYPES.includes(i?.type))
}
