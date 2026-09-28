import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { DEFAULT_LEDGER_ACCOUNT, entryTypeForCategory } from '@/lib/payouts/ledger'
import { normalizePaymentMethod } from '@/lib/transactions/constants'

export const dynamic = 'force-dynamic'

// Recording that a bill was paid.
//
// Two things happen together and neither is useful alone: a bill_payments row,
// which is the history of what this bill actually costs month to month, and a
// Money Movement line, which is what makes the account balance explain itself.
//
// Nothing here is scheduled or automatic. Bills are picked deliberately, the
// amount confirmed one at a time, and only then does anything get written. A
// bill that is due has not left the bank, and a ledger that assumed otherwise
// would be stating a payment nobody made.

type BillRow = {
  id: string
  name: string
  amount: number | string | null
  account: string | null
  active: boolean | null
}

/** GET - the bills available to record a payment against, newest history first. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_ledger')
  if (auth.error) return auth.error

  try {
    // Filtered on account as well as active, matching what
    // app/api/admin/payouts-report/route.ts does and for the reason its comment
    // gives: every live row happens to be 'payouts' today, which is exactly
    // when a missing filter goes unnoticed until it does not.
    const bills = await fetchAllRows<BillRow>(
      'recurring_bills',
      'id, name, amount, account, active',
      {
        filters: [
          { type: 'eq', column: 'active', value: true },
          { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
        ],
      }
    )

    // The last few runs of each bill, so the dialog can show what it actually
    // came to last time rather than only what it is supposed to come to.
    const recent = await fetchAllRows<{
      id: string
      recurring_bill_id: string | null
      amount: number | string
      paid_date: string
    }>('bill_payments', 'id, recurring_bill_id, amount, paid_date', {
      orderBy: { column: 'paid_date', ascending: false },
    })

    const lastByBill = new Map<string, { amount: number; paid_date: string }>()
    for (const r of recent || []) {
      if (!r.recurring_bill_id) continue
      if (lastByBill.has(r.recurring_bill_id)) continue
      lastByBill.set(r.recurring_bill_id, {
        amount: Number(r.amount || 0),
        paid_date: r.paid_date,
      })
    }

    return NextResponse.json({
      bills: (bills || [])
        .map(b => ({
          id: b.id,
          name: b.name,
          usual_amount: Number(b.amount || 0),
          account: b.account || DEFAULT_LEDGER_ACCOUNT,
          last_paid: lastByBill.get(b.id) || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (error: any) {
    console.error('Bill payments read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - record one or more bills as paid.
 *
 * The amount comes from the request body, which is the right thing here and
 * worth saying out loud, because the standing rule is the opposite. That rule
 * exists for routes that MOVE money: a charge or a payout token must compute
 * its own figure so a tampered body cannot send a different amount than the one
 * that was authorised. This route moves nothing. The money already left the
 * bank through the biller, and the whole point of the feature is to record the
 * figure that actually left rather than the one that was scheduled.
 *
 * There is no transaction across the two writes, because PostgREST scopes a
 * transaction to a single request and these are two. So the route makes its
 * own guarantee instead: it records the ledger lines one at a time, keeps the
 * ids it created, and deletes them again if the history write fails. Either
 * both sides land or neither does.
 *
 * Recording is idempotent per bill per date. Each ledger line carries
 * `external_id = billpay:<bill id>:<date>`, and brokerage_ledger has a UNIQUE
 * on that column, so submitting the same bill for the same day twice is
 * refused by the database rather than silently doubling the money out of the
 * account. That matters because the failure path above invites a retry.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_ledger')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const items: Array<{
      recurring_bill_id?: string
      amount?: unknown
      notes?: string
    }> = Array.isArray(body?.bills) ? body.bills : []

    const paidDate: string = body?.paid_date || getCentralDateString()
    const paymentMethod = normalizePaymentMethod(body?.payment_method)
    const reference: string | null = String(body?.reference || '').trim() || null

    if (items.length === 0) {
      return NextResponse.json({ error: 'Pick at least one bill' }, { status: 400 })
    }

    const billIds = items
      .map(i => String(i.recurring_bill_id || ''))
      .filter(Boolean)
    if (billIds.length !== items.length) {
      return NextResponse.json({ error: 'Every line must name a bill' }, { status: 400 })
    }

    // Read the definitions rather than trusting the names in the body, so the
    // ledger description and the history row both say what the bill is really
    // called.
    const bills = await fetchAllRows<BillRow>(
      'recurring_bills',
      'id, name, amount, account, active',
      { filters: [{ type: 'in', column: 'id', value: billIds }] }
    )
    const byId = new Map((bills || []).map(b => [b.id, b]))

    const prepared: Array<{ bill: BillRow; amount: number; notes: string | null }> = []
    for (const item of items) {
      const bill = byId.get(String(item.recurring_bill_id))
      if (!bill) {
        return NextResponse.json({ error: 'That bill no longer exists' }, { status: 400 })
      }
      const amount = Number(item.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: `Enter an amount greater than zero for ${bill.name}` },
          { status: 400 }
        )
      }
      prepared.push({
        bill,
        amount: Math.round(amount * 100) / 100,
        notes: String(item.notes || '').trim() || null,
      })
    }

    // One insert per bill rather than one insert for all of them, so each id
    // comes back attached to the row that produced it. A multi-row insert with
    // .select() returns rows in no guaranteed order - PostgreSQL has
    // deliberately declined to promise that INSERT ... RETURNING preserves
    // input order - and pairing by array position would silently cross-link a
    // payment to another bill's ledger line the day that changed. At most
    // eight bills exist, so the extra round trips cost nothing.
    const entryIds: string[] = []
    let failure: { status: number; error: string } | null = null

    for (const p of prepared) {
      const { data: entry, error: ledgerError } = await supabaseAdmin
        .from('brokerage_ledger')
        .insert({
          entry_date: paidDate,
          entry_type: entryTypeForCategory('bill'),
          category: 'bill',
          description: p.bill.name,
          amount: p.amount,
          bank_reference: reference,
          bank_date: paidDate,
          notes: p.notes,
          payment_method: paymentMethod,
          recorded_by: auth.user.id,
          account: p.bill.account || DEFAULT_LEDGER_ACCOUNT,
          // The idempotency key. UNIQUE on brokerage_ledger.external_id, so a
          // second submission of the same bill on the same day is refused by
          // the database. Not one of posting.ts's MANAGED_PREFIXES, so the
          // auto-post sync leaves these rows alone.
          external_id: `billpay:${p.bill.id}:${paidDate}`,
        })
        .select('id')
        .single()

      if (ledgerError || !entry) {
        const duplicate = String(ledgerError?.code || '') === '23505'
        failure = duplicate
          ? {
              status: 409,
              error: `${p.bill.name} is already recorded as paid on that date. Nothing was recorded.`,
            }
          : {
              status: 500,
              error: `The ledger would not accept ${p.bill.name}. Nothing was recorded.`,
            }
        break
      }
      entryIds.push(entry.id)
    }

    // History second, and only when every ledger line landed.
    let historyError: unknown = null
    if (!failure) {
      const { error: paymentError } = await supabaseAdmin.from('bill_payments').insert(
        prepared.map((p, i) => ({
          recurring_bill_id: p.bill.id,
          bill_name: p.bill.name,
          amount: p.amount,
          paid_date: paidDate,
          payment_method: paymentMethod,
          reference,
          ledger_entry_id: entryIds[i],
          account: p.bill.account || DEFAULT_LEDGER_ACCOUNT,
          notes: p.notes,
          recorded_by: auth.user.id,
        }))
      )
      if (paymentError) {
        historyError = paymentError
        failure = {
          status: 500,
          error: 'Nothing was recorded. The bill history could not be saved, so the ledger lines were removed again.',
        }
      }
    }

    // Undo whatever landed. PostgREST gives no transaction across two
    // requests, so this is the compensation that makes the promise above true.
    // Same shape as app/api/admin/payout-expenses/route.ts, for the same
    // reason.
    if (failure) {
      if (historyError) console.error('Bill payment history write failed:', historyError)
      if (entryIds.length > 0) {
        const { error: undoError } = await supabaseAdmin
          .from('brokerage_ledger')
          .delete()
          .in('id', entryIds)
        if (undoError) {
          // Now the account and the history really do disagree, and a person
          // has to look. Say exactly which lines to look for.
          console.error('Could not remove the ledger lines after a failed bill payment:', undoError)
          return NextResponse.json(
            {
              error: `${failure.error} Some ledger lines could not be removed - check Money Movement for ${prepared
                .map(p => p.bill.name)
                .join(', ')} dated ${paidDate} before trying again.`,
            },
            { status: 500 }
          )
        }
      }
      return NextResponse.json({ error: failure.error }, { status: failure.status })
    }

    return NextResponse.json({
      success: true,
      recorded: prepared.length,
      total: Math.round(prepared.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    })
  } catch (error: any) {
    console.error('Bill payment write error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
