import { NextRequest, NextResponse } from 'next/server'
import { requireAnyPermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// GET  — list all Guest Presenter events Jul–Sep 2026
// DELETE ?id=xxx — delete a specific event by ID

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  try {
    const token = await getGraphToken()
    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView` +
      `?startDateTime=2026-07-01T00:00:00Z&endDateTime=2026-09-30T23:59:59Z` +
      `&$select=id,subject,start,end,createdDateTime,organizer&$top=100`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="America/Chicago"',
      },
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: 500 })

    const events = (data.value || []).map((e: any) => ({
      id: e.id,
      subject: e.subject,
      start: e.start?.dateTime,
      created: e.createdDateTime,
    }))

    const guest   = events.filter((e: any) => e.subject?.includes('Guest Presenter'))
    const regular = events.filter((e: any) => !e.subject?.includes('Guest Presenter'))

    return NextResponse.json({ guest, regular })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const token = await getGraphToken()
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.status === 204) return NextResponse.json({ success: true })
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: err }, { status: 500 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
