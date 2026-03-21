import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id') || session.user.id

    const supabase = createClient()

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

    return NextResponse.json({
      items: itemsRes.data || [],
      completions: completionsRes.data || [],
    })
  } catch (err: any) {
    console.error('Checklist list API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const body = await request.json()
    const { action, user_id, checklist_item_id } = body
    const userId = user_id || session.user.id

    const supabase = createClient()

    if (action === 'complete') {
      const { error } = await supabase
        .from('onboarding_checklist_completions')
        .insert({ user_id: userId, checklist_item_id, completed_by: session.user.id })
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
