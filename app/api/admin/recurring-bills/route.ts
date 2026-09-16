import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { type RecurringBill, billsDueWithin, billsDueTotal } from '@/lib/payouts/bills'

export const dynamic = 'force-dynamic'

// Bills paid out of the payouts account.
//
// Amounts live in the table and are editable here, never hardcoded. What a bill
// says it costs and what actually left the account are different things: the
// schedule holds the expected amount, and ticking a run paid writes the real
// one to the ledger. That is why a varying bill like the Payload ACH fee does
// not corrupt the schedule.

const DUE_WINDOW_DAYS = 14

function parseBill(body: any) {
  const days = Array.isArray(body?.days)
    ? body.days.map((d: unknown) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 31)
    : []

  return {
    name: String(body?.name || '').trim(),
    amount: Number(body?.amount),
    days,
    last_day_of_month: !!body?.last_day_of_month,
    window_start_day: body?.window_start_day ? Number(body.window_start_day) : null,
    window_end_day: body?.window_end_day ? Number(body.window_end_day) : null,
    shift_earlier_for_nonbusiness: !!body?.shift_earlier_for_nonbusiness,
    account: String(body?.account || 'payouts'),
    active: body?.active === undefined ? true : !!body.active,
    notes: body?.notes || null,
  }
}

function validate(b: ReturnType<typeof parseBill>): string | null {
  if (!b.name) return 'Enter a name'
  if (!Number.isFinite(b.amount) || b.amount <= 0) return 'Enter an amount greater than zero'
  if (b.days.length === 0 && !b.last_day_of_month && !b.window_start_day) {
    return 'Give the bill a schedule: one or more days of the month, the last day, or a window'
  }
  if (b.window_start_day && !b.window_end_day) return 'A window needs an end day'
  if (b.window_start_day && b.window_end_day && b.window_end_day < b.window_start_day) {
    return 'The window end day cannot be before its start day'
  }
  return null
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_ledger')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const windowDays = Number(searchParams.get('days')) || DUE_WINDOW_DAYS
    const from = searchParams.get('from') || getCentralDateString()

    const bills = await fetchAllRows<RecurringBill>(
      'recurring_bills',
      'id, name, amount, days, last_day_of_month, window_start_day, window_end_day, shift_earlier_for_nonbusiness, account, active, notes'
    )

    const active = (bills || []).filter(b => b.active !== false)
    const due = billsDueWithin(active, from, windowDays)

    // Monthly commitment counts every occurrence, so a bill running on the
    // 15th and the last day counts twice. That is the real monthly figure.
    const monthly = billsDueTotal(billsDueWithin(active, from, 30))

    return NextResponse.json({
      bills: bills || [],
      due_window_days: windowDays,
      due: due,
      due_total: billsDueTotal(due),
      monthly_total: monthly,
    })
  } catch (error: any) {
    console.error('Recurring bills read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_recurring_bills')
  if (auth.error) return auth.error

  try {
    const bill = parseBill(await request.json())
    const problem = validate(bill)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('recurring_bills')
      .insert(bill)
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, id: data.id })
  } catch (error: any) {
    console.error('Recurring bill create error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_recurring_bills')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const bill = parseBill(body)
    const problem = validate(bill)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('recurring_bills')
      .update({ ...bill, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Recurring bill update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_recurring_bills')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Deactivate rather than delete. A deleted bill takes its history with it,
    // and the ledger entries it produced would then point at nothing.
    const { error } = await supabaseAdmin
      .from('recurring_bills')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, deactivated: true })
  } catch (error: any) {
    console.error('Recurring bill deactivate error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
