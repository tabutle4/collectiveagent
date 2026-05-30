import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET - Returns everything the permissions manager needs:
// roles, permissions, the role -> permission map, per-user overrides, and
// a light user list. Gated by can_manage_roles.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_roles')
  if (auth.error) return auth.error

  try {
    // Active roles only (agent, tc, operations, broker, support)
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('roles')
      .select('id, name, display_name, description, is_active')
      .eq('is_active', true)
      .order('display_name', { ascending: true })

    if (rolesError) throw rolesError

    // All permissions
    const { data: permissions, error: permsError } = await supabaseAdmin
      .from('permissions')
      .select('id, code, display_name, category, description')
      .order('category', { ascending: true })
      .order('display_name', { ascending: true })

    if (permsError) throw permsError

    // Role -> permission links (batched to be safe against the 1000 row limit)
    const rolePermissions = await fetchAllRows<{ role_id: string; permission_id: string }>(
      'role_permissions',
      'role_id, permission_id'
    )

    // Per-user overrides
    const userOverrides = await fetchAllRows<{
      user_id: string
      permission_id: string
      granted: boolean
    }>('user_permission_overrides', 'user_id, permission_id, granted')

    // Light user list (active accounts only) for the overrides tab
    const users = await fetchAllRows<{
      id: string
      email: string
      first_name: string
      last_name: string
      preferred_first_name: string | null
      preferred_last_name: string | null
      role: string
      is_active: boolean
      status: string
    }>(
      'users',
      'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, is_active, status',
      {
        filters: [{ type: 'eq', column: 'is_active', value: true }],
        orderBy: { column: 'first_name', ascending: true },
      }
    )

    return NextResponse.json({
      roles: roles || [],
      permissions: permissions || [],
      rolePermissions,
      userOverrides,
      users,
    })
  } catch (err: any) {
    console.error('Permissions GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
