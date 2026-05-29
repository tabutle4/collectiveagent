import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// PATCH - Update a tenant disbursement (mark paid, adjust amount, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'amount', 'period_month', 'period_year',
      'payment_status', 'payment_date', 'notes',
    ]

    const filteredUpdates: Record<string, any> = {}
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    if (filteredUpdates.amount != null && Number(filteredUpdates.amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tenant_disbursements')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, tenant_disbursement: data })
  } catch (error: any) {
    console.error('Error updating tenant disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remove a tenant disbursement. Only allowed for pending
// disbursements to avoid silently mutating held-in-trust balances
// for refunds that have already been paid out.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = createClient()

    const { data: existing } = await supabase
      .from('tenant_disbursements')
      .select('id, payment_status')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Tenant disbursement not found' }, { status: 404 })
    }

    if (existing.payment_status !== 'pending') {
      return NextResponse.json(
        { error: 'Cannot delete a tenant disbursement that has already been paid or processed' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('tenant_disbursements')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting tenant disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
