/**
 * When a late fee lands on a rent invoice.
 *
 * Two jobs need this answer and they must give the same one: the cron that
 * charges the fee, and the cron that warns the tenant the day before. They have
 * now been pulled apart and hand-aligned three separate times -- first when one
 * hardcoded a 3 day grace while the other read the lease, then again when a
 * statutory floor was added to one and not the other. Each time the tenant was
 * told a fee lands on a day it does not. One function, two callers, so the
 * agreement is structural rather than maintained by comment.
 */

export interface LateFeeLease {
  late_fee_grace_days?: number | null
}

/** Grace period the lease provides, defaulted when unset. */
export const DEFAULT_GRACE_DAYS = 2

/**
 * Texas Property Code §92.019 bars a late fee until rent has gone unpaid past
 * the end of the second full day. The statute is a floor as well as a cap: a
 * lease may be more generous, never less. The lease form accepts 0, so this is
 * clamped rather than trusted.
 */
export const MIN_GRACE_DAYS = 2

/** The grace period actually used, after the statutory floor. */
export function graceDaysFor(lease: LateFeeLease | null | undefined): number {
  return Math.max(MIN_GRACE_DAYS, lease?.late_fee_grace_days ?? DEFAULT_GRACE_DAYS)
}

/**
 * The first day a late fee may be charged: the due date, plus the grace period,
 * plus one. Returned at local midnight so it compares cleanly against a `today`
 * built the same way.
 *
 * `dueDate` is the invoice's date-only column. Parsed at noon because a
 * date-only string parses as midnight UTC, which is the previous day in
 * Central.
 */
export function firstChargeableDay(
  dueDate: string,
  lease: LateFeeLease | null | undefined
): Date {
  const due = new Date(`${dueDate}T12:00:00`)
  const first = new Date(due)
  first.setDate(first.getDate() + graceDaysFor(lease) + 1)
  first.setHours(0, 0, 0, 0)
  return first
}

/**
 * The day the tenant should be warned: the day before the fee lands. Derived
 * from the same function that decides when it lands, which is the whole point.
 */
export function lateFeeWarningDay(
  dueDate: string,
  lease: LateFeeLease | null | undefined
): Date {
  const warn = new Date(firstChargeableDay(dueDate, lease))
  warn.setDate(warn.getDate() - 1)
  return warn
}
