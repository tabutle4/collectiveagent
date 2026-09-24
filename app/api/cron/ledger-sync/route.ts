import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { syncPayoutsLedger } from '@/lib/payouts/posting'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Nightly backstop for ledger posting.
//
// The posting helper is also called inline after a payment is marked, so in
// normal use this finds nothing to do. It exists for the cases inline calls
// cannot cover: a check edited straight in SQL, a deposit that cleared
// overnight through the funding-sync cron, a row changed by a route that was
// written after this one, and any inline call that failed and was logged
// rather than retried.
//
// Runs before the payouts snapshot at 11:00 UTC, so the snapshot is taken
// against a ledger that is already current rather than one night behind.

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const result = await syncPayoutsLedger(null)
    if (!result.started) {
      return NextResponse.json({ success: true, skipped: 'Ledger has not been started yet' })
    }
    if (result.left_for_review.length > 0) {
      // A reconciled line whose source stopped qualifying is not something a
      // cron may quietly undo, so it is logged for a person to look at.
      console.warn(
        'Ledger sync left reconciled entries for review:',
        result.left_for_review.join(', ')
      )
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Ledger sync cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
