import { NextRequest, NextResponse } from 'next/server'
import { sendCalendarReminderEmail } from '@/lib/email'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!
const TENANT_ID = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!

async function getToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  )
  const data = await res.json()
  return data.access_token as string
}

function formatEventTime(dateTimeStr: string): string {
  return new Date(dateTimeStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    // Window: events starting 8-13 minutes from now.
    // Matches the 5-minute cron interval so each event is caught exactly once.
    const windowStart = new Date(now.getTime() + 8 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 13 * 60 * 1000)

    const token = await getToken()

    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView` +
      `?startDateTime=${windowStart.toISOString()}` +
      `&endDateTime=${windowEnd.toISOString()}` +
      `&$select=id,subject,start,end,location,bodyPreview` +
      `&$top=10`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Calendar reminders - Graph error:', JSON.stringify(data))
      return NextResponse.json(
        { error: data.error?.message || 'Graph API error' },
        { status: 500 }
      )
    }

    // calendarView returns events that OVERLAP the window, not just start within it.
    // Filter to only events whose start time falls within our window.
    const allEvents: any[] = data.value || []
    const events = allEvents.filter((event: any) => {
      const startMs = new Date(event.start?.dateTime || '').getTime()
      return startMs >= windowStart.getTime() && startMs < windowEnd.getTime()
    })

    if (!events.length) {
      return NextResponse.json({ success: true, message: 'No upcoming events', sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const event of events) {
      try {
        await sendCalendarReminderEmail({
          title: event.subject || 'Upcoming Event',
          startTime: formatEventTime(event.start?.dateTime || now.toISOString()),
          endTime: formatEventTime(event.end?.dateTime || now.toISOString()),
          location: event.location?.displayName || undefined,
          notes: event.bodyPreview || undefined,
        })
        sent++
      } catch (err: any) {
        errors.push(`${event.subject || 'Event'}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      errors: errors.length ? errors : undefined,
    })
  } catch (err: any) {
    console.error('Calendar reminders cron error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
