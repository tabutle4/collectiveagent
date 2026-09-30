import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // requireAuth rather than a bare verifySessionToken: it also confirms the
  // session has not been revoked and the account is still active. A signed JWT
  // on its own outlives both a logout and a deactivation.
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // The caller's own checklist, always. A user_id in the query string is
    // ignored: this route reads and writes only the session user's rows. The
    // office ticks on an agent's behalf through /api/onboarding, which is gated
    // on can_manage_onboarding.
    const userId = auth.user.id

    const supabase = supabaseAdmin

    const [itemsRes, completionsRes] = await Promise.all([
      supabase
        .from('onboarding_checklist_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('onboarding_checklist_completions')
        .select('checklist_item_id, completed_at')
        .eq('user_id', userId),
    ])

    if (itemsRes.error) throw itemsRes.error

    // Only return completions belonging to items that are still active.
    // Retiring an item (is_active = false) leaves its completion rows behind on
    // purpose, so the history survives. Items are filtered to active here but
    // completions were not, which let the completed count exceed the item count
    // and broke every "checklist finished" equality test downstream.
    const activeItemIds = new Set((itemsRes.data || []).map((i: any) => i.id))
    const completions = (completionsRes.data || []).filter((c: any) =>
      activeItemIds.has(c.checklist_item_id)
    )

    return NextResponse.json({
      items: itemsRes.data || [],
      completions,
    })
  } catch (err: any) {
    console.error('Checklist list API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { action, checklist_item_id } = body
    // Same rule as the GET: the session user's own rows only. A user_id in the
    // body is ignored rather than honored.
    const userId = auth.user.id

    const supabase = supabaseAdmin

    if (action === 'complete') {
      const { error } = await supabase
        .from('onboarding_checklist_completions')
        .insert({ user_id: userId, checklist_item_id, completed_by: userId })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'uncomplete') {
      const { error } = await supabase
        .from('onboarding_checklist_completions')
        .delete()
        .eq('user_id', userId)
        .eq('checklist_item_id', checklist_item_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Checklist POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
