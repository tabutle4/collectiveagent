import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAnyPermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

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
      .from('coaching_schedule_sessions')
      .select('id,display_title,outlook_event_id')
      .eq('id', id)
      .single()

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!session.outlook_event_id) {
      return NextResponse.json({ occurrences: [], message: 'No Outlook event linked' })
    }

    const token = await getGraphToken()
    const startDateTime = new Date().toISOString()
    const endDateTime   = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 months

    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${session.outlook_event_id}/instances` +
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
      .from('coaching_schedule_sessions')
      .select('id,outlook_event_id,display_title,platform')
      .eq('id', id)
      .single()

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!session.outlook_event_id) {
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

    // Build the occurrence body
    const bodyLines: string[] = []
    if (guestName || guestCompany) {
      bodyLines.push(
        `<p style="margin:0 0 4px;font-size:15px;font-weight:600;">${guestName || ''}</p>`
      )
      if (guestCompany) {
        bodyLines.push(`<p style="margin:0 0 12px;color:#555;">${guestCompany}</p>`)
      }
      bodyLines.push('<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">')
    }
    if (topic) {
      bodyLines.push(`<p style="margin:0 0 8px;"><strong>Topic:</strong> ${topic}</p>`)
    }
    if (food) {
      bodyLines.push(`<p style="margin:0 0 8px;"><strong>Food:</strong> ${food}</p>`)
    }
    bodyLines.push(
      '<p style="margin:16px 0 0;font-size:12px;color:#888;">' +
      'Recordings available in the ' +
      '<a href="https://agent.collectiverealtyco.com/training-center">Training Center</a>.' +
      '</p>'
    )

    const patchPayload: any = {
      body: { contentType: 'html', content: bodyLines.join('\n') },
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
