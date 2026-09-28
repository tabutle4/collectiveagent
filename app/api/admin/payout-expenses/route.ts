import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { entryTypeForCategory, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'
import { normalizePaymentMethod } from '@/lib/transactions/constants'

export const dynamic = 'force-dynamic'

/**
 * GET - the recurring bills that can be reserved, and what each one is doing.
 *
 * Only used by the bill picker. `pending` means this bill already has a live
 * reservation in Also In Payouts, so the picker can stop it being reserved
 * twice; `last_paid` is what actually left the bank the last time this bill
 * was paid, which is the figure worth seeing while typing this month's.
 *
 * `last_paid` is read from the LEDGER, not from the reservation. The pay path
 * asks for the real amount and writes it to brokerage_ledger; it never writes
 * it back to payout_expenses, whose amount stays the figure somebody reserved.
 * Reading the reservation here would quietly report a guess as a fact, and it
 * would do so worst on exactly the bills that vary, which are the only ones
 * this line exists to help with.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_ledger')
  if (auth.error) return auth.error

  try {
    // Filtered on account as well as active, matching what the payouts report
    // does and for the reason its comment gives: every live row happens to be
    // 'payouts' today, which is exactly when a missing filter goes unnoticed
    // until it does not.
    const bills = await fetchAllRows<{
      id: string
      name: string
      amount: number | string | null
    }>('recurring_bills', 'id, name, amount', {
      filters: [
        { type: 'eq', column: 'active', value: true },
        { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
      ],
    })

    const reservations = await fetchAllRows<{
      id: string
      recurring_bill_id: string | null
      status: string
      released_at: string | null
    }>('payout_expenses', 'id, recurring_bill_id, status, released_at', {
      filters: [{ type: 'not', column: 'recurring_bill_id', value: null }],
    })

    const pending = new Set<string>()
    // The most recent paid reservation per bill, which is the row whose ledger
    // line carries the real figure.
    const lastPaidRow = new Map<string, { id: string; paid_at: string }>()
    for (const r of reservations || []) {
      if (!r.recurring_bill_id) continue
      if (r.status === 'active') pending.add(r.recurring_bill_id)
      if (r.status === 'paid' && r.released_at) {
        const seen = lastPaidRow.get(r.recurring_bill_id)
        if (!seen || r.released_at > seen.paid_at) {
          lastPaidRow.set(r.recurring_bill_id, { id: r.id, paid_at: r.released_at })
        }
      }
    }

    // The pay path writes the ledger line as `bill:<reservation id>`, so the
    // amount that actually left is one lookup away.
    const lastPaid = new Map<string, { amount: number; paid_at: string }>()
    const wanted = [...lastPaidRow.entries()]
    if (wanted.length > 0) {
      const ledgerRows = await fetchAllRows<{ external_id: string; amount: number | string }>(
        'brokerage_ledger',
        'external_id, amount',
        {
          filters: [
            { type: 'in', column: 'external_id', value: wanted.map(([, v]) => `bill:${v.id}`) },
          ],
        }
      )
      const byExternal = new Map(
        (ledgerRows || []).map(l => [l.external_id, Number(l.amount || 0)])
      )
      for (const [billId, row] of wanted) {
        const amount = byExternal.get(`bill:${row.id}`)
        // Only reported when the ledger actually has the line. A paid
        // reservation with no ledger row behind it is a broken record, and
        // guessing its amount from the reservation is how it would stay hidden.
        if (amount === undefined) continue
        lastPaid.set(billId, { amount, paid_at: row.paid_at })
      }
    }

    return NextResponse.json({
      bills: (bills || [])
        .map(b => ({
          id: b.id,
          name: b.name,
          usual_amount: Number(b.amount || 0),
          pending: pending.has(b.id),
          last_paid: lastPaid.get(b.id) || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (error: any) {
    console.error('Bill picker read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const body = await request.json()

    // Reserving one or more recurring bills, picked rather than typed.
    //
    // This writes reservations, not payments. Nothing reaches the ledger here
    // and no money is recorded as having moved: the row sits in Also In
    // Payouts holding its amount back from the bottom line until somebody
    // presses Paid on it, which is the existing action that writes the ledger
    // line with whatever actually left.
    if (Array.isArray(body?.recurring_bill_ids)) {
      // Deduped, because the same id twice in one body would reserve the same
      // bill twice in a single insert, which the unique index would then
      // reject as a collision with itself.
      const ids: string[] = Array.from(
        new Set(body.recurring_bill_ids.map((v: unknown) => String(v || '')).filter(Boolean))
      )
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Pick at least one bill' }, { status: 400 })
      }
      // Shape-checked before the query. An id that is not a uuid reaches
      // Postgres as a cast error and comes back as a 500 carrying a raw
      // database message, which is neither useful nor something to show.
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!ids.every(id => UUID.test(id))) {
        return NextResponse.json({ error: 'That is not a bill' }, { status: 400 })
      }

      // Read the definitions rather than trusting names or amounts from the
      // body, so the reservation says what the bill is really called.
      // Filtered the same way the picker lists them, so an id posted directly
      // cannot reserve a bill the picker would never have offered: one that
      // was deactivated while the dialog sat open, or one belonging to another
      // account. Without the filters `active` would be read out of the table
      // and never looked at, which is how a check that was meant to happen
      // ends up not happening.
      const bills = await fetchAllRows<{
        id: string
        name: string
        amount: number | string | null
      }>('recurring_bills', 'id, name, amount', {
        filters: [
          { type: 'in', column: 'id', value: ids },
          { type: 'eq', column: 'active', value: true },
          { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
        ],
      })
      const byId = new Map((bills || []).map(b => [b.id, b]))

      // Already waiting. Reserving the same bill twice would hold its amount
      // back from the bottom line twice over, which reads as money the account
      // does not have.
      const existing = await fetchAllRows<{ recurring_bill_id: string | null }>(
        'payout_expenses',
        'recurring_bill_id',
        {
          filters: [
            { type: 'in', column: 'recurring_bill_id', value: ids },
            { type: 'eq', column: 'status', value: 'active' },
          ],
        }
      )
      const alreadyPending = new Set(
        (existing || []).map(e => e.recurring_bill_id).filter((v): v is string => !!v)
      )

      const amounts: Record<string, unknown> = body?.amounts || {}
      const rows: Array<{
        description: string
        amount: number | null
        category: string
        recurring_bill_id: string
      }> = []

      for (const id of ids) {
        const bill = byId.get(id)
        if (!bill) {
          return NextResponse.json(
            { error: 'That bill is no longer active. Nothing was added.' },
            { status: 400 }
          )
        }
        if (alreadyPending.has(id)) {
          return NextResponse.json(
            { error: `${bill.name} is already waiting in Also In Payouts. Nothing was added.` },
            { status: 409 }
          )
        }
        // The reserved figure defaults to what the bill usually costs and can
        // be corrected here, but it is only a reservation. What actually left
        // is typed again at Paid time, so a wrong guess now cannot become a
        // wrong ledger line later.
        const typed = amounts[id]
        const amount =
          typed === undefined || typed === null || typed === ''
            ? Number(bill.amount || 0)
            : Number(typed)
        if (!Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json(
            { error: `Enter an amount greater than zero for ${bill.name}` },
            { status: 400 }
          )
        }
        rows.push({
          description: bill.name,
          amount: Math.round(amount * 100) / 100,
          category: 'bill',
          recurring_bill_id: id,
        })
      }

      const { data, error } = await supabaseAdmin.from('payout_expenses').insert(rows).select()
      if (error) {
        // The unique partial index from migration 19. The read above catches
        // this in the ordinary case; this catches the two-people-at-once case
        // the read cannot, and turns it into the same sentence rather than a
        // database error. A multi-row insert is one request and therefore one
        // transaction, so a rejection here reserved nothing at all.
        if (String((error as { code?: string }).code || '') === '23505') {
          return NextResponse.json(
            { error: 'One of those is already waiting in Also In Payouts. Nothing was added.' },
            { status: 409 }
          )
        }
        throw error
      }
      return NextResponse.json({ expenses: data, added: rows.length })
    }

    const { description, amount } = body
    if (!description?.trim()) return NextResponse.json({ error: 'Description required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('payout_expenses')
      .insert({ description: description.trim(), amount: amount ? parseFloat(amount) : null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ expense: data })
  } catch (error: any) {
    console.error('Payout expense create error:', error)
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
