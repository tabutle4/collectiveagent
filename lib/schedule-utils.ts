// lib/schedule-utils.ts
// Shared utilities for coaching schedule – used by API routes and components.

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

/** Human-readable day label shown on the schedule grid. */
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

/** Human-readable recurrence label for the Outlook event body. */
export function getRecurrenceLabel(recurrenceType: string): string {
  switch (recurrenceType) {
    case 'weekly':          return 'Weekly'
    case 'biweekly':        return 'Every other week (2nd & 4th)'
    case 'monthly-first':   return 'Monthly – 1st'
    case 'monthly-second':  return 'Monthly – 2nd'
    case 'monthly-third':   return 'Monthly – 3rd'
    case 'monthly-fourth':  return 'Monthly – 4th'
    case 'monthly-last':    return 'Monthly – Last'
    default:                return 'Weekly'
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
  return t.slice(0, 5)
}

/** Render platform with Zoom URL appended when applicable. */
function renderPlatform(platform: string): string {
  const lower = platform.toLowerCase()
  if (lower.includes('zoom') && !platform.includes('http')) {
    return `${platform}: <a href="https://visit.collectiverealtyco.com/training" style="color:#0066cc;">visit.collectiverealtyco.com/training</a>`
  }
  return platform
}

/** Render description – if it is a URL, wrap as a hyperlink. */
function renderDescription(description: string): string {
  if (/^https?:\/\//.test(description.trim())) {
    return `<a href="${description.trim()}" style="color:#0066cc;">More about this session</a>`
  }
  return description.replace(/\n/g, '<br>')
}

export interface EventBodyParams {
  displayTitle: string
  dayLabel: string
  timeDisplay: string
  recurrenceLabel: string
  platform: string
  audience: string
  host: string | null
  description: string
  imageUrl: string | null
}

/**
 * Build the full HTML event body written to Outlook for a coaching session.
 * Matches the structured bullet format agents expect.
 */
export function buildEventBody(params: EventBodyParams): string {
  const { displayTitle, dayLabel, timeDisplay, recurrenceLabel, platform, audience, host, description, imageUrl } = params

  const bullets: string[] = [
    `<li style="margin-bottom:6px;"><strong>Day:</strong> ${dayLabel}</li>`,
    `<li style="margin-bottom:6px;"><strong>Time:</strong> ${timeDisplay}</li>`,
    `<li style="margin-bottom:6px;"><strong>Recurrence:</strong> ${recurrenceLabel}</li>`,
    `<li style="margin-bottom:6px;"><strong>Platform:</strong> ${renderPlatform(platform)}</li>`,
    `<li style="margin-bottom:6px;"><strong>Audience:</strong> ${audience}</li>`,
  ]
  if (host) {
    bullets.push(`<li style="margin-bottom:6px;"><strong>Host:</strong> ${host}</li>`)
  }
  if (description) {
    bullets.push(`<li style="margin-bottom:6px;"><strong>Description:</strong> ${renderDescription(description)}</li>`)
  }

  const lines: string[] = [
    `<h2 style="margin:0 0 14px;font-size:18px;font-weight:700;font-family:sans-serif;">${displayTitle}</h2>`,
    `<ul style="margin:0 0 16px;padding-left:22px;font-family:sans-serif;font-size:14px;line-height:1.6;">${bullets.join('\n')}</ul>`,
  ]

  if (imageUrl) {
    lines.push(
      `<p style="margin:16px 0;"><img src="${imageUrl}" ` +
      `alt="Session photo" style="max-width:480px;width:100%;height:auto;border-radius:6px;" /></p>`
    )
  }

  lines.push(
    '<p style="margin:20px 0 0;font-size:12px;color:#888;font-family:sans-serif;">' +
    'Recordings available in the ' +
    '<a href="https://agent.collectiverealtyco.com/training-center" style="color:#0066cc;">Training Center</a>.' +
    '</p>'
  )

  return lines.join('\n')
}

/**
 * Build the occurrence body: guest info above, full session body below.
 * Used when Leah adds a guest speaker to a specific date.
 */
export function buildOccurrenceBody(params: {
  guestName: string
  guestCompany: string
  topic: string
  food: string
  sessionBody: string
}): string {
  const { guestName, guestCompany, topic, food, sessionBody } = params
  const lines: string[] = []

  const hasGuest = guestName || guestCompany || topic || food
  if (hasGuest) {
    if (guestName) {
      lines.push(`<h3 style="margin:0 0 4px;font-size:16px;font-weight:700;font-family:sans-serif;">${guestName}</h3>`)
    }
    if (guestCompany) {
      lines.push(`<p style="margin:0 0 10px;color:#555;font-family:sans-serif;">${guestCompany}</p>`)
    }
    if (topic) {
      lines.push(`<p style="margin:0 0 6px;font-family:sans-serif;"><strong>Topic:</strong> ${topic}</p>`)
    }
    if (food) {
      lines.push(`<p style="margin:0 0 6px;font-family:sans-serif;"><strong>Food:</strong> ${food}</p>`)
    }
    lines.push('<hr style="border:none;border-top:1px solid #ccc;margin:20px 0;" />')
  }

  lines.push(sessionBody)
  return lines.join('\n')
}

/**
 * Build the Microsoft Graph recurrence object for a new recurring event.
 */
export function buildGraphRecurrence(
  recurrenceType: string,
  recurrenceDay: string,
  startDate: string
): object {
  const weeklyPattern = (interval: number) => ({
    pattern: { type: 'weekly', interval, daysOfWeek: [recurrenceDay], firstDayOfWeek: 'sunday' },
    range:   { type: 'noEnd', startDate },
  })
  const relativeMonthly = (index: string) => ({
    pattern: { type: 'relativeMonthly', interval: 1, daysOfWeek: [recurrenceDay], index },
    range:   { type: 'noEnd', startDate },
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

/** Next calendar date for a given day of week, as YYYY-MM-DD. */
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
  day_label: string
  time_display: string
}

/**
 * Parse a semicolon-separated location string into a Graph API locations array.
 * "13201 Northwest Fwy; visit.collectiverealtyco.com/training"
 * → [{ displayName: '13201 Northwest Fwy' }, { displayName: 'visit...' }]
 */
export function parseLocations(eventLocation: string): { displayName: string }[] {
  if (!eventLocation.trim()) return []
  return eventLocation
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(displayName => ({ displayName }))
}
