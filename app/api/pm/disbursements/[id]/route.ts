import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - Get single disbursement
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data: disbursement, error } = await supabase
      .from('landlord_disbursements')
      .select(`
        *,
        landlords(id, first_name, last_name, email, phone),
        managed_properties(id, property_address, city),
        pm_fee_payouts(id, payee_type, payee_name, amount, payment_status)
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error

    if (!disbursement) {
      return NextResponse.json({ error: 'Disbursement not found' }, { status: 404 })
    }

    return NextResponse.json({ disbursement })
  } catch (error: any) {
    console.error('Error fetching disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update disbursement (payment status, date, method)
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
      .from('landlord_disbursements')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
