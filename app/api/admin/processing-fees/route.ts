import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET — list all processing fee types (active and inactive)
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'can_manage_company_settings')
    if ('error' in auth) {
      const fallback = await requirePermission(request, 'can_manage_agents')
      if ('error' in fallback) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { data, error } = await supabase
      .from('processing_fee_types')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ processing_fees: data || [] })
  } catch (err: any) {
    console.error('Processing fees GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

// POST — update a single row by id, with allowlist of editable columns
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'can_manage_company_settings')
    if ('error' in auth) {
      const fallback = await requirePermission(request, 'can_manage_agents')
      if ('error' in fallback) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { id, updates } = body
    if (!id || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'id and updates required' }, { status: 400 })
    }

    // Allowlist — admin can edit these
    const allowed = [
      'name', 'code', 'processing_fee', 'is_lease', 'is_active',
      'display_order', 'counts_toward_cap', 'counts_toward_upgrade', 'fee_type',
    ]
    const cleaned: Record<string, any> = {}
    for (const k of allowed) {
      if (k in updates) cleaned[k] = updates[k]
    }
    if (Object.keys(cleaned).length === 0) {
      return NextResponse.json({ error: 'no editable fields in updates' }, { status: 400 })
    }
    cleaned.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('processing_fee_types')
      .update(cleaned)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ processing_fee: data })
  } catch (err: any) {
    console.error('Processing fees POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
