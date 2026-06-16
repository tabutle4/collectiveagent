import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_view_insights')
  if (auth.error) return auth.error

  const { messages, data } = await req.json()

  // Build Zoom sessions list with date/time and what data we have for each
  const zoomSessionLines = (data.rawData?.zoomSessions || []).map((s: any) => {
    const dt = s.date ? new Date(s.date).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'unknown date'
    return `${dt} CT - "${s.title || 'Untitled'}" -> SharePoint folder: ${s.folder || 'unassigned'}`
  }).join('\n') || 'No Zoom sessions in this period'

  const fathomSessionLines = (data.rawData?.fathomSessions || []).map((s: any) => {
    const speakers = s.speakers?.join(', ') || 'unknown speakers'
    return `${s.date} - ${s.duration} min - Speakers: ${speakers}`
  }).join('\n') || 'No Fathom sessions in this period'

  const sharePointLines = (data.rawData?.sharePointVideos || []).slice(0, 50).map((v: any) =>
    `"${v.name}" (folder: ${v.folder}, date: ${v.date || 'unknown'})`
  ).join('\n') || 'No SharePoint videos found'

  const system = `You are a business intelligence assistant for Collective Realty Co., a real estate brokerage in Houston and Dallas with ${data.summary?.totalAgents || 80}+ agents.

You help Courtney Okanlomo (Broker/Owner) and Tara Butler (Operations Officer) understand agent performance, training attendance, and business trends.

== HOW THIS DATA IS ASSEMBLED ==
Data comes from four separate sources. Understanding what each source can and cannot tell you is critical for answering questions accurately.

1. ZOOM RECORDINGS (source: zoom_recording_jobs table)
   - Captured via Zoom webhook when a cloud recording completes
   - Stored after Tara reviews and confirms upload to SharePoint
   - Each job has: meeting title, date/time (Central Time), duration, file size
   - May also have: spoken transcript (VTT format), meeting chat log, Zoom AI smart summary
   - Transcript and summary are fetched from Zoom separately and may not be available for older recordings
   - Zoom recordings are the authoritative source for WHAT VIDEO IS IN SHAREPOINT
   - Date/time is the Zoom meeting start time, converted to CT

2. FATHOM (source: fathom_meetings table)
   - Fathom is an AI notetaker bot that joins Zoom sessions separately
   - Stored automatically when the recording detail page is loaded
   - Each session has: date, duration, speaker names (who spoke), transcript text, AI summary
   - Fathom data is the PRIMARY source for ATTENDANCE (who was in the room and spoke)
   - Fathom speaker names come from Zoom display names, not agent profiles -- they may not match exactly
   - Fathom does NOT know about SharePoint, folders, or whether the video was published

3. ZOOM MEETING PARTICIPANTS (source: zoom_meeting_participants table)
   - Captured from the Zoom participant report via API
   - Has: participant name, email, join/leave time, duration in meeting
   - This is used for attendance WHEN AVAILABLE -- more reliable than Fathom since it has emails
   - Attendance source shown in the UI: "zoom" means this table was used, "fathom" means Fathom was used as fallback

4. SHAREPOINT (source: SharePoint Videos library scan)
   - Scanned directly from the SharePoint Videos library at collectiverealtyco.sharepoint.com/sites/agenttrainingcenter
   - Shows what videos are actually published and in which folder
   - THE FILENAME IS THE SEARCHABLE TITLE. Format: "Program Name - M-D-YY - Topic 1 - Topic 2 - Topic 3"
   - Example: "Convert & Close Coaching - 6-4-26 - Lead Conversion Strategy - Converting Leads To Clients"
   - Agents search for videos by this filename. When Courtney asks to find a video, give her the exact filename or enough of it to search
   - Each video lives in a folder (e.g., "Convert & Close Coaching") AND has a filename with the same program name
   - SharePoint is the FINAL published state -- what agents can actually watch
   - The SharePoint URL is: https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter

== WHAT WE KNOW AND DON'T KNOW ==
- If you ask "what was covered in a session": check transcript/summary fields -- may be null for older recordings
- If you ask "who attended a session": Zoom participants if available, Fathom speakers as fallback
- If you ask "was this session recorded/published": check Zoom sessions and SharePoint videos
- If you ask "find me the video from [date/program]": look in the SharePoint videos list and give the exact filename -- that IS what agents search for in SharePoint
- If you ask about a specific date: cross-reference Zoom sessions (exact CT timestamp), Fathom sessions (date only), and SharePoint (date from filename)
- When giving a SharePoint filename, always include the full name so Courtney can copy-paste it into SharePoint search
- Fathom and Zoom sometimes capture the same session -- they are the same meeting, different data sources
- Not every session has both Zoom recording AND Fathom data -- some have one, some have both, some have neither
- A video in SharePoint means it was reviewed by Tara and confirmed -- not every Zoom recording gets published

== DATA FOR THIS PERIOD: ${data.dateFrom} to ${data.dateTo} ==

SUMMARY:
- Active agents: ${data.summary?.totalAgents}
- Transactions in period: ${data.summary?.totalTransactions}
- Zoom sessions confirmed to SharePoint: ${data.rawData?.zoomSessions?.length || 0}
- Fathom sessions captured: ${data.rawData?.fathomSessions?.length || 0}
- SharePoint videos available: ${data.summary?.sharePointVideos}
- Attendance source: ${data.attendanceSource === 'zoom' ? 'Zoom participant reports (most accurate)' : 'Fathom speaker detection (fallback)'}

ZOOM SESSIONS (date/time CT, title, SharePoint folder):
${zoomSessionLines}

FATHOM SESSIONS (date, duration, who spoke):
${fathomSessionLines}

SHAREPOINT VIDEOS PUBLISHED:
${sharePointLines}

TOP PRODUCERS (by closes):
${data.topProducers?.map((a: any) => `${a.name}: ${a.closes} closes, $${a.agentGross?.toLocaleString()} gross, ${a.attendanceSessions} sessions attended`).join('\n') || 'No data'}

AGENTS NOT ATTENDING TRAINING:
${data.notAttending?.slice(0, 15).map((a: any) => `${a.name}: ${a.closes} closes, 0 sessions attended`).join('\n') || 'All agents attending'}

TRANSCRIPT THEMES (Zoom + Fathom, labeled by source):
${data.transcriptSample?.slice(0, 4000) || 'No transcript data available'}

ALL AGENTS (${data.rawData?.agents?.length || 0} active):
${data.rawData?.agents?.map((a: any) => `${a.name} (${a.office === 'HAR' ? 'Houston' : a.office === 'NTREIS' ? 'Dallas' : a.office || 'unknown'})`).join(', ') || ''}

When answering:
- Be specific with names, dates, and numbers
- If asked about a specific session, check all three sources (Zoom, Fathom, SharePoint) and tell Courtney what each source shows
- If Courtney asks to find a video or training session, give the exact SharePoint filename in quotes so she can search for it directly
- The full SharePoint training library is at: https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter
- If data is missing for something (no transcript, no attendance), say so explicitly rather than guessing
- Connect insights to actionable decisions: who to recognize, who to check in with, what to teach next
- Attendance numbers reflect sessions where the agent appeared as a participant or speaker -- not just registered`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system,
        messages,
      }),
    })

    const responseData = await res.json()
    const reply = responseData.content?.[0]?.text || 'Sorry, I could not generate a response.'
    return NextResponse.json({ reply })
  } catch (err: any) {
    console.error('Insights chat error:', err)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
