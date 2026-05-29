import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

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
        id, lease_id, landlord_id, property_id, tenant_invoice_id,
        gross_rent, management_fee, agent_fee, deposit_amount,
        other_deductions, other_deductions_description,
        net_amount, amount_1099_reportable,
        payment_status, payment_date, payment_method, payment_reference,
        period_month, period_year, notes, payload_payout_id, created_at, updated_at,
        landlords(id, first_name, last_name, email),
        pm_leases(
          id, monthly_rent,
          managed_properties(id, property_address, unit, city, state)
        )
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

// PATCH - Update disbursement (mark as paid, update status, etc.)
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

    // Allowed fields for update
    const allowedFields = [
      'payment_status', 'payment_date', 'payment_method', 'payment_reference',
      'gross_rent', 'management_fee', 'agent_fee', 'deposit_amount',
      'net_amount', 'notes',
      'payload_payout_id',
    ]

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    // If any amount field changed and net_amount wasn't explicitly set,
    // recompute it: net = gross_rent - management_fee - other_deductions - sum(line-item deductions)
    // The recompute pulls the current row + applied deductions to use the latest values.
    if (
      filteredUpdates.net_amount === undefined &&
      (filteredUpdates.gross_rent !== undefined ||
        filteredUpdates.management_fee !== undefined ||
        filteredUpdates.deposit_amount !== undefined)
    ) {
      const { data: current } = await supabase
        .from('landlord_disbursements')
        .select('gross_rent, management_fee, other_deductions, deposit_amount')
        .eq('id', resolvedParams.id)
        .single()

      const { data: deductionRows } = await supabase
        .from('landlord_disbursement_deductions')
        .select('amount')
        .eq('disbursement_id', resolvedParams.id)

      if (current) {
        const gross = Number(filteredUpdates.gross_rent ?? current.gross_rent ?? 0)
        const mgmt = Number(filteredUpdates.management_fee ?? current.management_fee ?? 0)
        const otherOld = Number(current.other_deductions ?? 0)
        const lineItems = (deductionRows || []).reduce(
          (sum: number, d: any) => sum + Number(d.amount || 0),
          0
        )
        filteredUpdates.net_amount = gross - mgmt - otherOld - lineItems
      }
    }

    const { data, error } = await supabase
      .from('landlord_disbursements')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)
      .select('id, payment_status, payment_date, payment_method, payment_reference, net_amount, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, disbursement: data })
  } catch (error: any) {
    console.error('Error updating disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
