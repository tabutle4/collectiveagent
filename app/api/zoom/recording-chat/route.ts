import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { askRecordingAI } from '@/lib/zoom/ai-naming'

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { messages, context } = await req.json()

  try {
    const reply = await askRecordingAI(messages, context || {})
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
