import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { preferredDisplayName, getActiveAdmins } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// POST - Heartbeat that the current user is viewing or composing on this thread.
// Body: { activity: 'viewing' | 'composing' }
// Returns { others: [{userId, name, activity, heartbeatAt}] } for OTHER users
// who are active on the same thread (rows within 30 seconds).
// Gated by can_view_agent_email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const activity = body?.activity === 'composing' ? 'composing' : 'viewing'
    const now = new Date().toISOString()

    // Upsert heartbeat
    await supabaseAdmin.from('email_thread_viewers').upsert(
      {
        thread_id: threadId,
        user_id: auth.user.id,
        activity,
        heartbeat_at: now,
      },
      { onConflict: 'thread_id,user_id' }
    )

    // Fetch other active viewers (heartbeat within 30 seconds, not this user)
    const staleCutoff = new Date(Date.now() - 30 * 1000).toISOString()
    const { data: rows } = await supabaseAdmin
      .from('email_thread_viewers')
      .select('user_id, activity, heartbeat_at')
      .eq('thread_id', threadId)
      .neq('user_id', auth.user.id)
      .gte('heartbeat_at', staleCutoff)

    let others: Array<{
      userId: string
      name: string
      activity: string
      heartbeatAt: string
    }> = []
    if (rows && rows.length > 0) {
      const otherIds = rows.map(r => r.user_id as string)
      const admins = await getActiveAdmins()
      const byId = new Map(admins.map(a => [a.id, a]))
      others = rows
        .map(r => {
          const u = byId.get(r.user_id as string)
          if (!u) return null
          return {
            userId: r.user_id as string,
            name: preferredDisplayName(u),
            activity: r.activity as string,
            heartbeatAt: r.heartbeat_at as string,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    }

    return NextResponse.json({ others })
  } catch (err: any) {
    console.error('viewers POST error:', err)
    return NextResponse.json({ error: err?.message || 'Heartbeat failed' }, { status: 500 })
  }
}

// DELETE - Clear the current user's viewer row (called on unmount/close).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    await supabaseAdmin
      .from('email_thread_viewers')
      .delete()
      .eq('thread_id', threadId)
      .eq('user_id', auth.user.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('viewers DELETE error:', err)
    return NextResponse.json({ error: err?.message || 'Clear failed' }, { status: 500 })
  }
}
