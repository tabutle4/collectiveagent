import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single PM fee payout
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: payout, error } = await supabase
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
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    return NextResponse.json({ payout })
  } catch (error: any) {
    console.error('Error fetching PM fee payout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update PM fee payout (payment status, date, method)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'payment_status',
      'payment_date',
      'payment_method',
      'payment_reference',
      'notes',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { error } = await supabase
      .from('pm_fee_payouts')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating PM fee payout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
