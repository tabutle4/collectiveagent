import { AI_SUGGEST_ALL_PROMPT, PROGRAM_NAMES } from '@/lib/zoom/naming-prompts'

export interface RecordingAiContext {
  systemPrompt?: string
  meetingTitle?: string
  title?: string
  folder?: string
  topics?: string
  transcript?: string
  summary?: string
  fathomTranscript?: string
  folders?: string
  programs?: string
}

export interface RecordingAiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface NamingSuggestion {
  program?: string
  topics?: string[]
  folder?: string
  title?: string
}

// The system prompt the recording assistant runs on. Used by the chat route and by
// the notification cron so both talk to the model with the same instructions.
export function buildRecordingChatSystem(context: RecordingAiContext): string {
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

  return baseSystem + transcriptAppendix
}

export async function askRecordingAI(
  messages: RecordingAiMessage[],
  context: RecordingAiContext
): Promise<string> {
  const system = buildRecordingChatSystem(context)

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

  const data = await res.json()
  return data.content?.[0]?.text || 'Sorry, I could not generate a response.'
}

// Runs the same request the Suggest button runs, and returns the parsed result.
// Returns null when the model gives back something that is not valid JSON, so the
// caller can fall back to whatever it already had.
export async function suggestRecordingNaming(
  context: RecordingAiContext
): Promise<NamingSuggestion | null> {
  try {
    const reply = await askRecordingAI(
      [{ role: 'user', content: AI_SUGGEST_ALL_PROMPT }],
      { ...context, programs: context.programs || PROGRAM_NAMES.join(', ') }
    )
    const parsed = JSON.parse((reply || '{}').replace(/```json|```/g, '').trim())
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as NamingSuggestion
  } catch {
    return null
  }
}
