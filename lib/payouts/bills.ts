// lib/payouts/bills.ts
//
// When a recurring bill next leaves the payouts account.
//
// Four schedule shapes, which is why this is not a single due_day column:
//   a single day        E&O on the 1st
//   two fixed days      payroll taxes on the 1st and the 16th
//   last day of month   both payrolls
//   a window            both rents, due between the 1st and the 5th
//
// A window reserves from its FIRST day, never its last, so the figure can
// never understate what might already have left.
//
// Dates are handled as UTC calendar days rather than local Date objects. A
// bill is a calendar event, and running this in Central time near midnight
// should not move it a day.

export type RecurringBill = {
  id: string
  name: string
  amount: number | string
  days: number[] | null
  last_day_of_month: boolean | null
  window_start_day: number | null
  window_end_day: number | null
  shift_earlier_for_nonbusiness: boolean | null
  active: boolean | null
}

export type BillOccurrence = {
  bill_id: string
  name: string
  amount: number
  due_date: string
  shifted: boolean
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Weekend pulls the payment earlier, never later, matching how payroll runs.
 * Public holidays are not modelled: the app has no holiday calendar, and
 * guessing one would be worse than being a day early.
 */
function shiftEarlierOffWeekend(d: Date): { date: Date; shifted: boolean } {
  const out = new Date(d)
  let shifted = false
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) {
    out.setUTCDate(out.getUTCDate() - 1)
    shifted = true
  }
  return { date: out, shifted }
}

function candidatesForMonth(bill: RecurringBill, year: number, monthIndex: number): Date[] {
  const out: Date[] = []
  const seen = new Set<number>()
  const push = (day: number) => {
    const max = lastDayOfMonth(year, monthIndex)
    const clamped = Math.min(Math.max(day, 1), max)
    if (seen.has(clamped)) return
    seen.add(clamped)
    out.push(new Date(Date.UTC(year, monthIndex, clamped)))
  }

  for (const d of bill.days || []) push(Number(d))
  if (bill.last_day_of_month) push(lastDayOfMonth(year, monthIndex))
  if (bill.window_start_day) push(Number(bill.window_start_day))

  return out
}

/**
 * Every occurrence falling within `days` of `fromDate`, inclusive at both ends.
 */
export function billsDueWithin(
  bills: RecurringBill[],
  fromDate: string,
  days: number
): BillOccurrence[] {
  const from = new Date(`${fromDate}T00:00:00Z`)
  const to = new Date(from)
  to.setUTCDate(to.getUTCDate() + days)

  const out: BillOccurrence[] = []

  for (const bill of bills) {
    if (bill.active === false) continue
    const amount = Number(bill.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) continue

    // Walk the months the window touches, plus one either side so a shifted
    // date near a boundary is not missed.
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1))
    const stop = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1))

    while (cursor < stop) {
      for (const candidate of candidatesForMonth(bill, cursor.getUTCFullYear(), cursor.getUTCMonth())) {
        const { date, shifted } = bill.shift_earlier_for_nonbusiness
          ? shiftEarlierOffWeekend(candidate)
          : { date: candidate, shifted: false }

        if (date >= from && date <= to) {
          out.push({
            bill_id: bill.id,
            name: bill.name,
            amount: Math.round(amount * 100) / 100,
            due_date: iso(date),
            shifted,
          })
        }
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }

  return out.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name))
}

export function billsDueTotal(occurrences: BillOccurrence[]): number {
  return Math.round(occurrences.reduce((s, o) => s + o.amount, 0) * 100) / 100
}
