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
