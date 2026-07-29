import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import {
  undoFolderMoveAndSwitchToCategory,
  undoFolderMoveForMailbox,
} from '@/lib/graph-mail-subscriptions'
import { getActiveAdmins } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST - One-time migration. Removes the old move-to-folder inbox rules,
// moves any mail already filed in "Work in Dashboard" back to the Inbox,
// deletes the empty folder, and ensures the black "Agent Email" category
// exists. After running this for every mailbox, hit the reconcile endpoint
// so the new category-tagging rule is (re)created.
//
// Two modes:
//   ?upn=tarab@collectiverealtyco.com  cleans ONE mailbox (fast, no timeout).
//   (no upn)                           cleans all six in one request. This
//                                      can exceed the gateway timeout on
//                                      mailboxes with a lot of filed mail;
//                                      prefer the per-mailbox mode.
//   ?list=1                            returns the list of admin mailboxes
//                                      to iterate, without doing any work.
//
// Safe to re-run. Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)

    // List mode: just enumerate the mailboxes so the caller can loop.
    if (searchParams.get('list') === '1') {
      const admins = await getActiveAdmins()
      return NextResponse.json({
        success: true,
        mailboxes: admins.map(a => ({ upn: a.email, name: a.email })),
      })
    }

    const upn = searchParams.get('upn')?.trim() || null
    if (upn) {
      const admins = await getActiveAdmins()
      const match = admins.find(a => a.email.toLowerCase() === upn.toLowerCase())
      if (!match) {
        return NextResponse.json(
          { error: `No active admin mailbox matches ${upn}` },
          { status: 404 }
        )
      }
      const mailbox = await undoFolderMoveForMailbox(match.email)
      return NextResponse.json({ success: true, mailbox })
    }

    // Fallback: all mailboxes in one request.
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
