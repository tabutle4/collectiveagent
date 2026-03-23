import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Tenant dashboard data by token (no auth required - magic link)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = createClient()

    // Fetch tenant by dashboard token
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, email, phone, status')
      .eq('dashboard_token', token)
      .single()

    if (error || !tenant) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    // Get active lease with property info
    const { data: leases } = await supabase
      .from('pm_leases')
      .select(`
        id, lease_start, lease_end, monthly_rent, rent_due_day, security_deposit, status,
        managed_properties(id, property_address, unit, city, state, zip)
      `)
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .order('lease_start', { ascending: false })
      .limit(1)

    const activeLease = leases?.[0] || null

    // Get all invoices for this tenant
    const { data: invoices } = await supabase
      .from('tenant_invoices')
      .select(`
        id, period_month, period_year, rent_amount, late_fee, other_charges,
        total_amount, due_date, status, paid_at, paid_amount,
        payload_payment_link_url,
        managed_properties(id, property_address)
      `)
      .eq('tenant_id', tenant.id)
      .order('due_date', { ascending: false })

    // Calculate current balance (sum of unpaid invoices)
    const currentBalance = (invoices || [])
      .filter((inv: any) => !['paid', 'cancelled'].includes(inv.status))
      .reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0)

    // Format lease for response
    const property = activeLease?.managed_properties as any
    const leaseInfo = activeLease
      ? {
          id: activeLease.id,
          property_address: property?.property_address || '',
          unit: property?.unit || '',
          city: property?.city || '',
          state: property?.state || '',
          zip: property?.zip || '',
          monthly_rent: activeLease.monthly_rent,
          rent_due_day: activeLease.rent_due_day,
          lease_start: activeLease.lease_start,
          lease_end: activeLease.lease_end,
          security_deposit: activeLease.security_deposit,
        }
      : null

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        first_name: tenant.first_name,
        last_name: tenant.last_name,
        email: tenant.email,
        phone: tenant.phone,
      },
      lease: leaseInfo,
      invoices: (invoices || []).map((inv: any) => ({
        id: inv.id,
        period_month: inv.period_month,
        period_year: inv.period_year,
        rent_amount: inv.rent_amount,
        late_fee: inv.late_fee,
        other_charges: inv.other_charges,
        total_amount: inv.total_amount,
        due_date: inv.due_date,
        status: inv.status,
        paid_at: inv.paid_at,
        paid_amount: inv.paid_amount,
        payment_url: inv.payload_payment_link_url,
        property_address: inv.managed_properties?.property_address || '',
      })),
      currentBalance,
    })
  } catch (error: any) {
    console.error('Error fetching tenant dashboard:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}