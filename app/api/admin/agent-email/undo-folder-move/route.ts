import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { undoFolderMoveAndSwitchToCategory } from '@/lib/graph-mail-subscriptions'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST - One-time migration. Removes the old move-to-folder inbox rules,
// moves any mail already filed in "Work in Dashboard" back to the Inbox,
// deletes the empty folder, and ensures the black "Agent Email" category
// exists in each mailbox. After running this, hit the reconcile endpoint so
// the new category-tagging rule is (re)created.
//
// Safe to re-run. Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const report = await undoFolderMoveAndSwitchToCategory()
    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    console.error('undo-folder-move error:', err)
    return NextResponse.json(
      { error: err?.message || 'Migration failed' },
      { status: 500 }
    )
  }
}
