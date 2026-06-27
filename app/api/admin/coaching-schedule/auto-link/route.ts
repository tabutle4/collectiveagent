import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import { graphDateTimeToHHMM } from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    // 1. Fetch all DB sessions
    const { data: sessions, error: dbErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,display_title,outlook_event_id')

    if (dbErr) {
      return NextResponse.json({ error: 'DB error fetching sessions' }, { status: 500 })
    }
    const rows: any[] = (sessions as any) || []

    // 2. Use calendarView (permitted) instead of /events (restricted by tenant policy).
    //    Extract seriesMasterId from occurrences — that IS the series master event ID.
    const token = await getGraphToken()
    const start = new Date().toISOString()
    const end   = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 months
    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView` +
      `?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
      `&$select=id,subject,type,seriesMasterId,start,end&$top=300`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="America/Chicago"',
      },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('auto-link Graph error:', res.status, JSON.stringify(err))
      return NextResponse.json(
        { error: `Graph error ${res.status}: ${err?.error?.message || JSON.stringify(err)}` },
        { status: 500 }
      )
    }

    const data = await res.json()

    // Deduplicate: recurring occurrences share a seriesMasterId — that's the ID we store.
    // Single instances use their own id.
    const eventMap = new Map<string, { id: string; subject: string; start: string; end: string }>()
    for (const event of (data.value || [])) {
      const effectiveId = event.seriesMasterId || event.id
      if (!eventMap.has(effectiveId)) {
        eventMap.set(effectiveId, {
          id:      effectiveId,
          subject: event.subject || '',
          start:   graphDateTimeToHHMM(event.start?.dateTime || ''),
          end:     graphDateTimeToHHMM(event.end?.dateTime   || ''),
        })
      }
    }
    const outlookEvents = Array.from(eventMap.values())

    // 3. Match and update
    const linked:        string[] = []
    const unlinked:      string[] = []
    const alreadyLinked: string[] = []

    for (const row of rows) {
      if (row.outlook_event_id) {
        alreadyLinked.push(row.display_title)
        continue
      }

      const match = outlookEvents.find(
        e => e.subject.toLowerCase().trim() === (row.display_title || '').toLowerCase().trim()
      )

      if (match) {
        await supabaseAdmin
          .from('coaching_schedule_sessions' as any)
          .update({ outlook_event_id: match.id })
          .eq('id', row.id)
        linked.push(`${row.display_title} (${match.id.slice(0, 8)}...)`)
      } else {
        unlinked.push(row.display_title)
      }
    }

    return NextResponse.json({
      linked,
      unlinked,
      alreadyLinked,
      outlookEventsFound: outlookEvents.length,
      outlookTitles: outlookEvents.map(e => e.subject),
    })
  } catch (err: any) {
    console.error('auto-link exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
