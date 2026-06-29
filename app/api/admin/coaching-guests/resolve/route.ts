import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyPermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// ── Helpers ───────────────────────────────────────────────────────────────

function getOccurrenceNumberInMonth(date: Date): number {
  let count = 0
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  while (d <= date) {
    if (d.getDay() === date.getDay()) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function isLastOccurrenceInMonth(date: Date): boolean {
  const nextWeek = new Date(date)
  nextWeek.setDate(date.getDate() + 7)
  return nextWeek.getMonth() !== date.getMonth()
}

function sessionMatchesDate(session: any, date: Date): boolean {
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  if (dayNames[date.getDay()] !== session.recurrence_day) return false
  const occNum = getOccurrenceNumberInMonth(date)
  const isLast = isLastOccurrenceInMonth(date)
  switch (session.recurrence_type) {
    case 'weekly':         return true
    case 'biweekly':       return occNum === 2 || occNum === 4
    case 'monthly-first':  return occNum === 1
    case 'monthly-second': return occNum === 2
    case 'monthly-third':  return occNum === 3
    case 'monthly-fourth': return occNum === 4
    case 'monthly-last':   return isLast
    default:               return false
  }
}

// ── POST /api/admin/coaching-guests/resolve ───────────────────────────────
// Given a date (YYYY-MM-DD) and time (HH:MM), determines:
//   - which session owns that slot (if any)
//   - whether that occurrence exists in Outlook (active vs canceled)
// Returns: { status, session, occurrence_id, message }

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  try {
    const { date, time } = await request.json()
    // date: "2026-07-01", time: "12:00"

    if (!date || !time) {
      return NextResponse.json({ error: 'date and time are required' }, { status: 400 })
    }

    // Load zoom link from company settings
    const { data: cs } = await supabaseAdmin
      .from('company_settings')
      .select('coaching_zoom_link')
      .single()
    const zoomLink = cs?.coaching_zoom_link || ''

    // Load all active sessions
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,display_title,recurrence_type,recurrence_day,start_time,end_time,outlook_event_id,active')
      .eq('active', true)

    if (sessErr) throw sessErr

    const pickedDate = new Date(`${date}T00:00:00`)
    const pickedTime = time // "HH:MM"

    // Find session that matches this date AND start time
    const matchingSession = (sessions as any[]).find(s => {
      if (s.start_time.slice(0, 5) !== pickedTime) return false
      return sessionMatchesDate(s, pickedDate)
    })

    if (!matchingSession) {
      return NextResponse.json({
        status: 'no_session',
        session: null,
        occurrence_id: null,
        message: 'No sessions are scheduled at this time.',
        zoom_link: zoomLink,
      })
    }

    // Session found — check if it actually exists in Outlook calendarView
    if (!matchingSession.outlook_event_id) {
      return NextResponse.json({
        status: 'no_outlook_link',
        session: matchingSession,
        occurrence_id: null,
        message: `${matchingSession.display_title} is not linked to Outlook.`,
        zoom_link: zoomLink,
      })
    }

    // Query calendarView for a narrow window around the picked date
    const token = await getGraphToken()
    const startDT = new Date(`${date}T00:00:00.000Z`).toISOString()
    const endDT   = new Date(`${date}T23:59:59.000Z`).toISOString()

    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView` +
      `?startDateTime=${encodeURIComponent(startDT)}&endDateTime=${encodeURIComponent(endDT)}` +
      `&$select=id,subject,start,end,seriesMasterId&$top=50`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="America/Chicago"',
      },
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      console.error('resolve POST - Graph calendarView error:', errData)
      return NextResponse.json(
        { error: 'Could not reach Outlook to confirm this session. Please try again.' },
        { status: 503 }
      )
    }

    const data = await res.json()
    const occurrences: any[] = data.value || []

    // Find an occurrence for this session on this date
    const occurrence = occurrences.find(
      o => o.seriesMasterId === matchingSession.outlook_event_id
    )

    if (occurrence) {
      return NextResponse.json({
        status: 'active',
        session: matchingSession,
        occurrence_id: occurrence.id,
        message: null,
        zoom_link: zoomLink,
      })
    }

    // Session expected but not in Outlook — likely canceled
    return NextResponse.json({
      status: 'canceled',
      session: matchingSession,
      occurrence_id: null,
      message: `The ${matchingSession.display_title} session appears to have been canceled on this date.`,
      zoom_link: zoomLink,
    })

  } catch (err: any) {
    console.error('resolve POST - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
