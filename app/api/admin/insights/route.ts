import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
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

// Chunk an .in() id list so a wide date range (1,500+ TIA rows across
// 1,000+ closed deals) neither truncates at the PostgREST 1,000-row cap nor
// blows the URL length limit with one giant id list.
const IN_CHUNK = 200
async function fetchTiaForTxnIds(txnIds: string[], columns: string) {
  const rows: any[] = []
  for (let i = 0; i < txnIds.length; i += IN_CHUNK) {
    const chunk = txnIds.slice(i, i + IN_CHUNK)
    const chunkRows = await fetchAllRows('transaction_internal_agents', columns, {
      filters: [{ type: 'in', column: 'transaction_id', value: chunk }],
    })
    rows.push(...chunkRows)
  }
  return rows
}

async function getTransactions(dateFrom: string, dateTo: string) {
  // Paginated: the closed-transaction set already exceeds a bare select's
  // 1,000-row cap on wide ranges, which silently truncated these insights.
  const txns = await fetchAllRows(
    'transactions',
    'id, status, transaction_type, closing_date, sales_price, monthly_rent',
    {
      filters: [
        { type: 'eq', column: 'status', value: 'closed' },
        { type: 'gte', column: 'closing_date', value: dateFrom },
        { type: 'lte', column: 'closing_date', value: dateTo },
      ],
    }
  )

  if (!txns || txns.length === 0) return { txns: [], tiaRows: [] }

  const txnIds = txns.map((t: any) => t.id)
  const tiaRows = await fetchTiaForTxnIds(
    txnIds,
    'transaction_id, agent_id, agent_role, agent_net, sales_volume'
  )

  return { txns: txns || [], tiaRows: tiaRows || [] }
}

async function getPreviousPeriodTransactions(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  const daysDiff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - daysDiff)

  const txns = await fetchAllRows('transactions', 'id, status', {
    filters: [
      { type: 'eq', column: 'status', value: 'closed' },
      { type: 'gte', column: 'closing_date', value: prevFrom.toISOString().slice(0, 10) },
      { type: 'lte', column: 'closing_date', value: prevTo.toISOString().slice(0, 10) },
    ],
  })

  if (!txns || txns.length === 0) return []

  const tiaRows = await fetchTiaForTxnIds(
    txns.map((t: any) => t.id),
    'agent_id, agent_role'
  )

  const agentsWithCloses = new Set<string>()
  for (const ta of (tiaRows || [])) {
    if (PRODUCTION_ROLES.includes(ta.agent_role)) agentsWithCloses.add(ta.agent_id)
  }
  return Array.from(agentsWithCloses)
}

async function getFathomMeetings(dateFrom: string, dateTo: string) {
  const { data } = await supabaseAdmin
    .from('fathom_meetings')
    .select('recording_date, speakers, duration_minutes, transcript_text, summary, share_url')
    .gte('recording_date', dateFrom)
    .lte('recording_date', dateTo)
    .order('recording_date', { ascending: false })
  return data || []
}

async function getZoomRecordingJobs(dateFrom: string, dateTo: string) {
  const { data } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('id, meeting_id, meeting_title, final_title, final_folder, start_time, status, transcript_text, chat_text, zoom_summary')
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
  const match = name.match(/- (\d{1,2}-\d{1,2}-\d{2}) -/)
  if (!match) return null
  const [m, d, y] = match[1].split('-')
  return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_view_insights')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateTo = searchParams.get('to') || new Date().toISOString().slice(0, 10)

  const graphToken = await getGraphToken()

  const [agents, transactions, prevAgentsWithCloses, fathomMeetings, zoomJobs, sharePointVideos] = await Promise.all([
    getAgents(),
    getTransactions(dateFrom, dateTo),
    getPreviousPeriodTransactions(dateFrom, dateTo),
    getFathomMeetings(dateFrom, dateTo),
    getZoomRecordingJobs(dateFrom, dateTo),
    getSharePointVideos(graphToken),
  ])

  const jobIds = zoomJobs.map((j: any) => j.id)
  const storedParticipants = await getStoredParticipants(jobIds)

  // Build attendance map from stored Zoom participants
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

  // Fathom speaker frequency as fallback for attendance
  const speakerFrequency: Record<string, number> = {}
  for (const m of fathomMeetings) {
    for (const speaker of (m.speakers || [])) {
      speakerFrequency[speaker] = (speakerFrequency[speaker] || 0) + 1
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

  // Build scorecards — use Zoom attendance if available, Fathom as fallback
  const hasZoomAttendance = storedParticipants.length > 0
  const scorecards = agents.map((agent: any) => {
    const fullName = `${agent.first_name} ${agent.last_name}`
    const emailKey = agent.email?.toLowerCase()
    const production = agentProduction[agent.id] || { closes: 0, volume: 0, agentNet: 0 }
    const zoomAttendance = attendanceMap[emailKey] || { sessions: 0, names: [] }
    const fathomCount = speakerFrequency[fullName] || 0
    // Use Zoom if we have data, otherwise fall back to Fathom speaker count
    const attendanceSessions = hasZoomAttendance ? zoomAttendance.sessions : fathomCount
    const attendanceSource = hasZoomAttendance ? 'zoom' : (fathomCount > 0 ? 'fathom' : 'none')

    return {
      id: agent.id,
      name: fullName,
      email: agent.email,
      officeLocation: agent.mls_choice || null,
      mlsChoice: agent.mls_choice,
      joinedAt: agent.created_at,
      closes: production.closes,
      agentGross: Math.round(production.agentNet || 0),
      attendanceSessions,
      attendanceSource,
      programsAttended: zoomAttendance.names,
      speakerEngagement: fathomCount,
    }
  })

  const topProducers = [...scorecards]
    .filter((a: any) => a.closes > 0)
    .sort((a: any, b: any) => b.closes - a.closes || b.agentGross - a.agentGross)
    .slice(0, 10)

  const highestAttendance = [...scorecards]
    .filter((a: any) => a.attendanceSessions > 0)
    .sort((a: any, b: any) => b.attendanceSessions - a.attendanceSessions)
    .slice(0, 6)

  const notAttending = scorecards
    .filter((a: any) => a.attendanceSessions === 0)
    .sort((a: any, b: any) => b.closes - a.closes)

  // Top Fathom speakers (always Fathom, separate from attendance)
  const topSpeakers = Object.entries(speakerFrequency)
    .filter(([name]) => !name.toLowerCase().includes('courtney'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))

  // Best and worst attended sessions from stored Zoom participants
  const sessionAttendance: Record<string, { title: string; count: number; date: string }> = {}
  for (const p of storedParticipants) {
    const job = zoomJobs.find((j: any) => j.id === p.zoom_recording_job_id)
    if (!job) continue
    const key = p.zoom_recording_job_id
    if (!sessionAttendance[key]) {
      sessionAttendance[key] = {
        title: job.final_title || job.meeting_title || 'Unknown Session',
        count: 0,
        date: job.start_time ? new Date(job.start_time).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: '2-digit' }) : '',
      }
    }
    sessionAttendance[key].count++
  }
  const sessionAttendanceArr = Object.values(sessionAttendance)
  const bestAttended = [...sessionAttendanceArr].sort((a, b) => b.count - a.count).slice(0, 5)
  const worstAttended = [...sessionAttendanceArr].sort((a, b) => a.count - b.count).slice(0, 5)

  // Videos by folder from SharePoint
  const videosByFolder: Record<string, number> = {}
  for (const v of sharePointVideos) {
    videosByFolder[v.folder] = (videosByFolder[v.folder] || 0) + 1
  }
  // Sort by count desc
  const videosByFolderSorted = Object.entries(videosByFolder)
    .sort(([, a], [, b]) => b - a)
    .reduce((acc: Record<string, number>, [k, v]) => { acc[k] = v; return acc }, {})

  // Agents with closes count
  const agentsWithClosesCount = Object.keys(agentProduction).filter(id => agentProduction[id].closes > 0).length

  // Retention risk: had activity last period, silent this period
  const prevAgentSet = new Set(prevAgentsWithCloses)
  const retentionRisk = scorecards
    .filter((a: any) => {
      const hadPrevCloses = prevAgentSet.has(a.id)
      const silentNow = a.closes === 0 && a.attendanceSessions === 0
      return hadPrevCloses && silentNow
    })
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      prevCloses: prevAgentSet.has(a.id) ? '1+' : '0',
      currentCloses: a.closes,
      currentSessions: a.attendanceSessions,
    }))

  // Transcripts for AI chat
  const zoomTranscripts = zoomJobs
    .filter((j: any) => j.transcript_text || j.zoom_summary)
    .map((j: any) => {
      const parts = []
      if (j.zoom_summary) parts.push(`Summary: ${j.zoom_summary}`)
      if (j.transcript_text) parts.push(`Transcript: ${j.transcript_text.slice(0, 2000)}`)
      if (j.chat_text) parts.push(`Chat: ${j.chat_text.slice(0, 500)}`)
      return `[${j.final_title || j.meeting_title}]\n${parts.join('\n')}`
    })
    .join('\n\n')
    .slice(0, 10000)
  const fathomTranscripts = fathomMeetings
    .filter((m: any) => m.transcript_text || m.summary)
    .map((m: any) => {
      const parts = []
      if (m.summary) parts.push(`Fathom Summary: ${m.summary}`)
      if (m.transcript_text) parts.push(`Fathom Transcript: ${m.transcript_text.slice(0, 2000)}`)
      return `[Fathom - ${m.recording_date}]\n${parts.join('\n')}`
    })
    .join('\n\n')
    .slice(0, 5000)
  // Include both Zoom and Fathom transcripts — labeled by source
  const allTranscripts = [zoomTranscripts, fathomTranscripts].filter(Boolean).join('\n\n---\n\n').slice(0, 12000)

  return NextResponse.json({
    dateFrom,
    dateTo,
    attendanceSource: hasZoomAttendance ? 'zoom' : 'fathom',
    summary: {
      totalAgents: agents.length,
      agentsWithCloses: agentsWithClosesCount,
      totalTransactions: (transactions as any).txns?.length || 0,
      sharePointVideos: sharePointVideos.length,
    },
    scorecards,
    topProducers,
    highestAttendance,
    notAttending,
    topSpeakers,
    bestAttended,
    worstAttended,
    retentionRisk,
    videosByFolder: videosByFolderSorted,
    transcriptSample: allTranscripts,
    rawData: {
      agents: agents.map((a: any) => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, email: a.email, office: a.mls_choice })),
      fathomSessions: fathomMeetings.map((m: any) => ({ date: m.recording_date, speakers: m.speakers, duration: m.duration_minutes })),
      zoomSessions: zoomJobs.map((j: any) => ({
        title: j.final_title || j.meeting_title,
        folder: j.final_folder,
        date: j.start_time,
        hasTranscript: !!j.transcript_text,
        hasChat: !!j.chat_text,
        hasSummary: !!j.zoom_summary,
      })),
      sharePointVideos: sharePointVideos.slice(0, 50).map((v: any) => ({ folder: v.folder, name: v.name, date: parseDateFromFilename(v.name) || v.createdAt?.slice(0, 10) })),
      retentionRisk,
    },
  })
}

