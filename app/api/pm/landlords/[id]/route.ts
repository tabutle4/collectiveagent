import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single landlord with all related data
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: landlord, error } = await supabase
      .from('landlords')
      .select(`
        *,
        managed_properties(
          id, property_address, unit, city, state, zip, unit_count, status,
          pm_leases(id, tenant_id, lease_start, lease_end, monthly_rent, status)
        ),
        pm_agreements(id, commencement_date, expiration_date, management_fee_pct, status),
        landlord_disbursements(
          id, gross_rent, management_fee, net_amount, payment_status, payment_date, period_month, period_year
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    return NextResponse.json({ landlord })
  } catch (error: any) {
    console.error('Error fetching landlord:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update landlord
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_landlords')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    // Allowed fields for update
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone',
      'mailing_address', 'mailing_city', 'mailing_state', 'mailing_zip',
      'status', 'notes',
      'w9_status', 'w9_tin_match_status', 'w9_signed_at', 'w9_pdf_url',
      'bank_status', 'bank_connected_at',
      'payload_payee_id', 'payload_payment_method_id', 'payload_activation_id',
      'track1099_reference_id', 'track1099_form_request_id',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        // Sanitize phone
        if (key === 'phone' && updates[key]) {
          filteredUpdates[key] = updates[key].replace(/\D/g, '')
        } else if (key === 'email' && updates[key]) {
          filteredUpdates[key] = updates[key].toLowerCase().trim()
        } else {
          filteredUpdates[key] = updates[key]
        }
      }
    }

    const { error } = await supabase
      .from('landlords')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating landlord:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete landlord (only if no properties/leases)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_landlords')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    // Check for active properties
    const { data: properties } = await supabase
      .from('managed_properties')
      .select('id')
      .eq('landlord_id', resolvedParams.id)
      .eq('status', 'active')
      .limit(1)

    if (properties && properties.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete landlord with active properties' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('landlords')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting landlord:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
