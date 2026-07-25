import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DEFAULT_TAGS = ['billing', 'license', 'transaction', 'systems', 'general']

// GET - List all tags currently in use across threads plus the default vocabulary.
// Returns { tags: [{ tag, count }], defaults: [...] } for the tag picker.
// Gated by can_view_agent_email.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const rows = await fetchAllRows<{ tag: string }>(
      'email_thread_tags',
      'tag'
    )
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.tag, (counts.get(r.tag) || 0) + 1)
    // Always include defaults with at least 0 count
    for (const d of DEFAULT_TAGS) if (!counts.has(d)) counts.set(d, 0)
    const tags = Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    return NextResponse.json({ tags, defaults: DEFAULT_TAGS })
  } catch (err: any) {
    console.error('tags list error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load tags' }, { status: 500 })
  }
}
