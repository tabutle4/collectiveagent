import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { messages, context } = await req.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are an assistant helping a real estate brokerage administrator name and categorize a Zoom training recording.

Current recording info:
- Meeting title: ${context.meetingTitle}
- Current recording title: ${context.title}
- Current folder: ${context.folder}
- Current topics: ${context.topics}
- Transcript excerpt: ${context.transcript}

Available SharePoint folders: ${context.folders}
Available programs: ${context.programs}

Help the user refine the title, suggest topics, or recommend a folder. When suggesting a new title or topics, format them clearly. Keep responses concise and practical.`,
      messages,
    }),
  })

  const data = await res.json()
  const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
  return NextResponse.json({ reply })
}
