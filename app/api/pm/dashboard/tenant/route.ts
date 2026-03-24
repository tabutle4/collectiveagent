import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Support both token-based (legacy) and user_id-based (session) lookups
    const token = request.nextUrl.searchParams.get('token')
    const userId = request.nextUrl.searchParams.get('user_id')
    
    let tenantId: string | null = null
    
    if (userId) {
      // Session-based: user_id is the tenant id
      tenantId = userId
    } else if (token) {
      // Token-based: look up by dashboard_token
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('dashboard_token', token)
        .single()
      
      if (!tenant) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
      }
      tenantId = tenant.id
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Fetch active lease with property info
    const { data: leases } = await supabase
      .from('pm_leases')
      .select(`
        *,
        managed_properties (
          id,
          property_address,
          unit,
          city,
          state,
          zip
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    const activeLease = leases?.[0]
    
    // Format lease for response
    const lease = activeLease ? {
      id: activeLease.id,
      property_address: activeLease.managed_properties?.property_address,
      unit: activeLease.managed_properties?.unit,
      city: activeLease.managed_properties?.city,
      state: activeLease.managed_properties?.state,
      zip: activeLease.managed_properties?.zip,
      monthly_rent: activeLease.monthly_rent,
      rent_due_day: activeLease.rent_due_day || 1,
      lease_start: activeLease.lease_start,
      lease_end: activeLease.lease_end,
      security_deposit: activeLease.security_deposit || 0
    } : null

    // Fetch all invoices for this tenant
    const { data: invoices } = await supabase
      .from('tenant_invoices')
      .select(`
        *,
        managed_properties (
          id,
          property_address
        )
      `)
      .eq('tenant_id', tenantId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })

    // Format invoices
    const formattedInvoices = (invoices || []).map(inv => ({
      id: inv.id,
      period_month: inv.period_month,
      period_year: inv.period_year,
      rent_amount: inv.rent_amount,
      late_fee: inv.late_fee || 0,
      other_charges: inv.other_charges || 0,
      total_amount: inv.total_amount,
      due_date: inv.due_date,
      status: inv.status,
      paid_at: inv.paid_at,
      paid_amount: inv.paid_amount,
      payment_url: inv.payload_payment_link_url,
      property_address: inv.managed_properties?.property_address
    }))

    // Calculate current balance (unpaid invoices)
    const currentBalance = formattedInvoices
      .filter(inv => !['paid', 'cancelled'].includes(inv.status))
      .reduce((sum, inv) => sum + inv.total_amount, 0)

    // Fetch repair requests for this tenant
    const { data: repairs } = await supabase
      .from('repair_requests')
      .select(`
        *,
        managed_properties (
          id,
          property_address
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        first_name: tenant.first_name,
        last_name: tenant.last_name,
        email: tenant.email,
        phone: tenant.phone
      },
      lease,
      invoices: formattedInvoices,
      repairs: repairs || [],
      currentBalance
    })
  } catch (error: any) {
    console.error('Error in PM tenant dashboard:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}