import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List all PM agreements
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const landlordId = searchParams.get('landlord_id')

    let query = supabase
      .from('pm_agreements')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, city, status)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ agreements: data || [] })
  } catch (error: any) {
    console.error('Error fetching PM agreements:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new PM agreement
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      landlord_id, commencement_date, expiration_date, auto_renews,
      management_fee_pct, management_fee_minimum,
      leasing_fee_pct, leasing_fee_flat,
      renewal_fee_pct, renewal_fee_flat,
      maintenance_coord_fee_pct, eviction_fee,
      repair_limit_without_approval, reserve_per_unit,
      lease_term_min_months, lease_term_max_months,
      coop_broker_fee_pct, agreement_pdf_url, notes,
    } = body

    if (!landlord_id || !commencement_date) {
      return NextResponse.json(
        { error: 'Landlord and commencement date are required' },
        { status: 400 }
      )
    }

    // Verify landlord exists
    const { data: landlord } = await supabase
      .from('landlords')
      .select('id')
      .eq('id', landlord_id)
      .single()

    if (!landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    const { data: agreement, error } = await supabase
      .from('pm_agreements')
      .insert({
        landlord_id,
        commencement_date,
        expiration_date: expiration_date || null,
        auto_renews: auto_renews ?? true,
        management_fee_pct: management_fee_pct ?? 10,
        management_fee_minimum: management_fee_minimum || null,
        leasing_fee_pct: leasing_fee_pct ?? 75,
        leasing_fee_flat: leasing_fee_flat || null,
        renewal_fee_pct: renewal_fee_pct || null,
        renewal_fee_flat: renewal_fee_flat ?? 150,
        maintenance_coord_fee_pct: maintenance_coord_fee_pct || null,
        eviction_fee: eviction_fee ?? 350,
        repair_limit_without_approval: repair_limit_without_approval ?? 250,
        reserve_per_unit: reserve_per_unit ?? 500,
        lease_term_min_months: lease_term_min_months ?? 12,
        lease_term_max_months: lease_term_max_months ?? 24,
        coop_broker_fee_pct: coop_broker_fee_pct ?? 40,
        agreement_pdf_url: agreement_pdf_url || null,
        notes: notes?.trim() || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, agreement })
  } catch (error: any) {
    console.error('Error creating PM agreement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
