import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Support both token-based (legacy) and user_id-based (session) lookups
    const token = request.nextUrl.searchParams.get('token')
    const userId = request.nextUrl.searchParams.get('user_id')
    
    let landlordId: string | null = null
    
    if (userId) {
      // Session-based: user_id is the landlord id
      landlordId = userId
    } else if (token) {
      // Token-based: look up by dashboard_token
      const { data: landlord } = await supabase
        .from('landlords')
        .select('id')
        .eq('dashboard_token', token)
        .single()
      
      if (!landlord) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
      }
      landlordId = landlord.id
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch landlord with all related data
    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .select('*')
      .eq('id', landlordId)
      .single()

    if (landlordError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    // Fetch properties with active leases
    const { data: properties } = await supabase
      .from('managed_properties')
      .select(`
        *,
        pm_leases (
          id,
          lease_start,
          lease_end,
          monthly_rent,
          status,
          tenants (
            id,
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq('landlord_id', landlordId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    // Fetch agreements
    const { data: agreements } = await supabase
      .from('pm_agreements')
      .select('*')
      .eq('landlord_id', landlordId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    // Fetch pending disbursements
    const { data: pendingDisbursements } = await supabase
      .from('landlord_disbursements')
      .select(`
        *,
        managed_properties (
          id,
          property_address,
          city
        )
      `)
      .eq('landlord_id', landlordId)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })

    // Build recent activity from disbursements
    const { data: recentDisbursements } = await supabase
      .from('landlord_disbursements')
      .select('*')
      .eq('landlord_id', landlordId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch repair requests
    const { data: repairs } = await supabase
      .from('repair_requests')
      .select(`
        *,
        managed_properties (
          id,
          property_address,
          city
        )
      `)
      .eq('landlord_id', landlordId)
      .order('created_at', { ascending: false })
      .limit(10)

    const recentActivity = (recentDisbursements || []).map(d => ({
      type: 'disbursement',
      description: `${d.payment_status === 'completed' ? 'Received' : 'Pending'} disbursement for ${new Date(2000, (d.period_month || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${d.period_year}`,
      date: d.payment_date || d.created_at,
      amount: d.net_amount,
      status: d.payment_status === 'completed' ? 'completed' : 'pending'
    }))

    // Determine setup status
    const setupStatus = {
      w9Complete: landlord.w9_status === 'completed',
      bankConnected: landlord.bank_status === 'connected'
    }

    return NextResponse.json({
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
        w9_status: landlord.w9_status,
        bank_status: landlord.bank_status
      },
      properties: properties || [],
      agreements: agreements || [],
      pendingDisbursements: pendingDisbursements || [],
      repairs: repairs || [],
      recentActivity,
      setupStatus
    })
  } catch (error: any) {
    console.error('Error in PM landlord dashboard:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}