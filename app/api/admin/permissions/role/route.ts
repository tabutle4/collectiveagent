import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST - Toggle a single role permission.
// Body: { roleId: string, permissionId: string, granted: boolean }
// granted true  -> ensure a role_permissions row exists
// granted false -> remove the role_permissions row
// Gated by can_manage_roles.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_roles')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { roleId, permissionId, granted } = body || {}

    if (!roleId || !permissionId || typeof granted !== 'boolean') {
      return NextResponse.json(
        { error: 'roleId, permissionId, and granted (boolean) are required' },
        { status: 400 }
      )
    }

    if (granted) {
      // Insert only if it does not already exist (avoids duplicates)
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('role_permissions')
        .select('id')
        .eq('role_id', roleId)
        .eq('permission_id', permissionId)
        .maybeSingle()

      if (existingError) throw existingError

      if (!existing) {
        const { error: insertError } = await supabaseAdmin
          .from('role_permissions')
          .insert({ id: randomUUID(), role_id: roleId, permission_id: permissionId })

        if (insertError) throw insertError
      }
    } else {
      const { error: deleteError } = await supabaseAdmin
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId)

      if (deleteError) throw deleteError
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Role permission POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
