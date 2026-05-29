import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// PATCH - Update a deduction
//   - Can edit label, description, amount, incurred_date, sort_order
//   - Can attach to a disbursement by setting disbursement_id (auto-stamps
//     applied_at)
//   - Can detach by setting disbursement_id = null (auto-clears applied_at)
//
// When amount or disbursement_id changes, any affected disbursement's
// net_amount is recomputed so the parent stays in sync. Otherwise editing
// an applied deduction would silently break the landlord's check total.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = createClient()
    const updates = await request.json()

    const allowedFields = [
      'label', 'description', 'amount', 'incurred_date',
      'disbursement_id', 'sort_order',
    ]

    const filteredUpdates: Record<string, any> = {}
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    // Auto-stamp or clear applied_at based on whether disbursement_id is set.
    // Only adjust applied_at if disbursement_id is explicitly being changed.
    if ('disbursement_id' in filteredUpdates) {
      filteredUpdates.applied_at = filteredUpdates.disbursement_id
        ? new Date().toISOString()
        : null
    }

    if (filteredUpdates.amount != null && Number(filteredUpdates.amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      )
    }

    // Read the pre-update state so we know which disbursements need
    // their net_amount recomputed after the change.
    const { data: before } = await supabase
      .from('landlord_disbursement_deductions')
      .select('disbursement_id, amount')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('landlord_disbursement_deductions')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Recompute net_amount on any disbursement this PATCH touched.
    // Two cases trigger a recalc:
    //   - amount changed and the deduction is/was applied to a disbursement
    //   - disbursement_id changed (attach/detach/reattach): recalc both
    //     the old and new parent
    const oldDisbursementId = before?.disbursement_id || null
    const newDisbursementId =
      'disbursement_id' in filteredUpdates
        ? filteredUpdates.disbursement_id
        : oldDisbursementId
    const amountChanged = filteredUpdates.amount !== undefined

    const idsToRecalc = new Set<string>()
    if (oldDisbursementId && (amountChanged || newDisbursementId !== oldDisbursementId)) {
      idsToRecalc.add(oldDisbursementId)
    }
    if (newDisbursementId && newDisbursementId !== oldDisbursementId) {
      idsToRecalc.add(newDisbursementId)
    }

    for (const disbId of idsToRecalc) {
      await recomputeDisbursementNet(supabase, disbId)
    }

    return NextResponse.json({ success: true, deduction: data })
  } catch (error: any) {
    console.error('Error updating disbursement deduction:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Recompute net_amount on a disbursement using the canonical formula:
//   net = gross_rent - management_fee - other_deductions
//         - sum(applied landlord_disbursement_deductions.amount)
// Called from PATCH after a deduction changes attachment or amount.
async function recomputeDisbursementNet(supabase: any, disbursementId: string) {
  const { data: current } = await supabase
    .from('landlord_disbursements')
    .select('gross_rent, management_fee, other_deductions')
    .eq('id', disbursementId)
    .single()

  if (!current) return

  const { data: deductionRows } = await supabase
    .from('landlord_disbursement_deductions')
    .select('amount')
    .eq('disbursement_id', disbursementId)

  const lineItems = (deductionRows || []).reduce(
    (sum: number, d: any) => sum + Number(d.amount || 0),
    0
  )
  const gross = Number(current.gross_rent || 0)
  const mgmt = Number(current.management_fee || 0)
  const other = Number(current.other_deductions || 0)
  const net = gross - mgmt - other - lineItems

  await supabase
    .from('landlord_disbursements')
    .update({ net_amount: net, amount_1099_reportable: net, updated_at: new Date().toISOString() })
    .eq('id', disbursementId)
}

// DELETE - Remove a deduction. Only allowed for pending deductions
// (disbursement_id IS NULL); applied deductions must be detached first
// to avoid silently mutating a paid disbursement total.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = createClient()

    const { data: deduction } = await supabase
      .from('landlord_disbursement_deductions')
      .select('id, disbursement_id')
      .eq('id', id)
      .single()

    if (!deduction) {
      return NextResponse.json({ error: 'Deduction not found' }, { status: 404 })
    }

    if (deduction.disbursement_id) {
      return NextResponse.json(
        { error: 'Cannot delete an applied deduction. Detach it from the disbursement first.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('landlord_disbursement_deductions')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting disbursement deduction:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
