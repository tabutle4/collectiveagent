import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/templates
 *
 * Returns all TC email templates. Used by /admin/tc/templates page to
 * verify the seed worked and (later) by the template editor.
 *
 * Phase 1: read-only. POST/PATCH/DELETE come in Phase 1 completion with
 * the WYSIWYG editor.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('tc_email_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error) {
    console.error('Get TC templates error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC templates' }, { status: 500 })
  }
}
