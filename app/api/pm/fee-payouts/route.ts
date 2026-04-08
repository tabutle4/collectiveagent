import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET - List PM fee payouts with filters
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const payeeId = searchParams.get('payee_id')
    const disbursementId = searchParams.get('disbursement_id')

    let query = supabase
      .from('pm_fee_payouts')
      .select(`
        *,
        landlord_disbursements(
          id, gross_rent, management_fee, net_amount, period_month, period_year,
          landlords(id, first_name, last_name),
          managed_properties(id, property_address, city)
        ),
        payee:users!pm_fee_payouts_payee_id_fkey(id, preferred_first_name, first_name, preferred_last_name, last_name)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('payment_status', status)
    }
    if (payeeId) {
      query = query.eq('payee_id', payeeId)
    }
    if (disbursementId) {
      query = query.eq('disbursement_id', disbursementId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ payouts: data || [] })
  } catch (error: any) {
    console.error('Error fetching PM fee payouts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create PM fee payout (typically called when creating disbursement)
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      disbursement_id,
      payee_type,
      payee_id,
      payee_name,
      amount,
      notes,
    } = body

    if (!disbursement_id || !payee_type || !payee_name || amount === undefined) {
      return NextResponse.json(
        { error: 'disbursement_id, payee_type, payee_name, and amount are required' },
        { status: 400 }
      )
    }

    if (!['agent', 'brokerage'].includes(payee_type)) {
      return NextResponse.json(
        { error: 'payee_type must be agent or brokerage' },
        { status: 400 }
      )
    }

    const { data: payout, error } = await supabase
      .from('pm_fee_payouts')
      .insert({
        disbursement_id,
        payee_type,
        payee_id: payee_id || null,
        payee_name,
        amount,
        payment_status: 'pending',
        notes: notes || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, payout })
  } catch (error: any) {
    console.error('Error creating PM fee payout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
