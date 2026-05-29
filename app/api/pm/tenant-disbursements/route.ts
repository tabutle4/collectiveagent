import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List tenant disbursements with optional filters
//
// Query params:
//   landlord_id (optional) - filter by landlord
//   property_id (optional) - filter by property
//   tenant_id (optional) - filter by tenant
//   status (optional) - filter by payment_status
//   period_year, period_month (optional) - filter by period
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const tenantId = searchParams.get('tenant_id')
    const status = searchParams.get('status')
    const periodYear = searchParams.get('period_year')
    const periodMonth = searchParams.get('period_month')

    let query = supabase
      .from('tenant_disbursements')
      .select(`
        *,
        tenants(id, first_name, last_name, email),
        landlords(id, first_name, last_name),
        managed_properties(id, property_address, unit, city)
      `)
      .order('created_at', { ascending: false })

    if (landlordId) query = query.eq('landlord_id', landlordId)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (status && status !== 'all') query = query.eq('payment_status', status)
    if (periodYear) query = query.eq('period_year', parseInt(periodYear))
    if (periodMonth) query = query.eq('period_month', parseInt(periodMonth))

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ tenant_disbursements: data || [] })
  } catch (error: any) {
    console.error('Error fetching tenant disbursements:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create a tenant disbursement (typically a security deposit
// refund). Reduces the held-in-trust balance for the property.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      tenant_id,
      landlord_id,
      property_id,
      amount,
      period_month,
      period_year,
      payment_status,
      payment_date,
      notes,
    } = body

    if (!tenant_id || !landlord_id || !property_id || amount == null || !period_month || !period_year) {
      return NextResponse.json(
        { error: 'tenant_id, landlord_id, property_id, amount, period_month, period_year are required' },
        { status: 400 }
      )
    }
    if (Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      )
    }

    const { data: disbursement, error } = await supabase
      .from('tenant_disbursements')
      .insert({
        tenant_id,
        landlord_id,
        property_id,
        amount: Number(amount),
        period_month: Number(period_month),
        period_year: Number(period_year),
        payment_status: payment_status || 'pending',
        payment_date: payment_date || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, tenant_disbursement: disbursement })
  } catch (error: any) {
    console.error('Error creating tenant disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
