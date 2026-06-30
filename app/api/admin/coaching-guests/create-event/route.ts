import { NextRequest, NextResponse } from 'next/server'
import { requireAnyPermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getDelegatedTokenForUser } from '@/lib/microsoft-graph'
import {
  buildOccurrenceBody,
  buildEventBody,
  getDayLabel,
  formatTimeDisplay,
  getRecurrenceLabel,
} from '@/lib/schedule-utils'

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
      date,
      startTime,
      endTime,
      title,
      sessionId,
      guestName,
      guestCompany,
      guestEmail,
      topic,
      food,
      locationPhysical,
      locationOnline,
    } = await request.json()

    if (!date || !startTime || !endTime || !title) {
      return NextResponse.json({ error: 'date, startTime, endTime, and title are required' }, { status: 400 })
    }

    const eventTitle = `Guest Presenter \u2013 ${title}`

    // Pull the full original session record (if one matched) so the body
    // carries everything the recurring series normally shows — Day, Time,
    // Recurrence, Platform, Audience, Host, Description, image — with the
    // guest presenter info wrapped on top. Mirrors the occurrences PATCH route.
    let sessionBody: string
    if (sessionId) {
      const { data: origSession, error: sessErr } = await supabaseAdmin
        .from('coaching_schedule_sessions' as any)
        .select('display_title,platform,description,audience,host,image_url,recurrence_type,recurrence_day,start_time,end_time')
        .eq('id', sessionId)
        .single()

      if (sessErr || !origSession) {
        return NextResponse.json({ error: 'Original session not found' }, { status: 404 })
      }
      const orig = origSession as any

      sessionBody = buildEventBody({
        displayTitle:    orig.display_title,
        dayLabel:        getDayLabel(orig.recurrence_type, orig.recurrence_day),
        timeDisplay:     formatTimeDisplay(orig.start_time, orig.end_time),
        recurrenceLabel: getRecurrenceLabel(orig.recurrence_type),
        platform:        orig.platform || '',
        audience:        orig.audience || '',
        host:            orig.host || null,
        description:     orig.description || '',
        imageUrl:        orig.image_url || null,
      })
    } else {
      // No underlying session at all — genuinely ad-hoc one-off event.
      sessionBody = buildEventBody({
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
    }

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
      // Explicitly null — Microsoft will never create a recurring series
      recurrence: null,
    }

    if (attendees.length > 0) event.attendees = attendees

    const locations: { displayName: string }[] = []
    if (locationPhysical?.trim()) locations.push({ displayName: locationPhysical.trim() })
    if (locationOnline?.trim())   locations.push({ displayName: locationOnline.trim() })
    if (locations.length > 0) event.locations = locations

    const token = await getDelegatedTokenForUser(auth.user.id)
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
