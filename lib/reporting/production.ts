/**
 * The one definition of company production.
 *
 * Volume, units and the set of deals behind them were computed in two places
 * that did not agree: app/api/reports/quarterly/route.ts on the server, and
 * components/dashboard/ProductionCharts.tsx on the client. Same database,
 * same day, two different answers - the quarterly report excluded cancelled
 * deals and read the units column, the charts excluded neither and counted
 * agent rows instead. On 2026 to date that was a gap of $465,380 and 22 units
 * between the report Courtney reads and the dashboard she looks at.
 *
 * Everything that decides whether a deal counts, and for how much, lives here
 * now. Both callers import it. Nothing in this file touches the database, so
 * the client bundle can have it; the server-only lookup that feeds the
 * compliance argument lives in lib/reporting/complianceRequests.ts.
 *
 * The rules, as Tara stated them:
 *
 *   Cancelled never counts. Anywhere, for anything, sale or lease.
 *
 *   A sale counts when its status is closed and its closing_date falls in the
 *   range. closed_date is never the qualifying date.
 *
 *   A lease counts when its move-in date has already passed, falls in the
 *   range, and the deal has a compliance request behind it. The request does
 *   not have to be reviewed or complete - submitted is enough. Lease status
 *   itself is not a gate: a pending or active lease whose tenant has moved in
 *   is production.
 *
 *   A deal imported from Brokermint has no submission row in this app but
 *   carries the reviewed status on the transaction. That is a request too.
 *   See claude/compliance-status-and-side-vocabulary-rulings.md section 4 -
 *   the stored column is imported truth on those deals, not drift.
 */

// Lease detection uses the app's one matcher rather than a second copy living
// here. transactionTypes.ts has no imports of its own, so the charts component
// can still bundle this file.
//
// It matches on five markers (lease, apartment, rent, tenant, landlord) where
// an earlier draft of this file matched on three. Checked against live data on
// 2026-09-17: the two spellings disagree on 0 of 1,293 transactions, so
// adopting the canonical one moves no number. The charts also used to test the
// transaction type against the names in processing_fee_types, which matched
// nothing, because those are display names and these are slugs.
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

/** Roles whose rows carry firm volume and units. */
export const PRODUCTION_ROLES = ['primary_agent', 'listing_agent']

/** Roles that appear on the top-producer boards. */
export const PRODUCER_ROLES = ['primary_agent', 'listing_agent', 'co_agent']

/**
 * Submission modes that mean "the agent asked for compliance on this deal".
 *
 * `retainer` is deliberately not here. A retainer is collected on a prospect
 * before there is a lease to be compliant about, so it is not a request. It
 * excludes nothing today - no qualifying lease has a retainer-only submission
 * - and this is the line to change if that ever stops being true.
 *
 * `under_contract` is a different form entirely (the Under Contract Form) and
 * is not a compliance request. Nine leases carry one and nothing else - one
 * in 2023, five in 2024, three in 2025 - and matching on "has any submission
 * row" instead of on mode would wrongly count all nine. Counted 2026-09-17.
 */
export const COMPLIANCE_REQUEST_MODES = ['compliance', 'subsequent']

/**
 * The stored compliance_status meaning no request was ever made. The app has
 * exactly one spelling for this, resolved Sep 8 - see the same doc, section 1.
 */
export const NO_REQUEST_STATUS = 'not_submitted'

/**
 * The date that files a deal into a quarter: move-in for a lease, closing for
 * a sale. Returned as a YYYY-MM-DD string so callers compare it as text and
 * never pick up a timezone shift across a quarter boundary.
 */
export function productionDate(txn: {
  transaction_type?: string | null
  move_in_date?: string | null
  closing_date?: string | null
}): string | null {
  const raw = isLeaseTransactionType(txn.transaction_type)
    ? txn.move_in_date || txn.closing_date
    : txn.closing_date
  return raw ? String(raw).split('T')[0] : null
}

/**
 * Does this deal have a compliance request behind it?
 *
 * Either an actual submission in this app, or the stored status on a deal
 * imported from Brokermint, where the review happened in the old system and
 * there is no submission row to find.
 */
export function hasComplianceRequest(
  txn: { id: string; compliance_status?: string | null },
  txnIdsWithSubmission: Set<string>
): boolean {
  if (txnIdsWithSubmission.has(txn.id)) return true
  const stored = String(txn.compliance_status || '')
  return stored !== '' && stored !== NO_REQUEST_STATUS
}

export type ProductionOptions = {
  /** Result of hasComplianceRequest for this deal. Ignored for sales. */
  complianceRequested: boolean
  /** Today as YYYY-MM-DD. A lease counts only once its move-in has passed. */
  today: string
  /**
   * Forward-looking range (the charts' Next Month and Next Quarter). Sales in
   * the pipeline count there; leases still need a move-in that has happened,
   * so a future range shows no leases either way.
   */
  projection?: boolean
}

/**
 * Whether a deal counts toward production at all, before any date range is
 * applied. Callers still filter productionDate() into their own window.
 */
export function countsTowardProduction(
  txn: {
    id: string
    status?: string | null
    transaction_type?: string | null
    compliance_status?: string | null
    move_in_date?: string | null
    closing_date?: string | null
  },
  opts: ProductionOptions
): boolean {
  if (String(txn.status || '') === 'cancelled') return false

  const date = productionDate(txn)
  if (!date) return false

  if (isLeaseTransactionType(txn.transaction_type)) {
    if (date > opts.today) return false
    return opts.complianceRequested
  }

  if (!opts.projection && String(txn.status || '') !== 'closed') return false
  return true
}

/**
 * Units on one agent row.
 *
 * The units column is the answer, not the row count. Installment and retainer
 * rows sit in a production role with units set to 0 on purpose so they do not
 * double-count the deal they hang off; counting rows instead counts them.
 * Eleven such rows exist today and one of them sits on a deal that qualifies,
 * the retainer row on 7711 Longmire Road; the other ten hang off deals that
 * are already excluded. Legacy rows predating the column read as 1.
 * Counted 2026-09-17.
 */
export function productionUnits(row: { units?: number | string | null }): number {
  return row.units != null ? parseFloat(String(row.units)) || 0 : 1
}

/** Volume on one agent row. Each production row carries the full deal price. */
export function productionVolume(row: { sales_volume?: number | string | null }): number {
  return parseFloat(String(row.sales_volume ?? '0')) || 0
}

/** Today as YYYY-MM-DD, to compare against productionDate(). */
export function productionToday(): string {
  return new Date().toISOString().split('T')[0]
}
