import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single invoice
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: invoice, error } = await supabase
      .from('tenant_invoices')
      .select(`
        *,
        tenants(id, first_name, last_name, email, phone),
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, city),
        pm_leases(id, monthly_rent, lease_start, lease_end)
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update invoice
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    // Get current invoice to check status
    const { data: currentInvoice } = await supabase
      .from('tenant_invoices')
      .select('status')
      .eq('id', resolvedParams.id)
      .single()

    if (!currentInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Don't allow editing paid invoices (except notes/status)
    const allowedFields = currentInvoice.status === 'paid'
      ? ['notes', 'status']
      : [
          'rent_amount', 'late_fee', 'other_charges', 'other_charges_description',
          'total_amount', 'due_date', 'status', 'notes',
          'paid_at', 'paid_amount', 'payment_method',
        ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    // Recalculate total if amounts changed
    if (updates.rent_amount !== undefined || updates.late_fee !== undefined || updates.other_charges !== undefined) {
      const { data: inv } = await supabase
        .from('tenant_invoices')
        .select('rent_amount, late_fee, other_charges')
        .eq('id', resolvedParams.id)
        .single()

      if (inv) {
        const rentAmt = updates.rent_amount ?? inv.rent_amount
        const lateFee = updates.late_fee ?? inv.late_fee
        const otherCharges = updates.other_charges ?? inv.other_charges
        filteredUpdates.total_amount = rentAmt + lateFee + otherCharges
      }
    }

    const { error } = await supabase
      .from('tenant_invoices')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
