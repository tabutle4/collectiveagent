import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (session.exp * 1000 < Date.now()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const { data: dbSession } = await supabaseAdmin
      .from('sessions')
      .select('is_valid')
      .eq('session_id', session.sessionId)
      .single()

    if (!dbSession?.is_valid) {
      return NextResponse.json({ error: 'Session invalidated' }, { status: 401 })
    }

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select(
        'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, roles, office, commission_plan, full_nav_access, status, is_active, headshot_url, headshot_crop, qualifying_transaction_count, join_date, division, monthly_fee_paid_through'
      )
      .eq('id', session.user.id)
      .single()

    let permissions: string[] = []
    if (dbUser?.role) {
      const { data: roleData } = await supabaseAdmin
        .from('roles')
        .select('id')
        .eq('name', dbUser.role)
        .single()

      if (roleData) {
        const { data: rolePerms } = await supabaseAdmin
          .from('role_permissions')
          .select('permission_id, permissions(code)')
          .eq('role_id', roleData.id)

        if (rolePerms) {
          permissions = rolePerms.map((rp: any) => rp.permissions?.code).filter(Boolean)
        }
      }
    }

    return NextResponse.json({
      user: { ...session.user, ...dbUser },
      permissions,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
