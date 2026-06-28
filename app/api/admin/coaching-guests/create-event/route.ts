import { NextRequest, NextResponse } from 'next/server'
import { requireAnyPermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import { buildOccurrenceBody, buildEventBody } from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// ── POST /api/admin/coaching-guests/create-event ──────────────────────────
// Creates a one-off (non-recurring) Outlook event for a guest session.
// Used when: (a) regular session was canceled, (b) no session at that time.
// Title is always "Guest Presenter – [title]"

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  try {
    const {
      date,        // "2026-07-01"
      startTime,   // "12:00"
      endTime,     // "13:00"
      title,       // session title or custom – we prefix with "Guest Presenter – "
      guestName,
      guestCompany,
      guestEmail,
      topic,
      food,
    } = await request.json()

    if (!date || !startTime || !endTime || !title) {
      return NextResponse.json({ error: 'date, startTime, endTime, and title are required' }, { status: 400 })
    }

    const eventTitle = `Guest Presenter \u2013 ${title}`

    // Build body
    const sessionBody = buildEventBody({
      displayTitle:    title,
      dayLabel:        '',
      timeDisplay:     `${startTime} \u2013 ${endTime}`,
      recurrenceLabel: 'One-time event',
      platform:        'Zoom',
      audience:        '',
      host:            null,
      description:     '',
      imageUrl:        null,
    })

    const bodyHtml = buildOccurrenceBody({
      guestName:    guestName   || '',
      guestCompany: guestCompany || '',
      topic:        topic        || '',
      food:         food         || '',
      sessionBody,
    })

    const attendees: any[] = guestEmail
      ? [{ emailAddress: { address: guestEmail, name: guestName || guestEmail }, type: 'required' }]
      : []

    const event: any = {
      subject: eventTitle,
      body: { contentType: 'html', content: bodyHtml },
      start: { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Chicago' },
      end:   { dateTime: `${date}T${endTime}:00`,   timeZone: 'America/Chicago' },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    }

    if (attendees.length > 0) event.attendees = attendees

    const token = await getGraphToken()
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('create-event POST - Graph error:', err)
      return NextResponse.json(
        { error: err?.error?.message || 'Failed to create event' },
        { status: 500 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, event_id: data.id, title: eventTitle })

  } catch (err: any) {
    console.error('create-event POST - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
