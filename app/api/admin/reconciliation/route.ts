import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'
import { currentPosition } from '@/lib/payouts/position'

export const dynamic = 'force-dynamic'

// Comparing what the bank says against what the app says, three pots at a time.
//
// All three must tie individually, not just in total. Two errors of the same
// size in different pots net to zero and would close a period that is wrong in
// two places; tying each row also says where a gap lives before anyone starts
// looking for it.
//
// The outstanding list is what makes the exercise survive payroll. Payroll 1
// and 2 land on the 15th and the last day, which are the days you reconcile,
// so without it the period shows an unexplained gap twice a month with no
// visible cause.

async function outstandingEntries() {
  // Ledger lines not yet ticked off against a statement. Only parents: the
  // per-deal children under a sweep are detail, not separate bank lines.
  const rows = await fetchAllRows<{
    id: string
    amount: number | string
    category: string
    parent_entry_id: string | null
    reconciled: boolean | null
    entry_date: string
    description: string
  }>('brokerage_ledger', 'id, amount, category, parent_entry_id, reconciled, entry_date, description', {
    filters: [{ type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT }],
  })

  return (rows || [])
    .filter(r => !r.parent_entry_id && !r.reconciled)
    .map(r => ({
      id: r.id,
      entry_date: r.entry_date,
      description: r.description,
      amount: Number(r.amount || 0),
      category: r.category,
    }))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_reconciliation')
  if (auth.error) return auth.error

  try {
    const [position, outstanding] = await Promise.all([currentPosition(), outstandingEntries()])

    const round = (n: number) => Math.round(n * 100) / 100
    const pot = (label: string, typed: number, app: number) => ({
      label,
      typed: round(typed),
      app: round(app),
      difference: round(typed - app),
      ties: Math.round(typed * 100) === Math.round(app * 100),
    })

    const pots = [
      pot('Available at bank', position.typed.bank, position.app.ledger),
      pot('On hold at bank', position.typed.holds, position.app.holds),
      pot('On hold at Payload', position.typed.payload, position.app.payload),
    ]

    return NextResponse.json({
      pots,
      all_tie: pots.every(p => p.ties),
      totals: { typed: position.typed.total, app: position.app.total },
      hold_lines: position.hold_lines,
      payload_breakdown: position.payload_breakdown,
      outstanding,
      last_typed_at: position.typed.updated_at,
    })
  } catch (error: any) {
    console.error('Reconciliation read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_reconciliation')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { bank_balance, funds_on_hold, payload_pending_balance } = body
    const markReconciled: string[] = Array.isArray(body?.reconciled_entry_ids)
      ? body.reconciled_entry_ids.filter((v: unknown) => typeof v === 'string')
      : []

    const updates: Record<string, unknown> = { bank_balance_updated_at: new Date().toISOString() }
    // An empty box is not zero. parseFloat('') is NaN and `|| 0` turned that
    // into a real saved balance of $0.00, which then got snapshotted and read
    // as the bank being empty. A field left blank is simply not written.
    const money = (v: unknown): number | undefined => {
      if (v === undefined || v === null || String(v).trim() === '') return undefined
      const n = parseFloat(String(v))
      return Number.isFinite(n) ? n : undefined
    }
    const bank = money(bank_balance)
    const holds = money(funds_on_hold)
    const payloadPending = money(payload_pending_balance)
    if (bank !== undefined) updates.bank_balance = bank
    if (holds !== undefined) updates.funds_on_hold = holds
    if (payloadPending !== undefined) updates.payload_pending_balance = payloadPending

    const { data: existing } = await supabaseAdmin
      .from('company_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      await supabaseAdmin.from('company_settings').update(updates).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('company_settings').insert(updates)
    }

    if (markReconciled.length > 0) {
      const { error } = await supabaseAdmin
        .from('brokerage_ledger')
        .update({
          reconciled: true,
          reconciled_at: new Date().toISOString(),
          reconciled_by: auth.user.id,
        })
        .in('id', markReconciled)
      if (error) throw error
    }

    // A snapshot of where things stood, so a period that closed clean can be
    // shown to have closed clean later.
    const after = await currentPosition()
    // taken_for_date stays null: several reconciliation saves in one day are
    // legitimate, and the unique constraint that keeps the daily cron to one
    // row per day ignores nulls.
    await supabaseAdmin.from('payout_report_snapshots').insert({
      source: 'reconciliation',
      taken_by: auth.user.id,
      bank_balance: after.typed.bank,
      funds_on_hold: after.typed.holds,
      payload_pending: after.typed.payload,
      grand_total: after.app.total,
      difference: after.difference,
      lines: {
        source: 'reconciliation',
        ledger_balance: after.app.ledger,
        auto_holds: after.app.holds,
        payload_pending: after.payload_breakdown,
        unswept_office_net: after.unswept.amount,
        reconciled_entry_ids: markReconciled,
      },
    })

    return NextResponse.json({ success: true, reconciled: markReconciled.length })
  } catch (error: any) {
    console.error('Reconciliation write error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
