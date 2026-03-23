import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List all landlords
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    let query = supabase
      .from('landlords')
      .select(`
        *,
        managed_properties(id, property_address, city, status),
        pm_agreements(id, status, management_fee_pct)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ landlords: data || [] })
  } catch (error: any) {
    console.error('Error fetching landlords:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new landlord
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_landlords')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const { first_name, last_name, email, phone, mailing_address, mailing_city, mailing_state, mailing_zip, notes } = body

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      )
    }

    // Check for existing landlord with same email
    const { data: existing } = await supabase
      .from('landlords')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A landlord with this email already exists' },
        { status: 409 }
      )
    }

    const { data: landlord, error } = await supabase
      .from('landlords')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.replace(/\D/g, '') || null,
        mailing_address: mailing_address?.trim() || null,
        mailing_city: mailing_city?.trim() || null,
        mailing_state: mailing_state?.trim() || 'TX',
        mailing_zip: mailing_zip?.trim() || null,
        notes: notes?.trim() || null,
        status: 'onboarding',
      })
      .select()
      .single()

    if (error) throw error

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const dashboardUrl = `${appUrl}/pm/landlord/${landlord.dashboard_token}`

    return NextResponse.json({
      success: true,
      landlord,
      dashboard_url: dashboardUrl,
    })
  } catch (error: any) {
    console.error('Error creating landlord:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
