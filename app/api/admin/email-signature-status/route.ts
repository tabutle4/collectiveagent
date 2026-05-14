import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/admin/email-signature-status
 *
 * Returns a list of active agents with their email signature completion
 * status. Used by the admin tracking page to see who has and hasn't
 * updated their signature using the new in-app generator.
 *
 * Permission: can_view_all_agents (same gate as the existing roster page)
 *
 * Filters:
 *   - status: 'all' (default) | 'completed' | 'not_yet'
 *   - office: 'all' (default) | 'Houston' | 'DFW'
 *
 * Returns: { users: [...], stats: { total, completed, not_yet, percent_done } }
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_agents')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'
    const office = searchParams.get('office') || 'all'

    // Only show active, licensed agents who would actually use a signature
    let query = supabaseAdmin
      .from('users')
      .select(
        'id, email, preferred_first_name, preferred_last_name, first_name, last_name, office, role, is_licensed_agent, new_signature_completed_at, status'
      )
      .eq('is_active', true)
      .eq('status', 'active')

    if (office !== 'all') {
      query = query.eq('office', office)
    }

    if (status === 'completed') {
      query = query.not('new_signature_completed_at', 'is', null)
    } else if (status === 'not_yet') {
      query = query.is('new_signature_completed_at', null)
    }

    const { data: users, error } = await query.order('preferred_first_name', { ascending: true })

    if (error) {
      console.error('email-signature-status GET error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Compute summary stats across the ENTIRE eligible roster (ignoring filters)
    // so the banner always reflects overall progress.
    const { data: allUsers, error: allError } = await supabaseAdmin
      .from('users')
      .select('new_signature_completed_at')
      .eq('is_active', true)
      .eq('status', 'active')

    if (allError) {
      console.error('email-signature-status stats error:', allError)
      return NextResponse.json({ error: allError.message }, { status: 500 })
    }

    const total = (allUsers || []).length
    const completed = (allUsers || []).filter((u: any) => u.new_signature_completed_at).length
    const not_yet = total - completed
    const percent_done = total > 0 ? Math.round((completed / total) * 100) : 0

    return NextResponse.json({
      users: users || [],
      stats: { total, completed, not_yet, percent_done },
    })
  } catch (err: any) {
    console.error('email-signature-status GET exception:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
