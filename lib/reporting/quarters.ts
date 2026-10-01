/**
 * One definition of "a quarter", for every screen that offers a quarter picker
 * or slices data by one.
 *
 * Before this file there were three: the quarterly report page built its list
 * inline, the transactions list derived one from the data it happened to have,
 * and the reconciliation report had its own. They disagreed - on 2026-09-30 the
 * quarterly report offered seven quarters and opened on Q1 2026 while the
 * reconciliation report offered eight and opened on Q3 2026. Two people opening
 * the two reports side by side were reading different quarters without either
 * of them choosing to.
 *
 * The date arithmetic was a separate copy in each of the two API routes,
 * character for character, which is the state a copy is in right before someone
 * fixes one of them.
 *
 * Deliberately UTC. new Date(year, month, day) is local time, and the server's
 * timezone is not something this app controls or states anywhere, so a
 * quarter's last day could land one day into the next quarter on a non-UTC
 * host. On a UTC host this produces exactly the same strings the old code did.
 */

/** How many quarters the pickers offer, newest first. Two years of history. */
export const QUARTER_OPTION_COUNT = 8

export interface QuarterOption {
  year: number
  quarter: number
  /** "Q3 2026" - the label every picker shows. */
  label: string
}

/** The quarter a date falls in, 1 through 4. */
export function quarterOf(date: Date): number {
  return Math.ceil((date.getUTCMonth() + 1) / 3)
}

/**
 * Which entry of quarterOptions() a picker opens on: index 1, the most recent
 * COMPLETED quarter.
 *
 * Not index 0. The list leads with the quarter we are in so it can be picked,
 * but opening on it is wrong for both reports. On 2026-10-01, day one of Q4,
 * the current quarter held 6 qualifying deals against Q3's 121 - a
 * presentation that opens on 6 deals, and a reconciliation report that opens
 * on a quarter nobody has worked yet. The quarterly report page always said in
 * its own comment that it meant the most recent completed quarter; it just
 * never did it.
 */
export const DEFAULT_QUARTER_INDEX = 1

/**
 * The quarter list every picker shows: newest first, starting at the quarter we
 * are in now. The current quarter is in the list so it can be selected; it is
 * not what a picker opens on - see DEFAULT_QUARTER_INDEX.
 */
export function quarterOptions(count: number = QUARTER_OPTION_COUNT): QuarterOption[] {
  const now = new Date()
  let y = now.getUTCFullYear()
  let q = quarterOf(now)
  const out: QuarterOption[] = []
  for (let i = 0; i < count; i++) {
    out.push({ year: y, quarter: q, label: `Q${q} ${y}` })
    q -= 1
    if (q === 0) {
      q = 4
      y -= 1
    }
  }
  return out
}

/**
 * The first and last day of a quarter, as the YYYY-MM-DD strings every query in
 * this app compares dates with. End date is inclusive - it is the quarter's
 * last day, not the next quarter's first.
 */
export function quarterRange(year: number, quarter: number): { startDate: string; endDate: string } {
  const startMonth = (quarter - 1) * 3
  const startDate = new Date(Date.UTC(year, startMonth, 1)).toISOString().split('T')[0]
  // Day 0 of the month after the quarter is that quarter's last day.
  const endDate = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().split('T')[0]
  return { startDate, endDate }
}

/** True for a year and quarter a picker could legitimately be asking for. */
export function isValidQuarter(year: number, quarter: number): boolean {
  return (
    Number.isInteger(year) && year >= 2000 && year <= 2100 &&
    Number.isInteger(quarter) && quarter >= 1 && quarter <= 4
  )
}
