import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { isRepairCategory, repairCategoryLabel, repairCategoryTenantLabel } from '@/lib/pm/repairCategories'

// GET - List repair requests
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    const { searchParams } = request.nextUrl
    const landlordId = searchParams.get('landlord_id')
    const tenantId = searchParams.get('tenant_id')
    const propertyId = searchParams.get('property_id')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const filters: Array<{ type: 'eq'; column: string; value: any }> = []
    if (landlordId) filters.push({ type: 'eq', column: 'landlord_id', value: landlordId })
    if (tenantId) filters.push({ type: 'eq', column: 'tenant_id', value: tenantId })
    if (propertyId) filters.push({ type: 'eq', column: 'property_id', value: propertyId })
    if (status && status !== 'all') filters.push({ type: 'eq', column: 'status', value: status })

    // fetchAllRows, not a bare select: an unfiltered repairs list silently stops
    // at 1000 rows, and a truncated list reads as "no such repair" rather than
    // as an error.
    const repairs = await fetchAllRows<any>(
      'repair_requests',
      `
      *,
      managed_properties (
        id,
        property_address,
        unit,
        city,
        state
      ),
      tenants (
        id,
        first_name,
        last_name,
        email
      ),
      landlords (
        id,
        first_name,
        last_name
      )
    `,
      { orderBy: { column: 'created_at', ascending: false }, filters },
      supabase
    )

    // Filter by search if provided
    let filteredRepairs = repairs || []
    if (search) {
      const searchLower = search.toLowerCase()
      filteredRepairs = filteredRepairs.filter(r => 
        r.title?.toLowerCase().includes(searchLower) ||
        r.description?.toLowerCase().includes(searchLower) ||
        r.managed_properties?.property_address?.toLowerCase().includes(searchLower) ||
        r.category?.toLowerCase().includes(searchLower) ||
        repairCategoryLabel(r.category).toLowerCase().includes(searchLower) ||
        repairCategoryTenantLabel(r.category).toLowerCase().includes(searchLower)
      )
    }

    return NextResponse.json({ repairs: filteredRepairs })
  } catch (error: any) {
    console.error('Error fetching repair requests:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create repair request
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      property_id,
      tenant_id,
      landlord_id,
      lease_id,
      created_by_type = 'admin',
      created_by_admin_id,
      category,
      urgency = 'routine',
      title,
      description,
      photos = [],
      vendor_name,
      vendor_phone,
      vendor_email,
      estimated_cost,
      admin_notes
    } = body

    // Validate required fields
    if (!property_id) {
      return NextResponse.json({ error: 'Property is required' }, { status: 400 })
    }
    if (!landlord_id) {
      return NextResponse.json({ error: 'Landlord is required' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (!isRepairCategory(category)) {
      return NextResponse.json({ error: 'That category is not a valid repair category' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: repair, error } = await supabase
      .from('repair_requests')
      .insert({
        property_id,
        tenant_id: tenant_id || null,
        landlord_id,
        lease_id: lease_id || null,
        created_by_type,
        created_by_admin_id: created_by_admin_id || null,
        category,
        urgency,
        title,
        description: description || null,
        photos,
        status: 'submitted',
        vendor_name: vendor_name || null,
        vendor_phone: vendor_phone || null,
        vendor_email: vendor_email || null,
        estimated_cost: estimated_cost ? parseFloat(estimated_cost) : null,
        admin_notes: admin_notes || null,
        payment_status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating repair request:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ repair, success: true })
  } catch (error: any) {
    console.error('Error in repair request creation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}