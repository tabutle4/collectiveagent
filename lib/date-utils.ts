/**
 * Safely format a date string for display, handling timezone issues.
 * 
 * When JavaScript parses "2026-04-03", it interprets it as midnight UTC.
 * In local timezones west of UTC (like CDT), this shows as the previous day.
 * 
 * This utility adds T12:00:00 to date-only strings to prevent the shift.
 */

export function formatDate(
  d: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!d) return '--'
  // Date-only strings are exactly 10 chars: "2026-04-03"
  const dateStr = d.length === 10 ? d + 'T12:00:00' : d
  return new Date(dateStr).toLocaleDateString('en-US', options)
}

export function formatDateShort(d: string | null | undefined): string {
  return formatDate(d, { month: 'numeric', day: 'numeric', year: '2-digit' })
}

export function formatDateLong(d: string | null | undefined): string {
  return formatDate(d, { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Determine whether an agent's monthly brokerage fee is overdue.
 *
 * This is the single source of truth for the "redirect agent to /agent/fees"
 * decision. It previously lived inline (and inconsistently) in two layout
 * files, which is how the timezone bug crept in.
 *
 * Rules:
 *  - Waived agents and division agents are never overdue.
 *  - Agents who have never paid (null paidThrough) are not redirected. This
 *    preserves the existing grace for brand-new agents.
 *  - The monthly fee invoice is due on the 5th; the late fee applies on the
 *    6th. So an unpaid CURRENT month is not "overdue" until the 6th.
 *  - Being behind on any PRIOR month is overdue immediately, any day.
 *
 * paidThrough is the users.monthly_fee_paid_through value, a 'YYYY-MM-DD'
 * string. It is parsed as a LOCAL date (not UTC). Parsing it with
 * `new Date('2026-05-31')` would yield midnight UTC, which is the evening of
 * May 30 in US timezones. That off-by-one is the core of the bug this
 * helper fixes.
 */
export function isMonthlyFeeOverdue(
  paidThrough: string | null | undefined,
  opts: { waived?: boolean | null; division?: unknown } = {}
): boolean {
  // Waived agents and division agents never owe a monthly fee.
  if (opts.waived) return false
  if (opts.division) return false

  // Never-paid agents are not redirected (grace period for new agents).
  if (!paidThrough) return false

  const parts = paidThrough.split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return false
  const [y, m, d] = parts
  const paidThroughDate = new Date(y, m - 1, d) // local midnight, no UTC shift

  const now = new Date()
  const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  // Fee is due the 5th, late fee posts the 6th. Before the 6th, an unpaid
  // current month is still within grace and should not trigger a redirect.
  const pastGracePeriod = now.getDate() >= 6

  // Behind on a prior month  -> overdue now, regardless of day of month.
  // Behind on current month  -> overdue only once past the grace period.
  return (
    paidThroughDate < endOfPreviousMonth ||
    (paidThroughDate < endOfCurrentMonth && pastGracePeriod)
  )
}
