import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import {
  getCachedSuggestions,
  generateThreadSuggestions,
  ThreadSuggestions,
} from '@/lib/agent-email-ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST - Batch fetch/generate AI triage suggestions.
// Body: { threadIds: string[] }
//
// Returns cached suggestions immediately. For threads with no cache (or a
// stale cache), generates up to GENERATE_LIMIT fresh ones in this call and
// reports the rest as pending; the client polls again to pick those up.
// This keeps each request under the serverless time budget while the
// Triage screen fills in progressively.
//
// Gated by can_view_agent_email.
const GENERATE_LIMIT = 4

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const threadIds: string[] = Array.isArray(body?.threadIds)
      ? body.threadIds.map((x: any) => String(x)).slice(0, 100)
      : []
    if (threadIds.length === 0) {
      return NextResponse.json({ suggestions: {}, pending: [] })
    }

    const cached = await getCachedSuggestions(threadIds)

    const needsGeneration = threadIds.filter(id => {
      const c = cached.get(id)
      return !c || c.stale
    })

    const generatedNow: ThreadSuggestions[] = []
    for (const id of needsGeneration.slice(0, GENERATE_LIMIT)) {
      const s = await generateThreadSuggestions(id)
      if (s) generatedNow.push(s)
    }

    const out: Record<string, ThreadSuggestions> = {}
    for (const [id, s] of cached) {
      if (!s.stale) out[id] = s
    }
    for (const s of generatedNow) out[s.threadId] = s

    const pending = needsGeneration
      .slice(GENERATE_LIMIT)
      .filter(id => !out[id])

    return NextResponse.json({ suggestions: out, pending })
  } catch (err: any) {
    console.error('ai suggestions route error:', err)
    return NextResponse.json({ error: err?.message || 'AI suggestions failed' }, { status: 500 })
  }
}
