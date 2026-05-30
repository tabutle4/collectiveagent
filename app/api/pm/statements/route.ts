import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/pm/statements
//
// Query params:
//   landlord_id (optional) - filter to one landlord
//   property_id (optional) - filter to one property
//   period_year (optional) - filter to one year
//
// Response: { statements: PMStatement[] }
//
// Used by:
//   - landlord page (list statements for that landlord)
//   - property page (list statements for that property)
//   - admin statements dashboard (no filters = all)

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const periodYear = searchParams.get('period_year')

    let query = supabaseAdmin
      .from('pm_statements')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, unit, city)
      `)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false, nullsFirst: false })

    if (landlordId) query = query.eq('landlord_id', landlordId)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (periodYear) query = query.eq('period_year', parseInt(periodYear, 10))

    const { data, error } = await query

    if (error) {
      console.error('List statements error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ statements: data || [] })
  } catch (err: any) {
    console.error('List statements error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
