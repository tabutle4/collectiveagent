import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * POST /api/transactions/[id]/release
 *
 * Marks a transaction as released to its agents by setting
 * transactions.released_to_agent_at. Until this is set, agents viewing
 * the transaction see "pending broker review" instead of their commission
 * statement and CDA.
 *
 * Actions:
 *   { action: 'release' }  — sets released_to_agent_at = now()
 *   { action: 'revoke' }   — sets released_to_agent_at = null
 *
 * Authorization: admin and broker (via can_manage_checks permission).
 */

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'release'

    if (action !== 'release' && action !== 'revoke') {
      return NextResponse.json(
        { error: 'Unknown action. Must be "release" or "revoke".' },
        { status: 400 }
      )
    }

    // Verify transaction exists before writing
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('transactions')
      .select('id, released_to_agent_at')
      .eq('id', id)
      .single()

    if (txnErr || !txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const newValue = action === 'release' ? new Date().toISOString() : null

    const { error: updateErr } = await supabaseAdmin
      .from('transactions')
      .update({
        released_to_agent_at: newValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      released_to_agent_at: newValue,
    })
  } catch (error: any) {
    console.error('Release transaction error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update release state' },
      { status: 500 }
    )
  }
}
