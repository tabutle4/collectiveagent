import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

export async function GET(request: NextRequest) {
  // Any authenticated user can view calendar
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    console.log('Calendar GET - GROUP_ID:', GROUP_ID)

    const token = await getGraphToken()
    console.log('Calendar GET - token obtained:', !!token)

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || new Date().toISOString()
    const end =
      searchParams.get('end') || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const url = `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=100`
    console.log('Calendar GET - fetching:', url)

    const res = await fetch(url, { 
  headers: { 
    Authorization: `Bearer ${token}`,
    Prefer: 'outlook.timezone="America/Chicago"',
  } 
})
    const data = await res.json()
    console.log('Calendar GET - response status:', res.status)
    if (!res.ok) {
      console.error('Calendar GET - error:', JSON.stringify(data))
      return NextResponse.json(
        { error: data.error?.message || 'Failed to fetch events', details: data },
        { status: 500 }
      )
    }
    return NextResponse.json({ events: data.value || [] })
  } catch (err: any) {
    console.error('Calendar GET - exception:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Only admins can create events
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const token = await getGraphToken()
    const body = await request.json()
    const { title, start, end, description, location, isAllDay } = body

    const event: any = {
      subject: title,
      body: { contentType: 'text', content: description || '' },
      start: { dateTime: start, timeZone: 'America/Chicago' },
      end: { dateTime: end, timeZone: 'America/Chicago' },
      isAllDay: isAllDay || false,
    }
    if (location) event.location = { displayName: location }

    const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    const data = await res.json()
    if (!res.ok)
      return NextResponse.json(
        { error: data.error?.message || 'Failed to create event' },
        { status: 500 }
      )
    return NextResponse.json({ event: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  // Only admins can update events
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const token = await getGraphToken()
    const body = await request.json()
    const { eventId, title, start, end, description, location, isAllDay } = body

    const event: any = {
      subject: title,
      body: { contentType: 'text', content: description || '' },
      start: { dateTime: start, timeZone: 'America/Chicago' },
      end: { dateTime: end, timeZone: 'America/Chicago' },
      isAllDay: isAllDay || false,
    }
    if (location) event.location = { displayName: location }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${eventId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    )
    if (!res.ok) {
      const data = await res.json()
      return NextResponse.json(
        { error: data.error?.message || 'Failed to update event' },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Only admins can delete events
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

    const eventUrl = `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${encodeURIComponent(eventId)}`

    // App-only token, and that is the whole mechanism. Microsoft does not send
    // meeting cancellations for deletes made with application permissions;
    // a delegated token deletes as the organizer and always mails attendees.
    //
    // This used to use a delegated token on the premise that an app-only token
    // cannot delete group calendar events. That is not true -- the coaching
    // schedule route creates and deletes events on this same group calendar
    // with getGraphToken() and has been running in production.
    //
    // It also used to PATCH attendees to [] first, on the theory that an event
    // with no attendees deletes quietly. Removing attendees is itself a change
    // Outlook notifies on: Microsoft reads every attendee absent from the array
    // as removed and mails each one a cancellation. On a recurring occurrence
    // that also forks an exception. So the step meant to keep this quiet was
    // what sent the mail, before the delete even ran.
    //
    // Graph has no sendCancellations query parameter -- the delete-event
    // reference documents none, and unknown parameters are ignored. Do not add
    // one here believing it does anything.
    const token = await getGraphToken()

    const res = await fetch(eventUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}))
      console.error('calendar events DELETE - Graph error:', err)
      return NextResponse.json(
        { error: err?.error?.message || 'Failed to delete event' },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
