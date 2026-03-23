import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single property with related data
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: property, error } = await supabase
      .from('managed_properties')
      .select(`
        *,
        landlords(id, first_name, last_name, email, phone),
        pm_agreements(id, commencement_date, expiration_date, management_fee_pct, status),
        pm_leases(
          id, tenant_id, lease_start, lease_end, monthly_rent, rent_due_day, status,
          tenants(id, first_name, last_name, email, phone)
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    return NextResponse.json({ property })
  } catch (error: any) {
    console.error('Error fetching property:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update property
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_properties')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'pm_agreement_id',
      'property_address', 'unit', 'city', 'state', 'zip', 'county',
      'unit_count', 'property_type', 'bedrooms', 'bathrooms', 'square_feet', 'year_built',
      'hoa_name', 'hoa_contact', 'hoa_phone', 'hoa_email',
      'status', 'notes',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'hoa_phone' && updates[key]) {
          filteredUpdates[key] = updates[key].replace(/\D/g, '')
        } else if (key === 'hoa_email' && updates[key]) {
          filteredUpdates[key] = updates[key].toLowerCase().trim()
        } else {
          filteredUpdates[key] = updates[key]
        }
      }
    }

    const { error } = await supabase
      .from('managed_properties')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating property:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete property (only if no active leases)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_properties')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    // Check for active leases
    const { data: leases } = await supabase
      .from('pm_leases')
      .select('id')
      .eq('property_id', resolvedParams.id)
      .eq('status', 'active')
      .limit(1)

    if (leases && leases.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete property with active leases' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('managed_properties')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting property:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
