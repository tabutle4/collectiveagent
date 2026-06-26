import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import {
  getDayLabel,
  formatTimeDisplay,
  graphDateTimeToHHMM,
  buildEventBody,
  buildGraphRecurrence,
  nextDateForDay,
} from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// ── GET /api/admin/coaching-schedule ──────────────────────────────────────
// Returns all sessions (active + inactive) with live Graph time for linked ones.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('coaching_schedule_sessions')
      .select(
        'id,section,display_title,outlook_event_id,recurrence_type,recurrence_day,' +
        'start_time,end_time,description,platform,audience,host,highlight,image_url,active,created_at'
      )
      .order('section')
      .order('start_time')

    if (error) {
      console.error('admin coaching-schedule GET - DB error:', error)
      return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
    }

    const rows = sessions || []

    // Fetch live Graph times for linked sessions
    const linkedIds = rows.map(s => s.outlook_event_id).filter(Boolean) as string[]
    const graphTimeMap: Record<string, { startTime: string; endTime: string; subject: string }> = {}
    let outlookSeries: any[] = []

    try {
      const token = await getGraphToken()
      const url =
        `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events` +
        `?$select=id,subject,start,end,type&$top=100`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: 'outlook.timezone="America/Chicago"',
        },
      })
      if (res.ok) {
        const data = await res.json()
        outlookSeries = (data.value || []).filter((e: any) => e.type === 'seriesMaster')
        for (const m of outlookSeries) {
          if (linkedIds.includes(m.id)) {
            graphTimeMap[m.id] = {
              startTime: graphDateTimeToHHMM(m.start?.dateTime || ''),
              endTime:   graphDateTimeToHHMM(m.end?.dateTime || ''),
              subject:   m.subject || '',
            }
          }
        }
      }
    } catch (graphErr) {
      console.error('admin coaching-schedule GET - Graph error (non-fatal):', graphErr)
    }

    const shaped = rows.map(s => {
      const live = s.outlook_event_id ? graphTimeMap[s.outlook_event_id] : null
      const startTime = live?.startTime || s.start_time
      const endTime   = live?.endTime   || s.end_time
      const title     = live?.subject   || s.display_title
      const linkedEvent = outlookSeries.find(e => e.id === s.outlook_event_id)

      return {
        id:               s.id,
        section:          s.section,
        display_title:    title,
        outlook_event_id: s.outlook_event_id,
        recurrence_type:  s.recurrence_type,
        recurrence_day:   s.recurrence_day,
        start_time:       startTime,
        end_time:         endTime,
        description:      s.description,
        platform:         s.platform,
        audience:         s.audience,
        host:             s.host,
        highlight:        s.highlight,
        image_url:        s.image_url,
        active:           s.active,
        created_at:       s.created_at,
        day_label:        getDayLabel(s.recurrence_type, s.recurrence_day),
        time_display:     formatTimeDisplay(startTime, endTime),
        outlook_linked:   !!linkedEvent,
        outlook_subject:  linkedEvent?.subject || null,
      }
    })

    // Also return list of all series masters for the "link" dropdown
    const seriesOptions = outlookSeries.map(e => ({
      id:      e.id,
      subject: e.subject,
      start:   graphDateTimeToHHMM(e.start?.dateTime || ''),
      end:     graphDateTimeToHHMM(e.end?.dateTime || ''),
    }))

    return NextResponse.json({ sessions: shaped, seriesOptions })
  } catch (err: any) {
    console.error('admin coaching-schedule GET - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST /api/admin/coaching-schedule ─────────────────────────────────────
// Creates a new session in DB and creates the Outlook recurring event.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      section,
      display_title,
      recurrence_type,
      recurrence_day,
      start_time,
      end_time,
      description,
      platform,
      audience,
      host,
      highlight,
      image_url,
      outlook_event_id: existingOutlookId,
    } = body

    if (!section || !display_title || !recurrence_type || !recurrence_day || !start_time || !end_time) {
      return NextResponse.json({ error: 'section, display_title, recurrence_type, recurrence_day, start_time, end_time are required' }, { status: 400 })
    }

    let outlookEventId = existingOutlookId || null

    // Create Outlook event if no existing event was linked
    if (!outlookEventId) {
      try {
        const token = await getGraphToken()
        const startDate = nextDateForDay(recurrence_day)
        const eventBody = buildEventBody({ description, audience, host, imageUrl: image_url || null })
        const recurrence = buildGraphRecurrence(recurrence_type, recurrence_day, startDate)

        const eventPayload = {
          subject: display_title,
          body: { contentType: 'html', content: eventBody },
          start: {
            dateTime: `${startDate}T${start_time}:00`,
            timeZone: 'America/Chicago',
          },
          end: {
            dateTime: `${startDate}T${end_time}:00`,
            timeZone: 'America/Chicago',
          },
          location: { displayName: platform || '' },
          recurrence,
        }

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventPayload),
          }
        )
        if (res.ok) {
          const created = await res.json()
          outlookEventId = created.id
        } else {
          const err = await res.json().catch(() => ({}))
          console.error('Outlook event creation failed:', err)
          // Non-fatal — session still created in DB without Outlook link
        }
      } catch (graphErr) {
        console.error('Outlook event creation error (non-fatal):', graphErr)
      }
    }

    // Insert into DB
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('coaching_schedule_sessions')
      .insert({
        section,
        display_title,
        outlook_event_id: outlookEventId,
        recurrence_type,
        recurrence_day,
        start_time,
        end_time,
        description: description || '',
        platform: platform || '',
        audience: audience || '',
        host: host || null,
        highlight: highlight ?? false,
        image_url: image_url || null,
        active: true,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('coaching-schedule POST - DB insert error:', insertErr)
      const isDuplicate = insertErr.code === '23505' // unique_violation
      return NextResponse.json(
        { error: isDuplicate ? 'A session with that title already exists.' : 'Failed to create session' },
        { status: isDuplicate ? 409 : 500 }
      )
    }

    return NextResponse.json({
      success: true,
      id: inserted.id,
      outlook_event_id: outlookEventId,
      outlook_created: !!outlookEventId && !existingOutlookId,
    })
  } catch (err: any) {
    console.error('coaching-schedule POST - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
