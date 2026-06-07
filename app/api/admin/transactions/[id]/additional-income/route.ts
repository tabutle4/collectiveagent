import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Recompute listing_side_commission or buying_side_commission from
// base_commission + sum(additional_income rows for that side).
// Delegates full gross + office_net recompute to avoid duplicated math.
async function recomputeSide(transactionId: string, side: 'listing' | 'buying') {
  const baseField = side === 'listing' ? 'listing_base_commission' : 'buying_base_commission'
  const sideField = side === 'listing' ? 'listing_side_commission' : 'buying_side_commission'

  const [{ data: txn }, { data: rows }] = await Promise.all([
    supabase.from('transactions').select(`${baseField}`).eq('id', transactionId).single(),
    supabase.from('transaction_additional_income')
      .select('amount').eq('transaction_id', transactionId).eq('side', side),
  ])

  // Legacy deal guard: if base commission was never set (NULL), do not
  // recompute -- the existing side commission is the source of truth.
  // Only recompute once the user has explicitly set a base commission value.
  const rawBase = (txn as any)?.[baseField]
  if (rawBase === null || rawBase === undefined) return

  const base = parseFloat(String(rawBase)) || 0
  const additionalTotal = (rows || []).reduce((s, r) => s + (parseFloat(String(r.amount)) || 0), 0)
  const sideTotal = base + additionalTotal

  // Write new side commission
  await supabase.from('transactions')
    .update({ [sideField]: sideTotal, updated_at: new Date().toISOString() })
    .eq('id', transactionId)

  // Recompute office_gross, gross_commission, AND office_net (full cascade).
  // Mirrors recomputeGrossAndOffice + recomputeOfficeNet from the main route.
  const { data: bothSides } = await supabase
    .from('transactions')
    .select('listing_side_commission, buying_side_commission')
    .eq('id', transactionId)
    .single()

  const [{ data: tias }, { data: tebs }, { data: stagedRecs }] = await Promise.all([
    supabase.from('transaction_internal_agents')
      .select('btsa_amount, brokerage_split, processing_fee, coaching_fee, other_fees, agent_role, agent_gross')
      .eq('transaction_id', transactionId),
    supabase.from('transaction_external_brokerages')
      .select('amount_1099_reportable')
      .eq('transaction_id', transactionId),
    supabase.from('agent_debts')
      .select('record_type, amount_owed, amount_remaining')
      .eq('offset_transaction_id', transactionId),
  ])

  if (bothSides) {
    const listing = parseFloat(String(bothSides.listing_side_commission ?? 0)) || 0
    const buying = parseFloat(String(bothSides.buying_side_commission ?? 0)) || 0
    const btsa = (tias || []).reduce((s: number, t: any) => s + (parseFloat(String(t.btsa_amount ?? 0)) || 0), 0)
    const officeGross = listing + buying
    const grossCommission = officeGross + btsa
    await supabase.from('transactions')
      .update({ office_gross: officeGross, gross_commission: grossCommission, updated_at: new Date().toISOString() })
      .eq('id', transactionId)

    // office_net -- same formula as recomputeOfficeNet in main route
    const brokerageSplitTotal = (tias || []).reduce((s: number, t: any) => s + (parseFloat(String(t.brokerage_split ?? 0)) || 0), 0)
    const feesTotal = (tias || []).reduce((s: number, t: any) =>
      s + (parseFloat(String(t.processing_fee ?? 0)) || 0)
        + (parseFloat(String(t.coaching_fee ?? 0)) || 0)
        + (parseFloat(String(t.other_fees ?? 0)) || 0), 0)
    const momentumPayoutsTotal = (tias || []).reduce((s: number, t: any) =>
      t.agent_role === 'momentum_partner' ? s + (parseFloat(String(t.agent_gross ?? 0)) || 0) : s, 0)
    const externalTotal = (tebs || []).reduce((s: number, e: any) => s + (parseFloat(String(e.amount_1099_reportable ?? 0)) || 0), 0)
    let stagedDebts = 0
    let stagedCredits = 0
    for (const r of (stagedRecs || [])) {
      const applied = Math.max(0, (parseFloat(String((r as any).amount_owed ?? 0)) || 0) - (parseFloat(String((r as any).amount_remaining ?? 0)) || 0))
      if ((r as any).record_type === 'credit') stagedCredits += applied
      else stagedDebts += applied
    }
    const officeNet = Math.round((brokerageSplitTotal + feesTotal + stagedDebts - stagedCredits - externalTotal - momentumPayoutsTotal) * 100) / 100
    await supabase.from('transactions')
      .update({ office_net: officeNet, updated_at: new Date().toISOString() })
      .eq('id', transactionId)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error
  try {
    const { id } = await params
    const { data, error } = await supabase
      .from('transaction_additional_income')
      .select('*')
      .eq('transaction_id', id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json()
  const { side, label, amount } = body

  if (!side || !['listing', 'buying'].includes(side)) {
    return NextResponse.json({ error: 'side must be listing or buying' }, { status: 400 })
  }
  if (!label?.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('transaction_additional_income')
      .insert({ transaction_id: id, side, label: label.trim(), amount: parseFloat(amount) })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await recomputeSide(id, side as 'listing' | 'buying')

    return NextResponse.json({ row: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error
  const { id } = await params
  const { side } = await request.json()
  if (!side || !['listing', 'buying'].includes(side)) {
    return NextResponse.json({ error: 'side required' }, { status: 400 })
  }
  try {
    await recomputeSide(id, side as 'listing' | 'buying')
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error
  const { id } = await params
  const { row_id } = await request.json()

  // Get the row first so we know which side to recompute
  const { data: row } = await supabase
    .from('transaction_additional_income')
    .select('side')
    .eq('id', row_id)
    .eq('transaction_id', id)
    .single()

  if (!row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  try {
    const { error } = await supabase
      .from('transaction_additional_income')
      .delete()
      .eq('id', row_id)
      .eq('transaction_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await recomputeSide(id, row.side as 'listing' | 'buying')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
