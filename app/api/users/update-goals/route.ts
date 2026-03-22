import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { user_id, active_goals } = await request.json()
    
    if (user_id !== auth.user.id && !auth.permissions.has('can_manage_agents')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ active_goals })
      .eq('id', user_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}