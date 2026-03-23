import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List all managed properties
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const landlordId = searchParams.get('landlord_id')
    const search = searchParams.get('search')

    let query = supabase
      .from('managed_properties')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        pm_agreements(id, management_fee_pct, status),
        pm_leases(
          id, tenant_id, lease_start, lease_end, monthly_rent, status,
          tenants(id, first_name, last_name, email)
        )
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }

    if (search) {
      query = query.or(
        `property_address.ilike.%${search}%,city.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ properties: data || [] })
  } catch (error: any) {
    console.error('Error fetching properties:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new property
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_properties')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      landlord_id, pm_agreement_id,
      property_address, unit, city, state, zip, county,
      unit_count, property_type, bedrooms, bathrooms, square_feet, year_built,
      hoa_name, hoa_contact, hoa_phone, hoa_email,
      notes,
    } = body

    if (!landlord_id || !property_address || !city) {
      return NextResponse.json(
        { error: 'Landlord, property address, and city are required' },
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

    const { data: property, error } = await supabase
      .from('managed_properties')
      .insert({
        landlord_id,
        pm_agreement_id: pm_agreement_id || null,
        property_address: property_address.trim(),
        unit: unit?.trim() || null,
        city: city.trim(),
        state: state?.trim() || 'TX',
        zip: zip?.trim() || null,
        county: county?.trim() || null,
        unit_count: unit_count || 1,
        property_type: property_type?.trim() || null,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        square_feet: square_feet || null,
        year_built: year_built || null,
        hoa_name: hoa_name?.trim() || null,
        hoa_contact: hoa_contact?.trim() || null,
        hoa_phone: hoa_phone?.replace(/\D/g, '') || null,
        hoa_email: hoa_email?.toLowerCase().trim() || null,
        notes: notes?.trim() || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, property })
  } catch (error: any) {
    console.error('Error creating property:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
