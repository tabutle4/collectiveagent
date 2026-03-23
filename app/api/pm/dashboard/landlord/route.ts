import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Landlord dashboard data by token (no auth required - magic link)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = createClient()

    // Fetch landlord by dashboard token
    const { data: landlord, error } = await supabase
      .from('landlords')
      .select(`
        id, first_name, last_name, email, phone,
        mailing_address, mailing_city, mailing_state, mailing_zip,
        w9_status, bank_status, status,
        managed_properties(
          id, property_address, unit, city, state, zip, status,
          pm_leases(
            id, lease_start, lease_end, monthly_rent, status,
            tenants(id, first_name, last_name, email)
          )
        ),
        pm_agreements(
          id, management_fee_pct, commencement_date, expiration_date, status
        )
      `)
      .eq('dashboard_token', token)
      .single()

    if (error || !landlord) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    // Get pending disbursements
    const { data: pendingDisbursements } = await supabase
      .from('landlord_disbursements')
      .select(`
        id, gross_rent, management_fee, net_amount, period_month, period_year, payment_status,
        managed_properties(id, property_address, city)
      `)
      .eq('landlord_id', landlord.id)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })

    // Get recent activity (last 10 disbursements)
    const { data: recentActivity } = await supabase
      .from('landlord_disbursements')
      .select(`
        id, net_amount, payment_status, payment_date, period_month, period_year,
        managed_properties(id, property_address)
      `)
      .eq('landlord_id', landlord.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate setup status
    const setupStatus = {
      w9Complete: landlord.w9_status === 'completed',
      bankConnected: landlord.bank_status === 'connected',
    }

    return NextResponse.json({
      success: true,
      landlord: {
        id: landlord.id,
        first_name: landlord.first_name,
        last_name: landlord.last_name,
        email: landlord.email,
        phone: landlord.phone,
        mailing_address: landlord.mailing_address,
        mailing_city: landlord.mailing_city,
        mailing_state: landlord.mailing_state,
        mailing_zip: landlord.mailing_zip,
        status: landlord.status,
      },
      properties: landlord.managed_properties || [],
      agreements: landlord.pm_agreements || [],
      pendingDisbursements: pendingDisbursements || [],
      recentActivity: (recentActivity || []).map((d: any) => ({
        type: 'disbursement',
        description: `${d.payment_status === 'completed' ? 'Paid' : 'Pending'}: $${d.net_amount} for ${d.managed_properties?.property_address || 'Property'} (${d.period_month}/${d.period_year})`,
        date: d.payment_date,
        amount: d.net_amount,
        status: d.payment_status,
      })),
      setupStatus,
    })
  } catch (error: any) {
    console.error('Error fetching landlord dashboard:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
