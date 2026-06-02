import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!
const BROKER_ID = '7d99cfe9-db1e-42db-aa2a-7a42a68765f6'

async function getAgents() {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, email, role, status, is_active, created_at, mls_choice, is_licensed_agent')
    .eq('is_active', true)
    .eq('is_licensed_agent', true)
    .neq('id', BROKER_ID)
    .order('first_name')
  return data || []
}

async function getTransactions(dateFrom: string, dateTo: string) {
  const { data } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('id, agent_id, agent_gross, amount_1099_reportable, transaction:transactions!inner(id, compliance_status, created_at, transaction_type)')
    .not('transaction', 'is', null)
    .limit(500)
  return data || []
}

async function getFathomMeetings(dateFrom: string, dateTo: string) {
  const { data } = await supabaseAdmin
    .from('fathom_meetings')
    .select('recording_date, speakers, duration_minutes, transcript_text, share_url')
    .gte('recording_date', dateFrom)
    .lte('recording_date', dateTo)
    .order('recording_date', { ascending: false })
  return data || []
}

async function getCalendarEvents(dateFrom: string, dateTo: string) {
  try {
    const token = await getGraphToken()
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView?startDateTime=${dateFrom}T00:00:00Z&endDateTime=${dateTo}T23:59:59Z&$select=subject,start,end&$top=100&$orderby=start/dateTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.value || []
  } catch {
    return []
  }
}

async function getZoomAttendance(dateFrom: string, dateTo: string) {
  try {
    // Get recordings from Zoom for the date range
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    if (!tokenRes.ok) return []
    const { access_token } = await tokenRes.json()

    // List past meetings in range
    const meetingsRes = await fetch(
      `https://api.zoom.us/v2/users/${process.env.ZOOM_HOST_EMAIL}/recordings?from=${dateFrom}&to=${dateTo}&page_size=50`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    if (!meetingsRes.ok) return []
    const meetingsData = await meetingsRes.json()
    const meetings = meetingsData.meetings || []

    const attendance: any[] = []
    for (const meeting of meetings.slice(0, 20)) {
      try {
        const partRes = await fetch(
          `https://api.zoom.us/v2/report/meetings/${meeting.uuid}/participants?page_size=300`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (!partRes.ok) continue
        const partData = await partRes.json()
        attendance.push({
          meetingId: meeting.uuid,
          topic: meeting.topic,
          startTime: meeting.start_time,
          duration: meeting.duration,
          participants: (partData.participants || []).map((p: any) => ({
            name: p.name,
            email: p.user_email,
            duration: p.duration,
          })),
        })
      } catch { continue }
    }
    return attendance
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_view_insights')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateTo = searchParams.get('to') || new Date().toISOString().slice(0, 10)

  const [agents, transactions, fathomMeetings, calendarEvents, zoomAttendance] = await Promise.all([
    getAgents(),
    getTransactions(dateFrom, dateTo),
    getFathomMeetings(dateFrom, dateTo),
    getCalendarEvents(dateFrom, dateTo),
    getZoomAttendance(dateFrom, dateTo),
  ])

  // Build agent production map
  const agentProduction: Record<string, { closes: number; volume: number; agentGross: number }> = {}
  for (const ta of transactions) {
    const id = (ta as any).agent_id
    if (!id) continue
    if (!agentProduction[id]) agentProduction[id] = { closes: 0, volume: 0, agentGross: 0 }
    const txn = (ta as any).transaction
    if (txn?.compliance_status === 'completed') {
      agentProduction[id].closes++
      agentProduction[id].agentGross += parseFloat((ta as any).agent_gross || 0)
    }
  }

  // Build attendance map from Zoom
  const attendanceMap: Record<string, { sessions: number; names: string[] }> = {}
  for (const meeting of zoomAttendance) {
    for (const p of meeting.participants) {
      const key = p.email?.toLowerCase() || p.name?.toLowerCase()
      if (!key) continue
      if (!attendanceMap[key]) attendanceMap[key] = { sessions: 0, names: [] }
      attendanceMap[key].sessions++
      if (!attendanceMap[key].names.includes(meeting.topic)) {
        attendanceMap[key].names.push(meeting.topic)
      }
    }
  }

  // Build fathom speaker frequency (proxy for engagement when speaking)
  const speakerFrequency: Record<string, number> = {}
  for (const m of fathomMeetings) {
    for (const speaker of (m.speakers || [])) {
      speakerFrequency[speaker] = (speakerFrequency[speaker] || 0) + 1
    }
  }

  // Combine into agent scorecards
  const scorecards = agents.map(agent => {
    const fullName = `${agent.first_name} ${agent.last_name}`
    const emailKey = agent.email?.toLowerCase()
    const production = agentProduction[agent.id] || { closes: 0, volume: 0, agentGross: 0 }
    const attendance = attendanceMap[emailKey] || { sessions: 0, names: [] }
    const speakerCount = speakerFrequency[fullName] || 0

    return {
      id: agent.id,
      name: fullName,
      email: agent.email,
      officeLocation: agent.mls_choice || null,
      mlsChoice: agent.mls_choice,
      joinedAt: agent.created_at,
      closes: production.closes,
      agentGross: Math.round(production.agentGross),
      attendanceSessions: attendance.sessions,
      programsAttended: attendance.names,
      speakerEngagement: speakerCount,
    }
  })

  // Sort by closes desc for top producers
  const topProducers = [...scorecards]
    .filter(a => a.closes > 0)
    .sort((a, b) => b.closes - a.closes)
    .slice(0, 10)

  // Most consistent attendees
  const topAttendees = [...scorecards]
    .filter(a => a.attendanceSessions > 0)
    .sort((a, b) => b.attendanceSessions - a.attendanceSessions)
    .slice(0, 10)

  // Agents who haven't attended
  const notAttending = scorecards
    .filter(a => a.attendanceSessions === 0)
    .sort((a, b) => b.closes - a.closes)

  // Training sessions summary
  const sessionsByProgram: Record<string, number> = {}
  for (const e of calendarEvents) {
    if (!e.subject?.toLowerCase().startsWith('guest for')) {
      sessionsByProgram[e.subject] = (sessionsByProgram[e.subject] || 0) + 1
    }
  }

  // Transcript themes (top topics from Fathom)
  const allTranscripts = fathomMeetings
    .map(m => m.transcript_text || '')
    .join('\n')
    .slice(0, 15000)

  return NextResponse.json({
    dateFrom,
    dateTo,
    summary: {
      totalAgents: agents.length,
      totalSessions: calendarEvents.filter((e: any) => !e.subject?.toLowerCase().startsWith('guest')).length,
      totalTransactions: [...new Set(transactions.map((t: any) => t.transaction?.id).filter(Boolean))].length,
      fathomRecordings: fathomMeetings.length,
    },
    scorecards,
    topProducers,
    topAttendees,
    notAttending,
    sessionsByProgram,
    transcriptSample: allTranscripts,
    rawData: {
      agents: agents.map(a => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, email: a.email, office: a.mls_choice })),
      calendarEvents: calendarEvents.map((e: any) => ({ subject: e.subject, start: e.start?.dateTime })),
      fathomSessions: fathomMeetings.map(m => ({ date: m.recording_date, speakers: m.speakers, duration: m.duration_minutes })),
      zoomAttendance: zoomAttendance.map(m => ({ topic: m.topic, date: m.startTime, count: m.participants.length })),
    },
  })
}
