import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import {
  buildEventBody,
  getDayLabel,
  formatTimeDisplay,
  getRecurrenceLabel,
} from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const { data: sessions, error: dbErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,display_title,outlook_event_id,recurrence_type,recurrence_day,start_time,end_time,platform,audience,host,description,image_url,active')
      .eq('active', true)
      .not('outlook_event_id', 'is', null)

    if (dbErr) return NextResponse.json({ error: 'DB error' }, { status: 500 })

    const rows: any[] = (sessions as any) || []
    if (rows.length === 0) {
      return NextResponse.json({ synced: [], failed: [], skipped: 'No linked active sessions found.' })
    }

    const token = await getGraphToken()

    const synced: string[] = []
    const failed: { title: string; error: string }[] = []

    for (const row of rows) {
      try {
        const eventBody = buildEventBody({
          displayTitle:    row.display_title,
          dayLabel:        getDayLabel(row.recurrence_type, row.recurrence_day),
          timeDisplay:     formatTimeDisplay(row.start_time, row.end_time),
          recurrenceLabel: getRecurrenceLabel(row.recurrence_type),
          platform:        row.platform || '',
          audience:        row.audience || '',
          host:            row.host || null,
          description:     row.description || '',
          imageUrl:        row.image_url || null,
        })

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${row.outlook_event_id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              // Body-only PATCH — silent, no agent notifications
              Prefer: 'outlook.timezone="America/Chicago", outlook.no-updates',
            },
            body: JSON.stringify({
              body: { contentType: 'html', content: eventBody },
            }),
          }
        )

        if (res.ok) {
          synced.push(row.display_title)
        } else {
          const err = await res.json().catch(() => ({}))
          failed.push({
            title: row.display_title,
            error: err?.error?.message || `Graph ${res.status}`,
          })
        }
      } catch (err: any) {
        failed.push({ title: row.display_title, error: err.message })
      }
    }

    return NextResponse.json({ synced, failed })
  } catch (err: any) {
    console.error('sync-all exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
