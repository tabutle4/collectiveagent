import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/vendors
 *
 * Returns all preferred vendors, ordered by vendor_type then display_order
 * so the admin UI groups them correctly (inspection, insurance, home_warranty, ...).
 *
 * Phase 1: read-only. CRUD modal with logo upload comes in Phase 1 completion.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('preferred_vendors')
      .select('*')
      .order('vendor_type', { ascending: true })
      .order('display_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ vendors: data || [] })
  } catch (error) {
    console.error('Get preferred vendors error:', error)
    return NextResponse.json({ error: 'Failed to fetch preferred vendors' }, { status: 500 })
  }
}
