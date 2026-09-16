import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { entryTypeForCategory, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { description, amount } = await request.json()
    if (!description?.trim()) return NextResponse.json({ error: 'Description required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('payout_expenses')
      .insert({ description: description.trim(), amount: amount ? parseFloat(amount) : null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ expense: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { error } = await supabaseAdmin.from('payout_expenses').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Payout expense delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Releasing an earmark.
//
// An item in Also In Payouts is money held back: it is not a payment, it is a
// reservation against the balance. Releasing it stops the reservation, which
// is why it never moves the balance and why the row is kept rather than
// deleted. A deleted earmark takes with it the reason the account read short
// for a fortnight.
//
// Gated on can_manage_ledger, not can_manage_checks, because it writes a
// ledger row: a route that writes the ledger has to be held to the ledger's
// own permission or the permission means nothing.
export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_ledger')
  if (auth.error) return auth.error

  try {
    const { id, action } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    if (action !== 'release') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // The amount is read here, never taken from the request.
    const { data: expense, error: readError } = await supabaseAdmin
      .from('payout_expenses')
      .select('id, description, amount, status')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw readError
    if (!expense) return NextResponse.json({ error: 'That item no longer exists' }, { status: 404 })
    if (expense.status === 'released') {
      return NextResponse.json({ error: 'That item has already been released' }, { status: 409 })
    }

    const releasedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('payout_expenses')
      .update({ status: 'released', released_at: releasedAt, released_by: auth.user.id })
      .eq('id', id)
      .eq('status', 'active')
    if (updateError) throw updateError

    // A release explains a change in what the account is holding back, so it
    // belongs in the ledger even though the balance does not move.
    const { error: ledgerError } = await supabaseAdmin.from('brokerage_ledger').insert({
      entry_date: getCentralDateString(),
      entry_type: entryTypeForCategory('earmark_release'),
      category: 'earmark_release',
      description: expense.description,
      amount: Number(expense.amount || 0),
      external_id: `earmark_release:${id}`,
      recorded_by: auth.user.id,
      account: DEFAULT_LEDGER_ACCOUNT,
    })
    if (ledgerError) {
      // Put the earmark back rather than leaving it released with nothing in
      // the ledger to say why.
      await supabaseAdmin
        .from('payout_expenses')
        .update({ status: 'active', released_at: null, released_by: null })
        .eq('id', id)
      throw ledgerError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Payout expense release error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
