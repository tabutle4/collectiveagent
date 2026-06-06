import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/session'
import { getUserPermissions } from '@/lib/permissions'

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
        'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, roles, office, commission_plan, full_nav_access, status, is_active, headshot_url, headshot_crop, qualifying_transaction_count, qualifying_transaction_target, waive_coaching_fee, join_date, division, monthly_fee_paid_through, new_signature_completed_at, bank_connected'
      )
      .eq('id', session.user.id)
      .single()

    // Resolve permissions through the shared resolver so role defaults AND
    // per-user overrides are applied. This must match the server-side gate
    // (requirePermission -> getUserPermissions) so the UI and the API agree.
    const permissionSet = await getUserPermissions(session.user.id)
    const permissions: string[] = Array.from(permissionSet)

    return NextResponse.json({
      user: { ...session.user, ...dbUser },
      permissions,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
