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
          const masters: any[] = (data.value || []).filter((e: any) => e.type === 'seriesMaster')
          for (const m of masters) {
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
        // Graph unavailable — fall back to DB times silently
        console.error('coaching-schedule GET - Graph error (non-fatal):', graphErr)
      }
    }

    // 4. Merge and shape response
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
    })

    return NextResponse.json({ sessions: shaped })
  } catch (err: any) {
    console.error('coaching-schedule GET - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
