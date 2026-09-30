/**
 * Who is allowed to read a PM portal dashboard.
 *
 * The tenant and landlord dashboard routes both take `?user_id=`, and before
 * this guard existed either one would hand back that person's full record,
 * lease, invoices and repairs to anyone who asked, with no session at all.
 * /api/pm sits in middleware PUBLIC_PATHS, so nothing upstream was checking.
 *
 * One function, both routes. An auth guard is the last thing that should exist
 * as two copies: someone tightening the tenant portal later and not noticing
 * the landlord one would leave half the hole open, and nothing in CI would say so.
 */

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api-auth'

/**
 * True when the caller is the portal user they are asking about, or is staff
 * previewing that portal. The ?token= magic-link branch does not come through
 * here - it authenticates itself by looking the token up.
 */
export async function callerMayReadPortal(
  request: NextRequest,
  supabase: SupabaseClient,
  requestedId: string,
  expectedType: 'tenant' | 'landlord'
): Promise<boolean> {
  // The person's own portal session.
  const sessionToken = request.cookies.get('pm_session')?.value
  if (sessionToken) {
    const { data: session } = await supabase
      .from('pm_sessions')
      .select('user_id, user_type')
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (session && session.user_id === requestedId && session.user_type === expectedType) {
      return true
    }
  }

  // Staff previewing the portal from the admin side. Same test /api/pm/admin-check
  // makes, so anyone the client shows preview mode to is accepted here too.
  const auth = await requireAuth(request)
  if (!auth.error && auth.permissions.has('can_manage_pm')) {
    return true
  }

  return false
}
