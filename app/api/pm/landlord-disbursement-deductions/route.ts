import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// GET - List disbursement deductions, filtered by landlord/property/pending
//
// Query params:
//   landlord_id (optional) - filter to one landlord
//   property_id (optional) - filter to one property
//   pending=true (optional) - only return rows where disbursement_id IS NULL
//   disbursement_id (optional) - only return rows attached to a specific
//                                 disbursement
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const pendingOnly = searchParams.get('pending') === 'true'
    const recurringOnly = searchParams.get('recurring') === 'true'
    const disbursementId = searchParams.get('disbursement_id')

    let query = supabase
      .from('landlord_disbursement_deductions')
      .select(`
        *,
        landlords(id, first_name, last_name),
        managed_properties(id, property_address, unit, city)
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (landlordId) query = query.eq('landlord_id', landlordId)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (pendingOnly) query = query.is('disbursement_id', null).eq('is_recurring', false)
    if (recurringOnly) query = query.eq('is_recurring', true)
    if (disbursementId) query = query.eq('disbursement_id', disbursementId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ deductions: data || [] })
  } catch (error: any) {
    console.error('Error fetching disbursement deductions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create a new deduction
//
// Use cases:
//   1. Create a PENDING deduction (disbursement_id omitted) - sits
//      against a property until a future disbursement is made
//   2. Create an APPLIED deduction (disbursement_id provided + applied_at)
//      - attached to a specific disbursement immediately
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      landlord_id,
      property_id,
      label,
      description,
      amount,
      incurred_date,
      disbursement_id,
      sort_order,
      is_recurring,
      recurring_start_date,
      recurring_end_date,
    } = body

    if (!landlord_id || !property_id || !label || amount == null) {
      return NextResponse.json(
        { error: 'landlord_id, property_id, label, and amount are required' },
        { status: 400 }
      )
    }
    if (Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      )
    }

    const { data: deduction, error } = await supabase
      .from('landlord_disbursement_deductions')
      .insert({
        landlord_id,
        property_id,
        label: String(label).trim(),
        description: description?.trim() || null,
        amount: Number(amount),
        incurred_date: incurred_date || null,
        disbursement_id: disbursement_id || null,
        applied_at: disbursement_id ? new Date().toISOString() : null,
        sort_order: sort_order ?? 0,
        created_by: auth.user.id,
        is_recurring: is_recurring || false,
        recurring_start_date: is_recurring ? (recurring_start_date || null) : null,
        recurring_end_date: is_recurring ? (recurring_end_date || null) : null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, deduction })
  } catch (error: any) {
    console.error('Error creating disbursement deduction:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete a deduction (only if not attached to a disbursement,
// or if it is a recurring template)
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('landlord_disbursement_deductions')
      .select('id, disbursement_id, is_recurring')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Deduction not found' }, { status: 404 })
    }

    if (existing.disbursement_id && !existing.is_recurring) {
      return NextResponse.json(
        { error: 'Cannot delete a deduction already applied to a disbursement' },
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
    console.error('Error deleting deduction:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
