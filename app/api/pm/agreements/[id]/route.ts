import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single agreement
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: agreement, error } = await supabase
      .from('pm_agreements')
      .select(`
        *,
        landlords(id, first_name, last_name, email, phone),
        managed_properties(id, property_address, city, status)
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    return NextResponse.json({ agreement })
  } catch (error: any) {
    console.error('Error fetching agreement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update agreement
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'commencement_date', 'expiration_date', 'auto_renews',
      'management_fee_pct', 'management_fee_minimum',
      'leasing_fee_pct', 'leasing_fee_flat',
      'renewal_fee_pct', 'renewal_fee_flat',
      'maintenance_coord_fee_pct', 'eviction_fee',
      'repair_limit_without_approval', 'reserve_per_unit',
      'lease_term_min_months', 'lease_term_max_months',
      'coop_broker_fee_pct', 'agreement_pdf_url',
      'status', 'notes',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { error } = await supabase
      .from('pm_agreements')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating agreement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete agreement (only if no properties linked)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    // Check for linked properties
    const { data: properties } = await supabase
      .from('managed_properties')
      .select('id')
      .eq('pm_agreement_id', resolvedParams.id)
      .limit(1)

    if (properties && properties.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete agreement with linked properties. Unlink properties first.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('pm_agreements')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting agreement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
