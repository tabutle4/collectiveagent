import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List disbursements with filters
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const periodYear = searchParams.get('period_year')
    const periodMonth = searchParams.get('period_month')

    let query = supabase
      .from('landlord_disbursements')
      .select(`
        *,
        landlords(id, first_name, last_name, email, bank_status, payload_payment_method_id),
        managed_properties(id, property_address, city),
        tenant_invoices(id, period_month, period_year, total_amount, paid_at)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('payment_status', status)
    }
    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }
    if (propertyId) {
      query = query.eq('property_id', propertyId)
    }
    if (periodYear) {
      query = query.eq('period_year', parseInt(periodYear))
    }
    if (periodMonth) {
      query = query.eq('period_month', parseInt(periodMonth))
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ disbursements: data || [] })
  } catch (error: any) {
    console.error('Error fetching disbursements:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
