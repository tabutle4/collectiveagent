import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/templates/[id]
 *
 * Returns a single TC email template by id, including the full body.
 * Called by the process-steps page preview modal so that list loads
 * stay lightweight and the full body is only fetched when needed.
 *
 * Phase 1: read-only. PATCH/DELETE come in Phase 1 completion.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    // Next.js 15+ may pass params as a Promise; handle both forms.
    const resolvedParams = params instanceof Promise ? await params : params
    const id = resolvedParams?.id

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tc_email_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    console.error('Get TC template error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC template' }, { status: 500 })
  }
}
