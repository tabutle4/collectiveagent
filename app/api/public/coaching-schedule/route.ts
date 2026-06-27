import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getGraphToken } from '@/lib/microsoft-graph'
import {
  getDayLabel,
  formatTimeDisplay,
  graphDateTimeToHHMM,
} from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

export async function GET(_request: NextRequest) {
  try {
    // 1. Fetch all active sessions from DB
    const { data: sessions, error } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select(
        'id,section,display_title,outlook_event_id,recurrence_type,recurrence_day,' +
        'start_time,end_time,description,platform,audience,host,highlight,image_url,active'
      )
      .eq('active', true)
      .order('section')
      .order('start_time')

    if (error) {
      console.error('coaching-schedule GET - DB error:', error)
      return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 })
    }

    const rows = (sessions || []) as any[]

    // 2. Build set of outlook_event_ids that need live time from Graph
    const linkedIds = rows
      .map(s => s.outlook_event_id)
      .filter(Boolean) as string[]

    // 3. Fetch series masters from Graph if any sessions are linked
    const graphTimeMap: Record<string, { startTime: string; endTime: string; subject: string }> = {}

    if (linkedIds.length > 0) {
      try {
        const token = await getGraphToken()
        const start = new Date().toISOString()
        const end   = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
        const url =
          `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView` +
          `?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
          `&$select=id,subject,seriesMasterId,start,end&$top=300`
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="America/Chicago"',
          },
        })
        if (res.ok) {
          const data = await res.json()
          for (const event of (data.value || [])) {
            const effectiveId = event.seriesMasterId || event.id
            if (linkedIds.includes(effectiveId) && !graphTimeMap[effectiveId]) {
              graphTimeMap[effectiveId] = {
                startTime: graphDateTimeToHHMM(event.start?.dateTime || ''),
                endTime:   graphDateTimeToHHMM(event.end?.dateTime   || ''),
                subject:   event.subject || '',
              }
            }
          }
        }
      } catch (graphErr) {
        console.error('coaching-schedule GET - Graph error (non-fatal):', graphErr)
      }
    }

    const DAY_ORDER: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4,
    }

    const shaped = rows.map(s => {
      const live = s.outlook_event_id ? graphTimeMap[s.outlook_event_id] : null
      const startTime = live?.startTime || s.start_time
      const endTime   = live?.endTime   || s.end_time
      const title     = live?.subject   || s.display_title

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
        day_label:        getDayLabel(s.recurrence_type, s.recurrence_day),
        time_display:     formatTimeDisplay(startTime, endTime),
      }
    }).sort((a, b) => {
      if (a.section !== b.section) return a.section === 'coaching' ? -1 : 1
      const dayDiff = (DAY_ORDER[a.recurrence_day] ?? 5) - (DAY_ORDER[b.recurrence_day] ?? 5)
      if (dayDiff !== 0) return dayDiff
      return a.start_time.localeCompare(b.start_time)
    })

    return NextResponse.json({ sessions: shaped })
  } catch (err: any) {
    console.error('coaching-schedule GET - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
