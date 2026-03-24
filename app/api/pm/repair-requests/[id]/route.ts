import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Single repair request
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  const supabase = createClient()
  const { id } = params

  const { data: repair, error } = await supabase
    .from('repair_requests')
    .select(`
      *,
      managed_properties (
        id,
        property_address,
        unit,
        city,
        state,
        zip
      ),
      tenants (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      landlords (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      pm_leases (
        id,
        lease_start,
        lease_end,
        monthly_rent
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching repair request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!repair) {
    return NextResponse.json({ error: 'Repair request not found' }, { status: 404 })
  }

  return NextResponse.json({ repair })
}

// PATCH - Update repair request
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id } = params
    const body = await request.json()

    const allowedFields = [
      'category',
      'urgency',
      'title',
      'description',
      'photos',
      'status',
      'vendor_name',
      'vendor_phone',
      'vendor_email',
      'estimated_cost',
      'actual_cost',
      'invoice_url',
      'payment_status',
      'payment_date',
      'deducted_from_disbursement_id',
      'completed_at',
      'admin_notes'
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Handle numeric fields
    if (updates.estimated_cost !== undefined && updates.estimated_cost !== null) {
      updates.estimated_cost = parseFloat(updates.estimated_cost)
    }
    if (updates.actual_cost !== undefined && updates.actual_cost !== null) {
      updates.actual_cost = parseFloat(updates.actual_cost)
    }

    // Auto-set completed_at when status changes to completed
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    updates.updated_at = new Date().toISOString()

    const { data: repair, error } = await supabase
      .from('repair_requests')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        managed_properties (
          id,
          property_address,
          unit,
          city,
          state
        ),
        tenants (
          id,
          first_name,
          last_name,
          email
        ),
        landlords (
          id,
          first_name,
          last_name
        )
      `)
      .single()

    if (error) {
      console.error('Error updating repair request:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If marking as deducted from disbursement, create ledger entry
    if (updates.payment_status === 'deducted_from_rent' && updates.actual_cost) {
      await supabase
        .from('pm_ledger')
        .insert({
          landlord_id: repair.landlord_id,
          property_id: repair.property_id,
          entry_type: 'repair_expense',
          description: `Repair: ${repair.title}`,
          amount: -Math.abs(parseFloat(updates.actual_cost)),
          reference_type: 'repair_request',
          reference_id: id
        })
    }

    return NextResponse.json({ repair, success: true })
  } catch (error: any) {
    console.error('Error in repair request update:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete repair request
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  const supabase = createClient()
  const { id } = params

  const { error } = await supabase
    .from('repair_requests')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting repair request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}