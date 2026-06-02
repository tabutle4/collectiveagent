import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_view_insights')
  if (auth.error) return auth.error

  const { messages, data } = await req.json()

  const system = `You are a business intelligence assistant for Collective Realty Co., a real estate brokerage in Houston and Dallas with ${data.summary?.totalAgents || 80}+ agents.

You help Courtney Okanlomo (Broker/Owner) and Tara Butler (Operations Officer) understand:
- Agent performance and production trends
- Training attendance and engagement patterns
- Opportunities to reward high-performing, reliable agents
- Agents who need check-ins or additional support
- Future training topics based on agent needs
- Business process and systems improvements

DECISIONS YOU HELP WITH:
- Who to reward: co-agent opportunities on Courtney's deals, lead assignments, recognition
- Future training content: what topics agents keep asking about or struggling with
- Agent development: who's ready for more responsibility
- Who needs a check-in: absent from training + low production = at-risk agent

DATE RANGE: ${data.dateFrom} to ${data.dateTo}

SUMMARY STATS:
- Active agents: ${data.summary?.totalAgents}
- Training sessions held: ${data.summary?.totalSessions}
- Transactions in period: ${data.summary?.totalTransactions}
- Fathom recordings available: ${data.summary?.fathomRecordings}

TOP PRODUCERS (by closes):
${data.topProducers?.map((a: any) => `${a.name}: ${a.closes} closes, $${a.agentGross.toLocaleString()} gross, ${a.attendanceSessions} training sessions`).join('\n') || 'No data'}

TOP TRAINING ATTENDEES (by sessions):
${data.topAttendees?.map((a: any) => `${a.name}: ${a.attendanceSessions} sessions attended`).join('\n') || 'No data'}

AGENTS NOT ATTENDING TRAINING:
${data.notAttending?.slice(0, 15).map((a: any) => `${a.name}: ${a.closes} closes, 0 sessions`).join('\n') || 'All agents attending'}

SESSIONS BY PROGRAM:
${Object.entries(data.sessionsByProgram || {}).map(([prog, count]) => `${prog}: ${count} sessions`).join('\n') || 'No data'}

ZOOM ATTENDANCE SUMMARY:
${data.rawData?.zoomAttendance?.map((m: any) => `${m.topic} (${m.date?.slice(0,10)}): ${m.count} attendees`).join('\n') || 'Zoom attendance data unavailable'}

TRANSCRIPT THEMES (from Fathom recordings):
${data.transcriptSample?.slice(0, 3000) || 'No transcript data available'}

ALL AGENTS:
${data.rawData?.agents?.map((a: any) => `${a.name} (${a.office || 'unknown office'})`).join(', ') || ''}

When answering:
- Be specific with names and numbers
- Always connect insights to actionable decisions
- If suggesting rewards or recognition, name specific agents
- If suggesting training topics, explain why based on the data
- Keep responses focused and practical
- Format lists clearly for easy reading`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages,
    }),
  })

  const responseData = await res.json()
  const reply = responseData.content?.[0]?.text || 'Sorry, I could not generate a response.'
  return NextResponse.json({ reply })
}
