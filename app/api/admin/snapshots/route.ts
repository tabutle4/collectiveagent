import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { currentPosition } from '@/lib/payouts/position'

export const dynamic = 'force-dynamic'

// The overnight comparison.
//
// A snapshot has been written every night, and until now nothing read it. That
// makes the nightly job pointless: the whole reason to photograph the account
// daily is so that "the balance moved and nobody knows why" becomes a question
// answered by subtraction rather than by reconstruction.
//
// This returns where the account stands now, alongside the most recent nightly
// snapshots, so the page can show what changed since last night and over the
// last week.

// The shape the snapshot writers put in the `lines` jsonb column. Declared
// rather than cast away, so a writer that stops sending one of these is a
// type error here instead of a zero on the screen.
type SnapshotLines = {
  source?: string
  taken_for_date?: string
  ledger_balance?: number
  auto_holds?: number
  unswept_office_net?: number
  unswept_deals?: number
}

const DEFAULT_DAYS = 7
const MAX_DAYS = 90

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_ledger')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get('days')) || DEFAULT_DAYS, 1), MAX_DAYS)

    const { data: rows, error } = await supabaseAdmin
      .from('payout_report_snapshots')
      .select('id, taken_at, taken_for_date, bank_balance, funds_on_hold, payload_pending, grand_total, difference, lines')
      .eq('source', 'daily_cron')
      .order('taken_for_date', { ascending: false })
      .limit(days)
    if (error) throw error

    const lines = (r: { lines: unknown }): SnapshotLines =>
      (r.lines && typeof r.lines === 'object' ? r.lines : {}) as SnapshotLines

    const snapshots = (rows || []).map(r => ({
      date: r.taken_for_date,
      taken_at: r.taken_at,
      bank_balance: Number(r.bank_balance || 0),
      funds_on_hold: Number(r.funds_on_hold || 0),
      payload_pending: Number(r.payload_pending || 0),
      grand_total: Number(r.grand_total || 0),
      difference: Number(r.difference || 0),
      ledger_balance: Number(lines(r).ledger_balance || 0),
      unswept_office_net: Number(lines(r).unswept_office_net || 0),
      unswept_deals: Number(lines(r).unswept_deals || 0),
    }))

    const now = await currentPosition()
    const last = snapshots[0] || null

    // Null rather than zero when there is nothing to compare against. A change
    // of 0.00 and "no snapshot yet" are different statements, and showing the
    // first when you mean the second is how a screen lies quietly.
    const since = last
      ? {
          since_date: last.date,
          ledger: Math.round((now.app.ledger - last.ledger_balance) * 100) / 100,
          holds: Math.round((now.app.holds - last.funds_on_hold) * 100) / 100,
          payload: Math.round((now.app.payload - last.payload_pending) * 100) / 100,
          unswept: Math.round((now.unswept.amount - last.unswept_office_net) * 100) / 100,
          bank_typed: Math.round((now.typed.bank - last.bank_balance) * 100) / 100,
        }
      : null

    return NextResponse.json({ now, snapshots, since })
  } catch (error: any) {
    console.error('Snapshots read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
