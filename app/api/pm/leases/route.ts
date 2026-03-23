import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List all leases
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const propertyId = searchParams.get('property_id')
    const landlordId = searchParams.get('landlord_id')
    const tenantId = searchParams.get('tenant_id')

    let query = supabase
      .from('pm_leases')
      .select(`
        *,
        managed_properties(id, property_address, city, unit_count),
        tenants(id, first_name, last_name, email),
        landlords(id, first_name, last_name, email)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (propertyId) {
      query = query.eq('property_id', propertyId)
    }
    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ leases: data || [] })
  } catch (error: any) {
    console.error('Error fetching leases:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new lease AND generate all invoices for the term
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_leases')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      property_id, tenant_id, landlord_id,
      lease_start, lease_end, move_in_date,
      monthly_rent, rent_due_day,
      security_deposit,
      late_fee_grace_days, late_fee_initial, late_fee_daily, late_fee_max_days,
      returned_payment_fee, lease_pdf_url, notes,
      source_transaction_id,
    } = body

    if (!property_id || !tenant_id || !landlord_id || !lease_start || !lease_end || !monthly_rent) {
      return NextResponse.json(
        { error: 'Property, tenant, landlord, lease dates, and monthly rent are required' },
        { status: 400 }
      )
    }

    // Verify property exists and get unit_count for late fee cap
    const { data: property } = await supabase
      .from('managed_properties')
      .select('id, landlord_id, unit_count')
      .eq('id', property_id)
      .single()

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Verify property belongs to this landlord
    if (property.landlord_id !== landlord_id) {
      return NextResponse.json(
        { error: 'Property does not belong to this landlord' },
        { status: 400 }
      )
    }

    // Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenant_id)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Determine late fee cap based on unit count (Texas Property Code §92.019)
    // 12% for 1-4 units, 10% for 5+ units
    const unitCount = property.unit_count || 1
    const late_fee_cap_pct = unitCount <= 4 ? 12 : 10

    // Create lease
    const { data: lease, error: leaseError } = await supabase
      .from('pm_leases')
      .insert({
        property_id,
        tenant_id,
        landlord_id,
        lease_start,
        lease_end,
        move_in_date: move_in_date || lease_start,
        monthly_rent,
        rent_due_day: rent_due_day || 1,
        security_deposit: security_deposit || 0,
        late_fee_grace_days: late_fee_grace_days ?? 2,
        late_fee_initial: late_fee_initial || null,
        late_fee_daily: late_fee_daily || null,
        late_fee_max_days: late_fee_max_days || null,
        late_fee_cap_pct,
        returned_payment_fee: returned_payment_fee ?? 150,
        lease_pdf_url: lease_pdf_url || null,
        notes: notes?.trim() || null,
        source_transaction_id: source_transaction_id || null,
        status: 'active',
      })
      .select()
      .single()

    if (leaseError) throw leaseError

    // Generate all invoices for the lease term
    const invoices: any[] = []
    const startDate = new Date(lease_start)
    const endDate = new Date(lease_end)
    const dueDayNum = rent_due_day || 1

    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1)

    while (current <= endDate) {
      const periodMonth = current.getMonth() + 1
      const periodYear = current.getFullYear()

      // Due date is the rent_due_day of this month
      const dueDate = new Date(periodYear, periodMonth - 1, dueDayNum)

      invoices.push({
        property_id,
        tenant_id,
        landlord_id,
        lease_id: lease.id,
        period_month: periodMonth,
        period_year: periodYear,
        rent_amount: monthly_rent,
        late_fee: 0,
        other_charges: 0,
        total_amount: monthly_rent,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending',
      })

      // Move to next month
      current.setMonth(current.getMonth() + 1)
    }

    // Insert all invoices
    if (invoices.length > 0) {
      const { error: invoiceError } = await supabase
        .from('tenant_invoices')
        .insert(invoices)

      if (invoiceError) {
        console.error('Error creating invoices:', invoiceError)
        // Don't fail the whole request, but log it
      }
    }

    return NextResponse.json({
      success: true,
      lease,
      invoices_created: invoices.length,
    })
  } catch (error: any) {
    console.error('Error creating lease:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
