import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET — lightweight list of active commission plans for the plan dropdown on
// agent commission cards. Any authenticated user may read plan names.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The column is is_active. There is no `active` column on
    // commission_plans, so selecting it made PostgREST reject the query and
    // this route 500 on every call - the plan dropdown on agent commission
    // cards came back empty.
    const { data, error } = await supabaseAdmin
      .from('commission_plans')
      .select('id, code, name, is_active')
      .order('name')

    if (error) throw error

    const plans = (data || [])
      .filter((p: any) => p.is_active !== false)
      .map((p: any) => ({
        id: p.id,
        plan_code: p.code,
        plan_name: p.name,
      }))

    return NextResponse.json({ plans })
  } catch (error: any) {
    console.error('commission-plans GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load plans' },
      { status: 500 }
    )
  }
}
