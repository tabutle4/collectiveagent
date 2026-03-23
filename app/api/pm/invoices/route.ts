import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List invoices with filters
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const tenantId = searchParams.get('tenant_id')
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const leaseId = searchParams.get('lease_id')
    const periodYear = searchParams.get('period_year')
    const periodMonth = searchParams.get('period_month')

    let query = supabase
      .from('tenant_invoices')
      .select(`
        *,
        tenants(id, first_name, last_name, email),
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, city)
      `)
      .order('due_date', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }
    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }
    if (propertyId) {
      query = query.eq('property_id', propertyId)
    }
    if (leaseId) {
      query = query.eq('lease_id', leaseId)
    }
    if (periodYear) {
      query = query.eq('period_year', parseInt(periodYear))
    }
    if (periodMonth) {
      query = query.eq('period_month', parseInt(periodMonth))
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ invoices: data || [] })
  } catch (error: any) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create manual invoice (for one-off charges)
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      property_id, tenant_id, landlord_id, lease_id,
      period_month, period_year,
      rent_amount, other_charges, other_charges_description,
      due_date, notes,
    } = body

    if (!tenant_id || !landlord_id || !due_date) {
      return NextResponse.json(
        { error: 'Tenant, landlord, and due date are required' },
        { status: 400 }
      )
    }

    const totalAmount = (rent_amount || 0) + (other_charges || 0)

    const { data: invoice, error } = await supabase
      .from('tenant_invoices')
      .insert({
        property_id: property_id || null,
        tenant_id,
        landlord_id,
        lease_id: lease_id || null,
        period_month: period_month || new Date().getMonth() + 1,
        period_year: period_year || new Date().getFullYear(),
        rent_amount: rent_amount || 0,
        late_fee: 0,
        other_charges: other_charges || 0,
        other_charges_description: other_charges_description || null,
        total_amount: totalAmount,
        due_date,
        status: 'pending',
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, invoice })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
