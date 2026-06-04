import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!
const BROKER_ID = '7d99cfe9-db1e-42db-aa2a-7a42a68765f6'
const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'

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

const PRODUCTION_ROLES = ['primary_agent', 'listing_agent']

async function getTransactions(dateFrom: string, dateTo: string) {
  const { data: txns } = await supabaseAdmin
    .from('transactions')
    .select('id, status, transaction_type, closing_date, sales_price, monthly_rent')
    .eq('status', 'closed')
    .gte('closing_date', dateFrom)
    .lte('closing_date', dateTo)
    .limit(1000)

  if (!txns || txns.length === 0) return { txns: [], tiaRows: [] }

  const txnIds = txns.map((t: any) => t.id)
  const { data: tiaRows } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('transaction_id, agent_id, agent_role, agent_net, sales_volume')
    .in('transaction_id', txnIds)

  return { txns: txns || [], tiaRows: tiaRows || [] }
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

async function getZoomRecordingJobs(dateFrom: string, dateTo: string) {
  const { data } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('id, meeting_id, meeting_title, final_title, final_folder, start_time, status, transcript_text')
    .eq('status', 'uploaded')
    .gte('start_time', `${dateFrom}T00:00:00Z`)
    .lte('start_time', `${dateTo}T23:59:59Z`)
    .order('start_time', { ascending: false })
  return data || []
}

async function getStoredParticipants(jobIds: string[]) {
  if (jobIds.length === 0) return []
  const { data } = await supabaseAdmin
    .from('zoom_meeting_participants')
    .select('zoom_recording_job_id, meeting_id, participant_name, participant_email, duration_minutes')
    .in('zoom_recording_job_id', jobIds)
  return data || []
}

async function getSharePointVideos(token: string): Promise<any[]> {
  try {
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!siteRes.ok) return []
    const site = await siteRes.json()

    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drives`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!drivesRes.ok) return []
    const drivesData = await drivesRes.json()
    const videosDrive = (drivesData.value || []).find((d: any) => d.name === 'Videos')
    if (!videosDrive) return []

    const foldersRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${videosDrive.id}/root/children?$select=name,folder&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!foldersRes.ok) return []
    const foldersData = await foldersRes.json()
    const folders = (foldersData.value || []).filter((f: any) => f.folder)

    const allFiles: any[] = []
    for (const folder of folders) {
      try {
        const filesRes = await fetch(
          `https://graph.microsoft.com/v1.0/drives/${videosDrive.id}/root:/${encodeURIComponent(folder.name)}:/children?$select=name,size,createdDateTime,webUrl&$top=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!filesRes.ok) continue
        const filesData = await filesRes.json()
        const mp4s = (filesData.value || []).filter((f: any) => f.name?.endsWith('.mp4'))
        for (const file of mp4s) {
          allFiles.push({ folder: folder.name, name: file.name, size: file.size, createdAt: file.createdDateTime, webUrl: file.webUrl })
        }
      } catch { continue }
    }
    return allFiles
  } catch {
    return []
  }
}

function parseDateFromFilename(name: string): string | null {
  // e.g. "Convert & Close Coaching - 6-4-26 - Topic.mp4"
  const match = name.match(/- (\d{1,2}-\d{1,2}-\d{2}) -/)
  if (!match) return null
  const [m, d, y] = match[1].split('-')
  return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
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

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_view_insights')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateTo = searchParams.get('to') || new Date().toISOString().slice(0, 10)

  const graphToken = await getGraphToken()

  const [agents, transactions, fathomMeetings, zoomJobs, calendarEvents, sharePointVideos] = await Promise.all([
    getAgents(),
    getTransactions(dateFrom, dateTo),
    getFathomMeetings(dateFrom, dateTo),
    getZoomRecordingJobs(dateFrom, dateTo),
    getCalendarEvents(dateFrom, dateTo),
    getSharePointVideos(graphToken),
  ])

  // Get stored participants for zoom jobs
  const jobIds = zoomJobs.map((j: any) => j.id)
  const storedParticipants = await getStoredParticipants(jobIds)

  // Build attendance map from stored participants
  const attendanceMap: Record<string, { sessions: number; names: string[] }> = {}
  for (const p of storedParticipants) {
    const key = p.participant_email?.toLowerCase() || p.participant_name?.toLowerCase()
    if (!key) continue
    const job = zoomJobs.find((j: any) => j.id === p.zoom_recording_job_id)
    const sessionName = job?.final_title || job?.meeting_title || 'Unknown Session'
    if (!attendanceMap[key]) attendanceMap[key] = { sessions: 0, names: [] }
    if (!attendanceMap[key].names.includes(sessionName)) {
      attendanceMap[key].sessions++
      attendanceMap[key].names.push(sessionName)
    }
  }

  // Build agent production map
  const { txns: closedTxns, tiaRows } = transactions as any
  const agentProduction: Record<string, { closes: number; volume: number; agentNet: number }> = {}
  for (const ta of (tiaRows || [])) {
    if (!ta.agent_id) continue
    if (!PRODUCTION_ROLES.includes(ta.agent_role)) continue
    if (!agentProduction[ta.agent_id]) agentProduction[ta.agent_id] = { closes: 0, volume: 0, agentNet: 0 }
    agentProduction[ta.agent_id].closes++
    agentProduction[ta.agent_id].agentNet += parseFloat(ta.agent_net || 0)
    agentProduction[ta.agent_id].volume += parseFloat(ta.sales_volume || 0)
  }

  // Fathom speaker frequency (historical, for sessions not yet in zoom_recording_jobs)
  const speakerFrequency: Record<string, number> = {}
  for (const m of fathomMeetings) {
    for (const speaker of (m.speakers || [])) {
      speakerFrequency[speaker] = (speakerFrequency[speaker] || 0) + 1
    }
  }

  // Build scorecards
  const scorecards = agents.map((agent: any) => {
    const fullName = `${agent.first_name} ${agent.last_name}`
    const emailKey = agent.email?.toLowerCase()
    const production = agentProduction[agent.id] || { closes: 0, volume: 0, agentNet: 0 }
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
      agentGross: Math.round(production.agentNet || 0),
      attendanceSessions: attendance.sessions,
      programsAttended: attendance.names,
      speakerEngagement: speakerCount,
    }
  })

  const topProducers = [...scorecards]
    .filter((a: any) => a.closes > 0)
    .sort((a: any, b: any) => b.closes - a.closes || b.agentGross - a.agentGross)
    .slice(0, 10)

  const topAttendees = [...scorecards]
    .filter((a: any) => a.attendanceSessions > 0)
    .sort((a: any, b: any) => b.attendanceSessions - a.attendanceSessions)
    .slice(0, 10)

  const notAttending = scorecards
    .filter((a: any) => a.attendanceSessions === 0)
    .sort((a: any, b: any) => b.closes - a.closes)

  // Sessions by program from calendar
  const sessionsByProgram: Record<string, number> = {}
  for (const e of calendarEvents) {
    if (!e.subject?.toLowerCase().startsWith('guest for')) {
      sessionsByProgram[e.subject] = (sessionsByProgram[e.subject] || 0) + 1
    }
  }

  // SharePoint video library summary
  const videosByFolder: Record<string, number> = {}
  for (const v of sharePointVideos) {
    videosByFolder[v.folder] = (videosByFolder[v.folder] || 0) + 1
  }

  // Build transcript context for AI chat - prefer zoom jobs, fall back to fathom
  const zoomTranscripts = zoomJobs
    .filter((j: any) => j.transcript_text)
    .map((j: any) => `[${j.final_title || j.meeting_title}]: ${j.transcript_text}`)
    .join('\n\n')
    .slice(0, 10000)

  const fathomTranscripts = fathomMeetings
    .map((m: any) => m.transcript_text || '')
    .join('\n')
    .slice(0, 5000)

  const allTranscripts = zoomTranscripts || fathomTranscripts

  return NextResponse.json({
    dateFrom,
    dateTo,
    summary: {
      totalAgents: agents.length,
      totalSessions: calendarEvents.filter((e: any) => !e.subject?.toLowerCase().startsWith('guest')).length,
      totalTransactions: (transactions as any).txns?.length || 0,
      fathomRecordings: fathomMeetings.length,
      zoomJobsUploaded: zoomJobs.length,
      sharePointVideos: sharePointVideos.length,
    },
    scorecards,
    topProducers,
    topAttendees,
    notAttending,
    sessionsByProgram,
    videosByFolder,
    transcriptSample: allTranscripts,
    rawData: {
      agents: agents.map((a: any) => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, email: a.email, office: a.mls_choice })),
      calendarEvents: calendarEvents.map((e: any) => ({ subject: e.subject, start: e.start?.dateTime })),
      fathomSessions: fathomMeetings.map((m: any) => ({ date: m.recording_date, speakers: m.speakers, duration: m.duration_minutes })),
      zoomSessions: zoomJobs.map((j: any) => ({ title: j.final_title, folder: j.final_folder, date: j.start_time })),
      sharePointVideos: sharePointVideos.slice(0, 50).map((v: any) => ({ folder: v.folder, name: v.name, date: parseDateFromFilename(v.name) || v.createdAt?.slice(0, 10) })),
    },
  })
}
