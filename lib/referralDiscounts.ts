/**
 * Fee discounts.
 *
 * Started life as Referral Collective membership discounts and now covers
 * every fee the brokerages charge: the RC annual membership, the CRC
 * onboarding fee and the CRC monthly fee. `fee_type` on each row says which
 * one it touches, so a promo on the monthly fee can never come off an
 * onboarding invoice. The table keeps its original name; the filename and
 * table name are historical, the contents are not.
 *
 * One place decides which discount applies and how many dollars come off, so
 * the price on the public pricing page, the price on the onboarding step and
 * the amount billed through Payload can never disagree.
 *
 * Schedules are evaluated against the calendar date in the brokerage's own
 * timezone rather than the server's. A promo set to end on the 31st ends at
 * the close of the 31st in Texas, whatever region the route happens to run in.
 */

import { CENTRAL_TIME_ZONE } from '@/lib/timezone'

/** Which fee a discount comes off. */
export type FeeType = 'rc_annual' | 'crc_onboarding' | 'crc_monthly'

export const FEE_TYPES: FeeType[] = ['rc_annual', 'crc_onboarding', 'crc_monthly']

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  rc_annual: 'Referral Collective annual membership',
  crc_onboarding: 'Collective Realty Co. onboarding fee',
  crc_monthly: 'Collective Realty Co. monthly fee',
}

export type DiscountAudience = 'all' | 'crc_conversion' | 'outside_only'
export type DiscountType = 'amount' | 'percent'
export type DiscountSchedule = 'once' | 'monthly' | 'yearly'

/** Who is being priced. A discount aimed at 'all' applies to either. */
export type PricingAudience = 'crc_conversion' | 'outside_only'

export interface ReferralDiscount {
  id: string
  name: string
  description: string | null
  fee_type: FeeType
  /**
   * Monthly-fee promos only. False means every invoice inside the window is
   * discounted; true means each agent gets it on one invoice and pays full
   * price afterwards, even while the promo is still running.
   */
  first_invoice_only: boolean
  audience: DiscountAudience
  discount_type: DiscountType
  amount: number
  schedule_type: DiscountSchedule
  starts_on: string | null
  ends_on: string | null
  start_month: number | null
  start_day: number | null
  end_month: number | null
  end_day: number | null
  repeat_until: string | null
  is_active: boolean
}

export interface ResolvedDiscount {
  id: string
  name: string
  /** Dollars off the annual fee, already capped at the fee and rounded to cents. */
  amountOff: number
  /** What the agent actually pays, after the discount. */
  finalPrice: number
  audience: DiscountAudience
  feeType: FeeType
  /** Monthly promos: true when each agent may use this on one invoice only. */
  firstInvoiceOnly: boolean
}

export const DISCOUNT_AUDIENCE_LABELS: Record<DiscountAudience, string> = {
  all: 'Everyone joining RC',
  crc_conversion: 'CRC agents converting',
  outside_only: 'Outside agents only',
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface CalendarDate {
  year: number
  month: number
  day: number
}

/** The calendar date in the brokerage's timezone, not the server's. */
export function businessToday(now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

/**
 * Postgres hands a `date` back as 'YYYY-MM-DD'. The old promo column was a
 * timestamptz, so the leading 10 characters are taken rather than assuming the
 * whole string is a bare date.
 */
function parseCalendarDate(value: string | null): CalendarDate | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function sortableDate(date: CalendarDate): number {
  return date.year * 10000 + date.month * 100 + date.day
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The 29th through the 31st do not exist in every month, so pull them back. */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month))
}

/**
 * True when today falls inside the window, including windows that wrap past
 * the end of the month or year (the 28th through the 3rd, Dec 15 through
 * Jan 10).
 */
function withinWindow(today: number, start: number, end: number): boolean {
  return start <= end ? today >= start && today <= end : today >= start || today <= end
}

/** Whether a discount's schedule has it running on the given day. */
export function isDiscountActiveOn(
  discount: ReferralDiscount,
  now: Date = new Date()
): boolean {
  if (!discount.is_active) return false

  const today = businessToday(now)
  const todayValue = sortableDate(today)

  if (discount.schedule_type === 'once') {
    const start = parseCalendarDate(discount.starts_on)
    const end = parseCalendarDate(discount.ends_on)
    if (start && todayValue < sortableDate(start)) return false
    if (end && todayValue > sortableDate(end)) return false
    return true
  }

  // Recurring. starts_on gates when the repeat begins, repeat_until when it
  // stops. Both optional; left blank the discount simply repeats.
  const beginsOn = parseCalendarDate(discount.starts_on)
  if (beginsOn && todayValue < sortableDate(beginsOn)) return false
  const stopsAfter = parseCalendarDate(discount.repeat_until)
  if (stopsAfter && todayValue > sortableDate(stopsAfter)) return false

  if (discount.schedule_type === 'monthly') {
    if (discount.start_day == null || discount.end_day == null) return false
    const start = clampDay(today.year, today.month, discount.start_day)
    const end = clampDay(today.year, today.month, discount.end_day)
    return withinWindow(today.day, start, end)
  }

  // yearly
  if (
    discount.start_month == null || discount.start_day == null ||
    discount.end_month == null || discount.end_day == null
  ) {
    return false
  }
  const startValue =
    discount.start_month * 100 + clampDay(today.year, discount.start_month, discount.start_day)
  const endValue =
    discount.end_month * 100 + clampDay(today.year, discount.end_month, discount.end_day)
  return withinWindow(today.month * 100 + today.day, startValue, endValue)
}

/**
 * Dollars off the fee. A percent discount is turned into dollars here and
 * nowhere else, so every caller works from the same figure. Never negative,
 * never more than the fee itself.
 */
export function discountValue(discount: ReferralDiscount, fee: number): number {
  const raw = discount.discount_type === 'percent'
    ? (fee * discount.amount) / 100
    : discount.amount
  const capped = Math.min(Math.max(raw, 0), Math.max(fee, 0))
  return Math.round(capped * 100) / 100
}

/**
 * The single discount that applies right now, or null.
 *
 * Biggest one wins: only one discount ever comes off a fee, and it is the one
 * worth the most dollars. Ties go to the discount aimed at a specific
 * audience over one aimed at everyone, then to the lowest id, so the same
 * inputs always produce the same answer.
 */
export function resolveReferralDiscount(
  discounts: ReferralDiscount[],
  audience: PricingAudience,
  fee: number,
  now: Date = new Date(),
  feeType: FeeType = 'rc_annual',
  options: { excludeDiscountIds?: Set<string> } = {}
): ResolvedDiscount | null {
  const excluded = options.excludeDiscountIds
  const applicable = (discounts || []).filter(
    d =>
      (d.fee_type || 'rc_annual') === feeType &&
      !excluded?.has(d.id) &&
      (d.audience === 'all' || d.audience === audience) &&
      isDiscountActiveOn(d, now)
  )
  if (applicable.length === 0) return null

  let best: ReferralDiscount | null = null
  let bestValue = -1

  for (const candidate of applicable) {
    const value = discountValue(candidate, fee)
    if (value <= 0) continue
    if (value > bestValue) {
      best = candidate
      bestValue = value
      continue
    }
    if (value === bestValue && best) {
      const candidateIsSpecific = candidate.audience !== 'all'
      const bestIsSpecific = best.audience !== 'all'
      if (candidateIsSpecific && !bestIsSpecific) best = candidate
      else if (candidateIsSpecific === bestIsSpecific && candidate.id < best.id) best = candidate
    }
  }

  if (!best || bestValue <= 0) return null

  return {
    id: best.id,
    name: best.name,
    amountOff: bestValue,
    finalPrice: Math.round(Math.max(fee - bestValue, 0) * 100) / 100,
    audience: best.audience,
    feeType: (best.fee_type || 'rc_annual') as FeeType,
    firstInvoiceOnly: !!best.first_invoice_only,
  }
}

/** One line describing when a discount runs, for the settings list. */
export function describeDiscountSchedule(discount: ReferralDiscount): string {
  const monthDay = (month: number | null, day: number | null) =>
    month && day ? `${MONTH_NAMES[month - 1]} ${day}` : ''
  const ordinal = (day: number | null) => {
    if (!day) return ''
    const suffix = day % 10 === 1 && day !== 11 ? 'st'
      : day % 10 === 2 && day !== 12 ? 'nd'
      : day % 10 === 3 && day !== 13 ? 'rd'
      : 'th'
    return `${day}${suffix}`
  }
  const plain = (value: string | null) => {
    const parsed = parseCalendarDate(value)
    return parsed ? `${parsed.month}/${parsed.day}/${parsed.year}` : ''
  }

  if (discount.schedule_type === 'once') {
    const start = plain(discount.starts_on)
    const end = plain(discount.ends_on)
    if (start && end) return `${start} to ${end}`
    if (end) return `Through ${end}`
    if (start) return `From ${start}`
    return 'Always on'
  }

  const stop = plain(discount.repeat_until)
  const tail = stop ? `, until ${stop}` : ''

  if (discount.schedule_type === 'monthly') {
    const start = ordinal(discount.start_day)
    const end = ordinal(discount.end_day)
    if (!start || !end) return `Every month${tail}`
    if (start === end) return `The ${start} of every month${tail}`
    return `The ${start} to the ${end} of every month${tail}`
  }

  const start = monthDay(discount.start_month, discount.start_day)
  const end = monthDay(discount.end_month, discount.end_day)
  if (!start || !end) return `Every year${tail}`
  if (start === end) return `${start} every year${tail}`
  return `${start} to ${end} every year${tail}`
}

/** What comes off the fee, as a label. */
export function describeDiscountAmount(discount: ReferralDiscount): string {
  return discount.discount_type === 'percent'
    ? `${discount.amount}% off`
    : `$${discount.amount} off`
}

/** Columns every route needs when reading discounts. */
export const REFERRAL_DISCOUNT_COLUMNS =
  'id, name, description, fee_type, first_invoice_only, audience, discount_type, amount, schedule_type, starts_on, ends_on, start_month, start_day, end_month, end_day, repeat_until, is_active'
