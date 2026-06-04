import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const FATHOM_API_KEY = process.env.FATHOM_API_KEY!
const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// Programs where the host name is included in the title
const HOST_PROGRAMS = [
  'Collective Access Division Coaching',
  'Monthly Lease Training',
  'Monthly Apartment Locator Q&A',
]

// Known hosts per program
const PROGRAM_HOSTS: Record<string, string> = {
  'Collective Access Division Coaching – Houston with Eric Roberts': 'Eric Roberts',
  'Collective Access Division Coaching – Dallas with Terraneka Hill': 'Terraneka Hill',
  'Monthly Lease Training with Briana Thomas': 'Briana Thomas',
  'Monthly Apartment Locator Q&A with Maureen Eno in Dallas': 'Maureen Eno',
}

// SharePoint folders list (dynamic via /api/zoom/sharepoint-folders, this is the fallback)
const SHAREPOINT_FOLDERS = [
  'Announcement Recordings', 'Brokermint', 'Builders', 'Business Strategy',
  'Business Taxes', 'Collective Access Division Coaching - Dallas',
  'Collective Access Division Coaching - Houston', 'Commercial', 'Comps',
  'Contracts', 'Convert & Close Coaching', 'Daily Prospecting', 'Document Review',
  'Home Warranty', 'Inspections', 'Insurance', 'Leasing', 'Lender Market Updates',
  'Lending', 'Listings', 'Market Update', 'Marketing',
  'Navigating the Training Center, Compliance, & Onboarding', 'New Agent Coaching Circle',
  'New Construction', 'Prospecting', 'Representing Buyers',
  'Representing Sellers and Landlords', 'Sales Meetings', 'Seasoned Agent Coaching Circle',
  'Title Company Guest Trainings',
]

async function fetchFathomForDate(date: string): Promise<any | null> {
  // Check cache first
  const { data: cached } = await supabaseAdmin
    .from('fathom_meetings')
    .select('*')
    .eq('recording_date', date)
    .order('duration_minutes', { ascending: false })

  if (cached && cached.length > 0) return cached

  // Pull from Fathom API
  try {
    const after = new Date(date)
    after.setHours(0, 0, 0, 0)
    const before = new Date(date)
    before.setHours(23, 59, 59, 999)

    const res = await fetch(
      `https://api.fathom.ai/external/v1/meetings?limit=10&include_transcript=true&created_after=${after.toISOString()}&created_before=${before.toISOString()}`,
      { headers: { 'X-Api-Key': FATHOM_API_KEY } }
    )
    if (!res.ok) return null
    const data = await res.json()

    const meetings = data.items || []
    const results = []

    for (const m of meetings) {
      const t = m.transcript || []
      const transcriptText = t
        .filter((s: any) => s.text?.trim())
        .map((s: any) => `[${s.timestamp}] ${s.speaker?.display_name || ''}: ${s.text}`)
        .join('\n')

      const speakers = [...new Set(
        t.map((s: any) => s.speaker?.display_name).filter(Boolean)
      )] as string[]

      const start = new Date(m.recording_start_time)
      const end = new Date(m.recording_end_time)
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000)

      // Cache in Supabase
      const { data: saved } = await supabaseAdmin
        .from('fathom_meetings')
        .upsert({
          fathom_recording_id: m.recording_id,
          recording_date: date,
          share_url: m.share_url,
          transcript_text: transcriptText,
          summary: m.default_summary || null,
          speakers,
          duration_minutes: durationMinutes,
        }, { onConflict: 'fathom_recording_id' })
        .select()
        .single()

      if (saved) results.push(saved)
    }

    return results.length > 0 ? results : null
  } catch {
    return null
  }
}

async function fetchCalendarForDate(date: string): Promise<any[]> {
  try {
    const token = await getGraphToken()
    const start = `${date}T00:00:00Z`
    const end = `${date}T23:59:59Z`

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/calendarView?startDateTime=${start}&endDateTime=${end}&$select=subject,start,end&$top=20&$orderby=start/dateTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return []
    const data = await res.json()

    const events = data.value || []

    // Apply guest rule: "Guest for [date]" entries belong to the program at the same time
    // Mark guest events and merge them with their corresponding program
    const guestEvents = events.filter((e: any) =>
      e.subject?.toLowerCase().startsWith('guest for')
    )
    const programEvents = events.filter((e: any) =>
      !e.subject?.toLowerCase().startsWith('guest for')
    )

    // For each guest event, find matching program by overlapping time and annotate
    const enriched = programEvents.map((prog: any) => {
      const guest = guestEvents.find((g: any) =>
        g.start.dateTime === prog.start.dateTime
      )
      return {
        ...prog,
        hasGuest: !!guest,
        guestLabel: guest ? guest.subject : null,
      }
    })

    return enriched
  } catch {
    return []
  }
}

function buildSystemPrompt(
  calendarEvents: any[],
  fathomMeetings: any[],
  recordingDate: string
): string {
  const calendarText = calendarEvents.length > 0
    ? calendarEvents.map(e => {
        const dtStr = e.start.dateTime || ''
        let timeCT = ''
        if (dtStr) {
          const d = new Date(dtStr.endsWith('Z') ? dtStr : dtStr + 'Z')
          timeCT = d.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true })
        }
        const guest = e.hasGuest ? ` [Guest presenter scheduled for this session]` : ''
        return `${timeCT} CT - ${e.subject}${guest}`
      }).join('\n')
    : 'No calendar events found for this date'

  const fathomText = fathomMeetings.length > 0
    ? fathomMeetings.map(m => {
        const speakers = m.speakers?.join(', ') || 'Unknown'
        const excerpt = m.transcript_text?.slice(0, 2000) || 'No transcript'
        return `Duration: ${m.duration_minutes} min | Speakers: ${speakers}\nTranscript excerpt:\n${excerpt}`
      }).join('\n\n---\n\n')
    : 'No Fathom recordings found for this date'

  return `You are an AI assistant helping Tara Butler at Collective Realty Co. name and categorize Zoom training recordings for SharePoint.

RECORDING DATE: ${recordingDate}

CALENDAR EVENTS FOR THIS DATE (Central Time - already converted from UTC):
${calendarText}

CALENDAR RULES:
- All times above are Central Time (CT). Do not adjust them.
- "Guest for [date]" entries are NOT separate sessions - they are guest presenters for the program happening at the SAME time slot. Always associate them with that program.
- Sessions typically run 1 hour each. Back-to-back sessions may be captured in one recording.
- Recordings are now always single sessions - no splitting needed.

FATHOM RECORDING DATA:
${fathomText}

HOST NOTE:
- \"Courtney Alexander\" in Zoom and Fathom is Courtney Okanlomo, the Broker/Owner of Collective Realty Co. She hosts most sessions. Do NOT include her name in recording titles.

NAMING CONVENTION:
Format: Program Name - M-D-YY - Topic 1 - Topic 2 - Topic 3
- Use title case for all parts
- 3-4 topic tags, each 3-6 words
- NO "With Host" for Courtney Okanlomo sessions
- ADD "With Host Name" only for: Terraneka Hill (Collective Access Dallas), Eric Roberts (Collective Access Houston), Briana Thomas (Monthly Lease Training), Maureen Eno (Monthly Apartment Locator Q&A)
- Example: "Collective Access Coaching In Dallas With Terraneka Hill - 5-6-26 - Mortgage Calculator Walkthrough - FHA Loan Example - New Construction Midlothian"
- Example: "Convert & Close Coaching - 5-7-26 - Out of State Buyer Strategy - Adding Value Before Showing"
- Example: "Industry Intelligence & Market Mastery Meeting - 5-19-26 - Guest Sam - FHA 100 Loan - Entrepreneur Loans"

AVAILABLE SHAREPOINT FOLDERS:
${SHAREPOINT_FOLDERS.join(', ')}

Help the user:
1. Identify which program this recording belongs to based on calendar + transcript
2. Suggest the correct title in the exact naming format
3. Suggest the right SharePoint folder
4. Suggest 3-4 topic tags as chips
5. Answer any questions about the recording content

Keep responses concise and actionable. When suggesting a title, always show it in the exact format.`
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // YYYY-MM-DD
  const jobId = searchParams.get('jobId')

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const [fathomMeetings, calendarEvents] = await Promise.all([
    fetchFathomForDate(date),
    fetchCalendarForDate(date),
  ])

  const systemPrompt = buildSystemPrompt(
    calendarEvents,
    fathomMeetings || [],
    date
  )

  // Get the transcript excerpt for the AI suggest button
  const transcriptExcerpt = fathomMeetings?.[0]?.transcript_text?.slice(0, 3000) || ''
  const speakers = fathomMeetings?.flatMap((m: any) => m.speakers || []) || []

  return NextResponse.json({
    calendarEvents,
    fathomMeetings: fathomMeetings?.map((m: any) => ({
      shareUrl: m.share_url,
      durationMinutes: m.duration_minutes,
      speakers: m.speakers,
      transcriptExcerpt: m.transcript_text?.slice(0, 500),
    })),
    systemPrompt,
    transcriptExcerpt,
    speakers,
  })
}
