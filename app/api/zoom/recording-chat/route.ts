import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { messages, context } = await req.json()

  // Always include Zoom transcript/summary regardless of which system prompt branch is used
  const transcriptAppendix = `

ZOOM TRANSCRIPT FOR THIS RECORDING:
${context.transcript || 'not available'}

ZOOM SMART SUMMARY:
${context.summary || 'not available'}

FATHOM TRANSCRIPT:
${context.fathomTranscript || 'not available'}

Current title: ${context.title}
Current folder: ${context.folder}
Current topics: ${context.topics}
Available folders: ${context.folders}
Available programs: ${context.programs}`

  const baseSystem = context.systemPrompt || `You are an assistant helping a real estate brokerage administrator name and categorize a Zoom training recording for Collective Realty Co.

HOST NOTE: "Courtney Alexander" in Zoom is Courtney Okanlomo, the Broker/Owner. Do NOT include her name in titles.

Help the user refine the title, suggest topics, or recommend a folder. Keep responses concise and practical.`

  const system = baseSystem + transcriptAppendix

  // Check if this is a JSON request (AI Suggest All)
  const lastMessage = messages[messages.length - 1]?.content || ''
  const isJsonRequest = lastMessage.includes('Respond ONLY with a JSON object') || lastMessage.includes('"program":')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: isJsonRequest ? 300 : 500,
      system: isJsonRequest
        ? system + '\n\nIMPORTANT: Your response must be ONLY valid JSON. No preamble, no explanation, no markdown code blocks. Just the raw JSON object.'
        : system,
      messages,
    }),
  })

  try {
    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
    return NextResponse.json({ reply })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
