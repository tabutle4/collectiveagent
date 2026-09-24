import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { entryTypeForCategory, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'
import { normalizePaymentMethod } from '@/lib/transactions/constants'

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
    const body = await request.json()
    const { id, action } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    if (action !== 'release' && action !== 'pay') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // The amount is read here, never taken from the request.
    const { data: expense, error: readError } = await supabaseAdmin
      .from('payout_expenses')
      .select('id, description, amount, status')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw readError

    // ── Paid ────────────────────────────────────────────────────────────────
    // An item had two endings and neither of them moved money: Release stops
    // reserving and deliberately changes no balance, Delete removes the
    // record. So there was no way to say a bill was actually paid, which is
    // why paying one could not be told apart from cancelling one.
    //
    // Paid is the third ending: the earmark closes AND a bill line posts, for
    // the amount that actually left. That amount is typed, because the real
    // figure routinely differs from the reserved one - Payload's ACH fee
    // varies every month, and the settled spec calls for the stored recurring
    // amount and the actual paid amount to both exist rather than one
    // overwriting the other.
    if (action === 'pay') {
      if (!expense) return NextResponse.json({ error: 'That item no longer exists' }, { status: 404 })
      if (expense.status !== 'active') {
        return NextResponse.json(
          { error: `That item has already been ${expense.status}` },
          { status: 409 }
        )
      }

      // The paid amount is the one figure here that genuinely comes from the
      // person, because only they know what left the bank. It is validated
      // rather than trusted, and it defaults to the reserved amount.
      const typed = body?.amount
      const paidAmount =
        typed === undefined || typed === null || typed === ''
          ? Number(expense.amount || 0)
          : Number(typed)
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        return NextResponse.json(
          { error: 'Enter the amount that actually left the account' },
          { status: 400 }
        )
      }
      const paidDate: string =
        typeof body?.paid_date === 'string' && body.paid_date
          ? body.paid_date.slice(0, 10)
          : getCentralDateString()

      // `.eq('status','active')` makes this the claim: whoever flips the row
      // from active owns the payment. The returned rows say whether this
      // request was that one. Without checking, two clicks both proceed to
      // insert, the loser hits the unique constraint, and its compensation
      // resets the row to active while the winner's ledger line stands - an
      // item that reads unpaid and can never be paid again.
      const { data: claimed, error: payUpdateError } = await supabaseAdmin
        .from('payout_expenses')
        .update({ status: 'paid', released_at: new Date().toISOString(), released_by: auth.user.id })
        .eq('id', id)
        .eq('status', 'active')
        .select('id')
      if (payUpdateError) throw payUpdateError
      if (!claimed || claimed.length === 0) {
        return NextResponse.json(
          { error: 'Someone else recorded that payment a moment ago' },
          { status: 409 }
        )
      }

      const { error: billError } = await supabaseAdmin.from('brokerage_ledger').insert({
        entry_date: paidDate,
        entry_type: entryTypeForCategory('bill'),
        category: 'bill',
        description: expense.description,
        amount: Math.round(paidAmount * 100) / 100,
        payment_method: normalizePaymentMethod(body?.payment_method),
        bank_reference: body?.bank_reference || null,
        bank_date: paidDate,
        external_id: `bill:${id}`,
        recorded_by: auth.user.id,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      if (billError) {
        // Put it back rather than leaving it marked paid with nothing in the
        // ledger to say the money left. Same compensation shape as the release
        // path below, for the same reason: PostgREST has no transactions.
        await supabaseAdmin
          .from('payout_expenses')
          .update({ status: 'active', released_at: null, released_by: null })
          .eq('id', id)
        throw billError
      }

      return NextResponse.json({ success: true, amount: Math.round(paidAmount * 100) / 100 })
    }
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
