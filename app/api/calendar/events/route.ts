import { NextRequest, NextResponse } from 'next/server'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!
const TENANT_ID = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!

let cachedToken: string | null = null
let tokenExpiry = 0

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000
  return cachedToken
}

export async function GET(request: NextRequest) {
  try {
    const token = await getToken()
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || new Date().toISOString()
    const end = searchParams.get('end') || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'Failed to fetch events' }, { status: 500 })
    return NextResponse.json({ events: data.value || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getToken()
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

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'Failed to create event' }, { status: 500 })
    return NextResponse.json({ event: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = await getToken()
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
      return NextResponse.json({ error: data.error?.message || 'Failed to update event' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = await getToken()
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok && res.status !== 204) {
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}