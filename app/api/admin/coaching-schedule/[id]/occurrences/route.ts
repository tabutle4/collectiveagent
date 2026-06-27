import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyPermission } from '@/lib/api-auth'
import {
  buildEventBody,
  buildOccurrenceBody,
  getDayLabel,
  formatTimeDisplay,
  getRecurrenceLabel,
} from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// ── GET /api/admin/coaching-schedule/[id]/occurrences ─────────────────────
// Returns the next 12 occurrences of the linked Outlook recurring event.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  try {
    const { id } = await params

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,display_title,outlook_event_id')
      .eq('id', id)
      .single()

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    const sess = session as any

    if (!sess.outlook_event_id) {
      return NextResponse.json({ occurrences: [], message: 'No Outlook event linked' })
    }

    const token = await getGraphToken()
    const startDateTime = new Date().toISOString()
    const endDateTime   = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${sess.outlook_event_id}/instances` +
      `?startDateTime=${startDateTime}&endDateTime=${endDateTime}` +
      `&$select=id,subject,start,end,body,attendees,location&$top=12`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="America/Chicago"',
      },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('occurrences GET - Graph error:', err)
      return NextResponse.json(
        { error: err?.error?.message || 'Failed to fetch occurrences' },
        { status: 500 }
      )
    }

    const data = await res.json()
    const occurrences = (data.value || []).map((o: any) => ({
      id:         o.id,
      subject:    o.subject,
      start:      o.start?.dateTime,
      end:        o.end?.dateTime,
      location:   o.location?.displayName || '',
      body:       o.body?.content || '',
      attendees:  (o.attendees || []).map((a: any) => ({
        name:    a.emailAddress?.name || '',
        email:   a.emailAddress?.address || '',
        type:    a.type,
      })),
    }))

    return NextResponse.json({ occurrences })
  } catch (err: any) {
    console.error('occurrences GET - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH /api/admin/coaching-schedule/[id]/occurrences ───────────────────
// Updates a specific occurrence with guest info, topic, and food details.
// Body: { occurrenceId, guestName, guestCompany, guestEmail, topic, food }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(request, ['can_manage_calendar', 'can_add_calendar_guests'])
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { occurrenceId, guestName, guestCompany, guestEmail, topic, food } = body

    if (!occurrenceId) {
      return NextResponse.json({ error: 'occurrenceId is required' }, { status: 400 })
    }

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,outlook_event_id,display_title,platform,description,audience,host,image_url,recurrence_type,recurrence_day,start_time,end_time')
      .eq('id', id)
      .single()

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    const patchSess = session as any

    if (!patchSess.outlook_event_id) {
      return NextResponse.json({ error: 'No Outlook event linked to this session' }, { status: 400 })
    }

    const token = await getGraphToken()

    // Fetch current occurrence to get existing attendees
    const currentRes = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${occurrenceId}` +
      `?$select=attendees`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const currentData = currentRes.ok ? await currentRes.json() : { attendees: [] }
    const existingAttendees: any[] = currentData.attendees || []

    // Build updated attendees: keep existing, add guest if email provided and not already there
    let attendees = [...existingAttendees]
    if (guestEmail) {
      const alreadyAdded = attendees.some(
        a => a.emailAddress?.address?.toLowerCase() === guestEmail.toLowerCase()
      )
      if (!alreadyAdded) {
        attendees.push({
          emailAddress: {
            address: guestEmail,
            name: guestName || guestEmail,
          },
          type: 'required',
        })
      }
    }

    // Build full session body (same as what the series master has)
    const sessionBody = buildEventBody({
      displayTitle:    patchSess.display_title,
      dayLabel:        getDayLabel(patchSess.recurrence_type, patchSess.recurrence_day),
      timeDisplay:     formatTimeDisplay(patchSess.start_time, patchSess.end_time),
      recurrenceLabel: getRecurrenceLabel(patchSess.recurrence_type),
      platform:        patchSess.platform || '',
      audience:        patchSess.audience || '',
      host:            patchSess.host || null,
      description:     patchSess.description || '',
      imageUrl:        patchSess.image_url || null,
    })

    // Guest info goes above the session body
    const occurrenceBodyHtml = buildOccurrenceBody({
      guestName:   guestName  || '',
      guestCompany: guestCompany || '',
      topic:       topic || '',
      food:        food  || '',
      sessionBody,
    })

    const patchPayload: any = {
      body: { contentType: 'html', content: occurrenceBodyHtml },
      attendees,
    }

    const patchRes = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${occurrenceId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchPayload),
      }
    )

    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}))
      console.error('occurrences PATCH - Graph error:', err)
      return NextResponse.json(
        { error: err?.error?.message || 'Failed to update occurrence' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('occurrences PATCH - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
