import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/templates
 *
 * Returns all TC email templates. Ordered by transaction_type, then
 * category, then name, so the admin page can group them by transaction
 * type matching the Preferred Vendors page pattern.
 *
 * Phase 1: read-only. POST/PATCH/DELETE come in Phase 1 completion.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('tc_email_templates')
      .select('*')
      .order('transaction_type', { ascending: true })
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error) {
    console.error('Get TC templates error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC templates' }, { status: 500 })
  }
}
