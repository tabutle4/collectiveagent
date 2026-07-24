import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { reconcileSubscriptions } from '@/lib/graph-mail-subscriptions'

export const dynamic = 'force-dynamic'

// POST - Run the Graph mail subscription reconciliation now.
// Idempotent. Called by the cron on a schedule, or manually by an admin
// (e.g. after adding a new admin user or when the roster changes).
// Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const report = await reconcileSubscriptions()
    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    console.error('reconcile subscriptions error:', err)
    return NextResponse.json(
      { error: err?.message || 'Reconciliation failed' },
      { status: 500 }
    )
  }
}
