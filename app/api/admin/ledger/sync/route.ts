import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { syncPayoutsLedger } from '@/lib/payouts/posting'

export const dynamic = 'force-dynamic'
// Same ceiling as the other long routes. The work is proportional to checks
// and payments rather than to deals, so it is a few thousand rows at most, but
// the first run after starting the ledger does all of them at once.
export const maxDuration = 300

// Bring the ledger up to date on demand.
//
// The nightly cron does this too. This exists because "is the ledger current?"
// is a question someone asks while looking at the screen, and the honest answer
// has to be available then rather than tomorrow morning.
//
// Idempotent: every derived line carries a deterministic external_id with a
// unique constraint behind it, so pressing this twice does nothing the second
// time.

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_ledger')
  if (auth.error) return auth.error

  try {
    const result = await syncPayoutsLedger(auth.user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Ledger sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
