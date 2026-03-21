import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

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
