import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import { currentPosition } from '@/lib/payouts/position'

export const dynamic = 'force-dynamic'

// A daily photograph of the payouts account.
//
// Without it, a change overnight can only be reconstructed, and this account
// has spent months being impossible to reconstruct. With it, "the balance moved
// and nobody knows why" becomes a question the app can answer by subtraction.
//
// Authenticated with CRON_SECRET only (no user session).

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const position = await currentPosition()
    const today = position.as_of

    // Upsert, not insert. Vercel documents that a cron can fire the same run
    // more than once, so a plain insert would write two snapshots for one day
    // and anything diffing consecutive days would read the duplicate as a real
    // second observation. Keyed on (source, taken_for_date).
    const { error } = await supabaseAdmin.from('payout_report_snapshots').upsert(
      {
        source: 'daily_cron',
        taken_for_date: today,
        bank_balance: position.typed.bank,
        funds_on_hold: position.typed.holds,
        payload_pending: position.typed.payload,
        grand_total: position.app.total,
        difference: position.difference,
        lines: {
          source: 'daily_cron',
          taken_for_date: today,
          ledger_balance: position.app.ledger,
          auto_holds: position.app.holds,
          payload_pending: position.payload_breakdown,
          unswept_office_net: position.unswept.amount,
          unswept_deals: position.unswept.deals,
        },
      },
      { onConflict: 'source,taken_for_date' }
    )
    if (error) throw error

    return NextResponse.json({
      success: true,
      date: today,
      ledger_balance: position.app.ledger,
      unswept_office_net: position.unswept.amount,
    })
  } catch (error: any) {
    console.error('Payouts snapshot error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
