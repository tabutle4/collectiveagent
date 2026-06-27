import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// POST /api/admin/coaching-schedule/auto-link
// Fetches ALL Outlook calendar events, matches by subject to DB display_title
// (case-insensitive, exact), and updates outlook_event_id in DB.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    // 1. Fetch all DB sessions (unlinked only)
    const { data: sessions, error: dbErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,display_title,outlook_event_id')

    if (dbErr) {
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    const rows: any[] = (sessions as any) || []

    // 2. Fetch ALL Outlook events — no type filter, get everything
    const token = await getGraphToken()
    const url =
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events` +
      `?$select=id,subject,type&$top=200`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
    const outlookEvents: any[] = data.value || []

    // 3. Match and update
    const linked: string[] = []
    const unlinked: string[] = []
    const alreadyLinked: string[] = []

    for (const row of rows) {
      if (row.outlook_event_id) {
        alreadyLinked.push(row.display_title)
        continue
      }

      // Case-insensitive exact match on subject
      const match = outlookEvents.find(
        e => e.subject?.toLowerCase().trim() === row.display_title?.toLowerCase().trim()
      )

      if (match) {
        await supabaseAdmin
          .from('coaching_schedule_sessions' as any)
          .update({ outlook_event_id: match.id })
          .eq('id', row.id)
        linked.push(`${row.display_title} → ${match.type} (${match.id.slice(0, 8)}...)`)
      } else {
        unlinked.push(row.display_title)
      }
    }

    // Also return the full event list so you can see what's available
    const available = outlookEvents.map(e => ({ id: e.id, subject: e.subject, type: e.type }))

    return NextResponse.json({ linked, unlinked, alreadyLinked, available })
  } catch (err: any) {
    console.error('auto-link error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
