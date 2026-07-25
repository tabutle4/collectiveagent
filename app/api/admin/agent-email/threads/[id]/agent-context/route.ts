import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAgentContext } from '@/lib/agent-email-context'

export const dynamic = 'force-dynamic'

// GET - Full agent context for the sidebar of a specific thread.
// Gated by can_view_agent_email.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const { data: thread, error: tErr } = await supabaseAdmin
      .from('email_threads')
      .select('agent_user_id')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const ctx = await fetchAgentContext(thread.agent_user_id)
    if (!ctx) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    return NextResponse.json({ context: ctx })
  } catch (err: any) {
    console.error('agent-context route error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load context' }, { status: 500 })
  }
}
