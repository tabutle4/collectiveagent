import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/process-steps
 *
 * Returns all TC process steps joined with the minimal template info
 * needed by the admin UI (id, slug, name). Full template body is NOT
 * included here to keep the payload small. Fetch it lazily via
 * /api/tc/templates/[id] when the user opens a template preview.
 *
 * Steps are ordered by transaction_type then step_order so the admin UI
 * can group and display them in execution order.
 *
 * Phase 1: read-only. Full editor with drag-to-reorder, anchor/offset
 * editing, template picker, and conditional flag toggles comes in
 * Phase 1 completion.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('tc_process_steps')
      .select('*, template:tc_email_templates(id, slug, name)')
      .order('transaction_type', { ascending: true })
      .order('step_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ steps: data || [] })
  } catch (error) {
    console.error('Get TC process steps error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC process steps' }, { status: 500 })
  }
}
