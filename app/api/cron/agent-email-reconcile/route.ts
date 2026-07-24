import { NextRequest, NextResponse } from 'next/server'
import { reconcileSubscriptions } from '@/lib/graph-mail-subscriptions'

export const dynamic = 'force-dynamic'

// GET - Cron endpoint for the agent email dashboard's Graph subscription
// reconciliation job. Runs hourly (see vercel.json).
//
// Graph mail subscriptions expire every ~3 days; we renew any within 24h
// of expiry. This cron also creates missing subscriptions/folders/rules
// for newly added admins and tears down subscriptions for admins who were
// removed since the last run.
//
// Authenticated with CRON_SECRET only (no user session).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await reconcileSubscriptions()
    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    console.error('cron agent-email-reconcile error:', err)
    return NextResponse.json(
      { error: err?.message || 'Reconciliation failed' },
      { status: 500 }
    )
  }
}
