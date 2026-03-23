import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single lease with related data
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: lease, error } = await supabase
      .from('pm_leases')
      .select(`
        *,
        managed_properties(id, property_address, city, unit_count, landlord_id),
        tenants(id, first_name, last_name, email, phone),
        landlords(id, first_name, last_name, email, phone),
        tenant_invoices(
          id, period_month, period_year, rent_amount, late_fee, total_amount, 
          due_date, status, paid_at, paid_amount
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 })
    }

    return NextResponse.json({ lease })
  } catch (error: any) {
    console.error('Error fetching lease:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update lease
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_leases')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'lease_start', 'lease_end', 'move_in_date',
      'monthly_rent', 'rent_due_day', 'security_deposit',
      'late_fee_grace_days', 'late_fee_initial', 'late_fee_daily', 
      'late_fee_max_days', 'late_fee_cap_pct',
      'returned_payment_fee', 'lease_pdf_url',
      'status', 'notes',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { error } = await supabase
      .from('pm_leases')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating lease:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete lease (only if no paid invoices)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_leases')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    // Check for paid invoices
    const { data: paidInvoices } = await supabase
      .from('tenant_invoices')
      .select('id')
      .eq('lease_id', resolvedParams.id)
      .eq('status', 'paid')
      .limit(1)

    if (paidInvoices && paidInvoices.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete lease with paid invoices' },
        { status: 400 }
      )
    }

    // Delete unpaid invoices first
    await supabase
      .from('tenant_invoices')
      .delete()
      .eq('lease_id', resolvedParams.id)
      .neq('status', 'paid')

    // Delete the lease
    const { error } = await supabase
      .from('pm_leases')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting lease:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
