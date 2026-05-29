import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List all tenants
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const propertyId = searchParams.get('property_id')

    // If filtering by property, first find which tenants have leases there.
    // The tenants table has no direct property_id column - the relationship
    // is through pm_leases (a tenant may have had leases at multiple
    // properties over time).
    let tenantIdsAtProperty: string[] | null = null
    if (propertyId) {
      const { data: leasesAtProperty } = await supabase
        .from('pm_leases')
        .select('tenant_id')
        .eq('property_id', propertyId)
      tenantIdsAtProperty = (leasesAtProperty || []).map((l: any) => l.tenant_id)
      // No tenants at this property - short-circuit
      if (tenantIdsAtProperty.length === 0) {
        return NextResponse.json({ tenants: [] })
      }
    }

    let query = supabase
      .from('tenants')
      .select(`
        *,
        pm_leases(
          id, property_id, lease_start, lease_end, monthly_rent, status,
          managed_properties(id, property_address, city)
        )
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (tenantIdsAtProperty) {
      query = query.in('id', tenantIdsAtProperty)
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ tenants: data || [] })
  } catch (error: any) {
    console.error('Error fetching tenants:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new tenant
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_tenants')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const { first_name, last_name, email, phone, notes } = body

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      )
    }

    // Check for existing tenant with same email
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A tenant with this email already exists' },
        { status: 409 }
      )
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.replace(/\D/g, '') || null,
        notes: notes?.trim() || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const dashboardUrl = `${appUrl}/pm/tenant/${tenant.dashboard_token}`

    return NextResponse.json({
      success: true,
      tenant,
      dashboard_url: dashboardUrl,
    })
  } catch (error: any) {
    console.error('Error creating tenant:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
