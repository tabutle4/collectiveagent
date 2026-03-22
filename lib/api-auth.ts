/**
 * API Route Authentication Helper
 *
 * Provides reusable auth functions for API routes with session verification,
 * role checks, and permission checks.
 *
 * Usage:
 *   // Basic auth (any authenticated user)
 *   const auth = await requireAuth(request)
 *   if (auth.error) return auth.error
 *   const { user, session } = auth
 *
 *   // Role-based auth (specific roles only)
 *   const auth = await requireRole(request, ['operations', 'broker'])
 *   if (auth.error) return auth.error
 *
 *   // Permission-based auth
 *   const auth = await requirePermission(request, 'can_manage_checks')
 *   if (auth.error) return auth.error
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, Session } from '@/lib/session'
import { getUserPermissions, PermissionCode, RoleName } from '@/lib/permissions'
import { supabaseAdmin } from '@/lib/supabase'

// Extended user info from database
export interface AuthUser {
  id: string
  email: string
  role: RoleName
  first_name: string
  last_name: string
  preferred_first_name: string | null
  preferred_last_name: string | null
  is_active: boolean
  status: string
}

export interface AuthResult {
  user: AuthUser
  session: Session
  permissions: Set<PermissionCode>
  error?: never
}

export interface AuthError {
  error: NextResponse
  user?: never
  session?: never
  permissions?: never
}

type AuthResponse = AuthResult | AuthError

/**
 * Require authentication - returns user info or error response
 */
export async function requireAuth(request: NextRequest): Promise<AuthResponse> {
  const sessionToken = request.cookies.get('ca_session')?.value

  if (!sessionToken) {
    return {
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    }
  }

  const session = await verifySessionToken(sessionToken)
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }),
    }
  }

  // Check session expiry
  if (session.exp * 1000 < Date.now()) {
    return {
      error: NextResponse.json({ error: 'Session expired' }, { status: 401 }),
    }
  }

  // Verify session is still valid in database
  const { data: dbSession } = await supabaseAdmin
    .from('sessions')
    .select('is_valid')
    .eq('session_id', session.sessionId)
    .single()

  if (!dbSession?.is_valid) {
    return {
      error: NextResponse.json({ error: 'Session invalidated' }, { status: 401 }),
    }
  }

  // Get fresh user data from database
  const { data: dbUser, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, role, first_name, last_name, preferred_first_name, preferred_last_name, is_active, status')
    .eq('id', session.user.id)
    .single()

  if (userError || !dbUser) {
    return {
      error: NextResponse.json({ error: 'User not found' }, { status: 401 }),
    }
  }

  // Check user is active
  if (!dbUser.is_active || dbUser.status !== 'active') {
    return {
      error: NextResponse.json({ error: 'Account is not active' }, { status: 403 }),
    }
  }

  // Get user permissions
  const permissions = await getUserPermissions(dbUser.id)

  const user: AuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: (dbUser.role || 'agent').toLowerCase() as RoleName,
    first_name: dbUser.first_name,
    last_name: dbUser.last_name,
    preferred_first_name: dbUser.preferred_first_name,
    preferred_last_name: dbUser.preferred_last_name,
    is_active: dbUser.is_active,
    status: dbUser.status,
  }

  return { user, session, permissions }
}

/**
 * Require specific role(s) - returns user info or error response
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: RoleName[]
): Promise<AuthResponse> {
  const auth = await requireAuth(request)
  if (auth.error) return auth

  if (!allowedRoles.includes(auth.user.role)) {
    return {
      error: NextResponse.json(
        { error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
        { status: 403 }
      ),
    }
  }

  return auth
}

/**
 * Require specific permission - returns user info or error response
 */
export async function requirePermission(
  request: NextRequest,
  permission: PermissionCode
): Promise<AuthResponse> {
  const auth = await requireAuth(request)
  if (auth.error) return auth

  if (!auth.permissions.has(permission)) {
    return {
      error: NextResponse.json(
        { error: `Access denied. Required permission: ${permission}` },
        { status: 403 }
      ),
    }
  }

  return auth
}

/**
 * Require any of the specified permissions
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: PermissionCode[]
): Promise<AuthResponse> {
  const auth = await requireAuth(request)
  if (auth.error) return auth

  const hasAny = permissions.some(p => auth.permissions.has(p))
  if (!hasAny) {
    return {
      error: NextResponse.json(
        { error: `Access denied. Required one of: ${permissions.join(', ')}` },
        { status: 403 }
      ),
    }
  }

  return auth
}

/**
 * Require elevated access (operations or broker)
 */
export async function requireElevated(request: NextRequest): Promise<AuthResponse> {
  return requireRole(request, ['operations', 'broker'])
}

/**
 * Require admin access (operations, broker, or tc)
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResponse> {
  return requireRole(request, ['operations', 'broker', 'tc'])
}

/**
 * Require admin or support access (for routes where support can view)
 */
export async function requireAdminOrSupport(request: NextRequest): Promise<AuthResponse> {
  return requireRole(request, ['operations', 'broker', 'tc', 'support'])
}

/**
 * Helper to check if user can access a specific agent's data
 * Returns true if: user is the agent, OR user has can_view_all_agents permission
 */
export function canAccessAgent(auth: AuthResult, targetAgentId: string): boolean {
  if (auth.user.id === targetAgentId) return true
  if (auth.permissions.has('can_view_all_agents')) return true
  return false
}

/**
 * Helper to check if user can modify a specific agent's data
 * Returns true if: user has can_manage_agents permission
 */
export function canManageAgent(auth: AuthResult, targetAgentId: string): boolean {
  // Users can always update their own basic profile data
  if (auth.user.id === targetAgentId) return true
  // Otherwise need manage permission
  if (auth.permissions.has('can_manage_agents')) return true
  return false
}
