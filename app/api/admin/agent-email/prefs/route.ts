import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET - Current user's dashboard preferences (default view, Teams opt-in).
// Returns defaults if no row exists yet.
// Gated by can_view_agent_email.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const { data } = await supabaseAdmin
      .from('agent_email_user_prefs')
      .select('default_view, teams_notifications_enabled')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    return NextResponse.json({
      prefs: {
        defaultView: (data?.default_view as 'my' | 'all') || 'my',
        teamsNotificationsEnabled: Boolean(data?.teams_notifications_enabled),
      },
    })
  } catch (err: any) {
    console.error('prefs GET error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load prefs' }, { status: 500 })
  }
}

// PUT - Update current user's prefs. Body: { defaultView?, teamsNotificationsEnabled? }
// Gated by can_view_agent_email.
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {
      user_id: auth.user.id,
      updated_at: new Date().toISOString(),
    }
    if (body?.defaultView === 'my' || body?.defaultView === 'all') {
      patch.default_view = body.defaultView
    }
    if (typeof body?.teamsNotificationsEnabled === 'boolean') {
      patch.teams_notifications_enabled = body.teamsNotificationsEnabled
    }

    const { error } = await supabaseAdmin
      .from('agent_email_user_prefs')
      .upsert(patch, { onConflict: 'user_id' })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('prefs PUT error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to save prefs' }, { status: 500 })
  }
}
