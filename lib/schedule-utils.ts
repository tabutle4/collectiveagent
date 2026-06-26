// lib/schedule-utils.ts
// Shared utilities for coaching schedule — used by API routes and components.

export const RECURRENCE_TYPES = [
  { value: 'weekly',         label: 'Every week' },
  { value: 'biweekly',       label: '2nd & 4th (every other week)' },
  { value: 'monthly-first',  label: '1st of month' },
  { value: 'monthly-second', label: '2nd of month' },
  { value: 'monthly-third',  label: '3rd of month' },
  { value: 'monthly-fourth', label: '4th of month' },
  { value: 'monthly-last',   label: 'Last of month' },
]

export const RECURRENCE_DAYS = [
  { value: 'monday',    label: 'Monday' },
  { value: 'tuesday',   label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday',  label: 'Thursday' },
  { value: 'friday',    label: 'Friday' },
]

/** Generate the human-readable day label shown on the schedule grid. */
export function getDayLabel(recurrenceType: string, recurrenceDay: string): string {
  const plural: Record<string, string> = {
    monday: 'Mondays', tuesday: 'Tuesdays', wednesday: 'Wednesdays',
    thursday: 'Thursdays', friday: 'Fridays',
  }
  const day = plural[recurrenceDay] || recurrenceDay
  switch (recurrenceType) {
    case 'weekly':         return day
    case 'biweekly':       return `2nd & 4th ${day}`
    case 'monthly-first':  return `1st ${day}`
    case 'monthly-second': return `2nd ${day}`
    case 'monthly-third':  return `3rd ${day}`
    case 'monthly-fourth': return `4th ${day}`
    case 'monthly-last':   return `Last ${day}`
    default:               return day
  }
}

/** Format HH:MM 24-hr times into a readable range like "12 - 1 PM" or "7 - 8 PM". */
export function formatTimeDisplay(startTime: string, endTime: string): string {
  const parseHM = (t: string) => {
    const [h, m] = (t || '').split(':').map(Number)
    return { h: h || 0, m: m || 0 }
  }
  const fmt = (h: number, m: number, showPeriod: boolean) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const minStr = m === 0 ? '' : `:${String(m).padStart(2, '0')}`
    return showPeriod ? `${h12}${minStr} ${period}` : `${h12}${minStr}`
  }
  const { h: sh, m: sm } = parseHM(startTime)
  const { h: eh, m: em } = parseHM(endTime)
  const samePeriod = (sh >= 12) === (eh >= 12)
  return samePeriod
    ? `${fmt(sh, sm, false)} - ${fmt(eh, em, true)}`
    : `${fmt(sh, sm, true)} - ${fmt(eh, em, true)}`
}

/** Parse a Graph dateTime string (Chicago-local, no offset) into HH:MM. */
export function graphDateTimeToHHMM(dateTime: string): string {
  const t = (dateTime || '').split('T')[1] || ''
  return t.slice(0, 5) // "HH:MM"
}

/**
 * Build the HTML event body we write to Outlook.
 * Agents see this when they open a coaching session in their calendar.
 */
export function buildEventBody(params: {
  description: string
  audience: string
  host: string | null
  imageUrl: string | null
}): string {
  const lines: string[] = []
  if (params.description) {
    lines.push(`<p style="margin:0 0 12px;">${params.description.replace(/\n/g, '<br>')}</p>`)
  }
  lines.push('<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">')
  if (params.audience) {
    lines.push(`<p style="margin:0 0 6px;"><strong>Audience:</strong> ${params.audience}</p>`)
  }
  if (params.host) {
    lines.push(`<p style="margin:0 0 6px;"><strong>Host:</strong> ${params.host}</p>`)
  }
  if (params.imageUrl) {
    lines.push(
      `<p style="margin:16px 0 0;"><img src="${params.imageUrl}" ` +
      `alt="Session photo" style="max-width:480px;width:100%;height:auto;border-radius:6px;" /></p>`
    )
  }
  lines.push(
    '<p style="margin:16px 0 0;font-size:12px;color:#888;">' +
    'Recordings available in the ' +
    '<a href="https://agent.collectiverealtyco.com/training-center">Training Center</a>.' +
    '</p>'
  )
  return lines.join('\n')
}

/**
 * Build the Microsoft Graph recurrence object for a new recurring event.
 * startDate must be a YYYY-MM-DD string of the first occurrence (or any valid future date).
 */
export function buildGraphRecurrence(
  recurrenceType: string,
  recurrenceDay: string,
  startDate: string
): object {
  const weeklyPattern = (interval: number) => ({
    pattern: {
      type: 'weekly',
      interval,
      daysOfWeek: [recurrenceDay],
      firstDayOfWeek: 'sunday',
    },
    range: { type: 'noEnd', startDate },
  })

  const relativeMonthly = (index: string) => ({
    pattern: {
      type: 'relativeMonthly',
      interval: 1,
      daysOfWeek: [recurrenceDay],
      index,
    },
    range: { type: 'noEnd', startDate },
  })

  switch (recurrenceType) {
    case 'weekly':          return weeklyPattern(1)
    case 'biweekly':        return weeklyPattern(2)
    case 'monthly-first':   return relativeMonthly('first')
    case 'monthly-second':  return relativeMonthly('second')
    case 'monthly-third':   return relativeMonthly('third')
    case 'monthly-fourth':  return relativeMonthly('fourth')
    case 'monthly-last':    return relativeMonthly('last')
    default:                return weeklyPattern(1)
  }
}

/**
 * Given a recurrenceDay string, return the next calendar date for that day of week
 * starting from today (or today if it matches), as YYYY-MM-DD.
 */
export function nextDateForDay(recurrenceDay: string): string {
  const dayIndex: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  }
  const target = dayIndex[recurrenceDay] ?? 1
  const now = new Date()
  const diff = (target - now.getDay() + 7) % 7
  const next = new Date(now)
  next.setDate(now.getDate() + diff)
  return next.toISOString().slice(0, 10)
}

export interface ScheduleSession {
  id: string
  section: 'coaching' | 'division'
  display_title: string
  outlook_event_id: string | null
  recurrence_type: string
  recurrence_day: string
  start_time: string
  end_time: string
  description: string
  platform: string
  audience: string
  host: string | null
  highlight: boolean
  image_url: string | null
  active: boolean
  // Computed display fields (added by API)
  day_label: string
  time_display: string
}
