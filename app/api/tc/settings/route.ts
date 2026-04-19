import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/settings
 *
 * Returns the singleton tc_settings row. A unique index on (true) in
 * 01_schema.sql guarantees at most one row. Uses .maybeSingle() so the
 * response is gracefully null if the seed has not yet been run.
 *
 * Phase 1: read-only. Full form with save, banner upload, and WYSIWYG
 * signature editor comes in Phase 1 completion.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase.from('tc_settings').select('*').maybeSingle()

    if (error) throw error

    return NextResponse.json({ settings: data || null })
  } catch (error) {
    console.error('Get TC settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC settings' }, { status: 500 })
  }
}
