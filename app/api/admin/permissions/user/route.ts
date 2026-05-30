import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST - Set a single user permission override.
// Body: { userId: string, permissionId: string, value: 'inherit' | 'grant' | 'revoke' }
// inherit -> remove the override row (user falls back to their role default)
// grant   -> override row with granted = true
// revoke  -> override row with granted = false
// Gated by can_manage_roles.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_roles')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { userId, permissionId, value } = body || {}

    if (!userId || !permissionId || !['inherit', 'grant', 'revoke'].includes(value)) {
      return NextResponse.json(
        { error: "userId, permissionId, and value ('inherit' | 'grant' | 'revoke') are required" },
        { status: 400 }
      )
    }

    // Clear any existing override first so we never leave a stale row.
    const { error: deleteError } = await supabaseAdmin
      .from('user_permission_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('permission_id', permissionId)

    if (deleteError) throw deleteError

    if (value !== 'inherit') {
      const { error: insertError } = await supabaseAdmin
        .from('user_permission_overrides')
        .insert({
          id: randomUUID(),
          user_id: userId,
          permission_id: permissionId,
          granted: value === 'grant',
        })

      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('User override POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
