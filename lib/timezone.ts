export function getCentralTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}

export function formatCentralDate(date?: Date | string): string {
  // A date-only string ('2026-04-03') parses as midnight UTC, which is the
  // evening BEFORE in Central -- so formatting it in Chicago printed the
  // previous day. Pin date-only values to noon; timestamps pass through.
  const d = date
    ? new Date(typeof date === 'string' && date.length === 10 ? date + 'T12:00:00' : date)
    : new Date()
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  })
}

export function getCentralDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) // Returns YYYY-MM-DD
}

/**
 * The current instant as an ISO string.
 *
 * This previously formatted "now" into a Central-time string and re-parsed it,
 * which shifted the value by the Central offset and then labelled the result
 * as UTC -- so every timestamp written through it landed 5-6 hours early. An
 * instant has no timezone; use toISOString directly and format for Central
 * only at display time.
 */
export function getCentralISOString(): string {
  return new Date().toISOString()
}