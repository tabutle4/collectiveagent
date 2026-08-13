import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single tenant with related data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select(`
        *,
        pm_leases(
          id, property_id, landlord_id, lease_start, lease_end, monthly_rent, status,
          managed_properties(id, property_address, city, landlord_id)
        ),
        tenant_invoices(
          id, period_month, period_year, total_amount, status, due_date, paid_at
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // The tenant page expects leases and invoices at the top level
    // (setLeases(data.leases), setInvoices(data.invoices)), but the Supabase
    // join nests them under tenant.pm_leases and tenant.tenant_invoices.
    // Surface them as siblings so the page renders rather than always
    // showing zero rows. Most recent invoices first.
    const leases = (tenant as any).pm_leases || []
    const invoices = ((tenant as any).tenant_invoices || []).slice().sort(
      (a: any, b: any) => {
        if (a.period_year !== b.period_year) return b.period_year - a.period_year
        return b.period_month - a.period_month
      }
    )

    return NextResponse.json({ tenant, leases, invoices })
  } catch (error: any) {
    console.error('Error fetching tenant:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update tenant
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_tenants')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone',
      'status', 'notes', 'payload_customer_id',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
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
      .from('tenants')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating tenant:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete tenant (only if no active leases)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_tenants')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()

    // Check for active leases
    const { data: leases } = await supabase
      .from('pm_leases')
      .select('id')
      .eq('tenant_id', resolvedParams.id)
      .eq('status', 'active')
      .limit(1)

    if (leases && leases.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete tenant with active leases' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting tenant:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
