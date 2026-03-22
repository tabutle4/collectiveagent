import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // Require can_view_all_agents permission to list all users
  const auth = await requirePermission(request, 'can_view_all_agents')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Strip sensitive fields
    const users = (data || []).map(
      ({ password_hash, reset_token, reset_token_expires, ...user }: any) => user
    )

    return NextResponse.json({ users })
  } catch (err: any) {
    console.error('Users list API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
