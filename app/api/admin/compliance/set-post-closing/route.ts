import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = ['not_started', 'in_review', 'complete', 'incomplete'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

// POST /api/admin/compliance/set-post-closing
// Body: { transaction_id, status, completed_at?, notes? }
// Post closing compliance is tracked per deal, not per submission, so it lives
// on transaction_post_closing (one row per transaction, upserted on the unique
// transaction_id). Mirrors set-status: a status, a completion date, and notes
// listing what is still missing.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { transaction_id, status, completed_at, notes } = body

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }
    if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
      return NextResponse.json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 })
    }

    // SELECT before write: confirm the transaction exists.
    const { data: txn } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('id', transaction_id)
      .maybeSingle()
    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('transaction_post_closing')
      .upsert(
        {
          transaction_id,
          status,
          completed_at: status === 'complete' && completed_at ? completed_at : null,
          notes: status === 'incomplete' ? (notes || null) : null,
          updated_by: auth.user.id,
          updated_at: nowIso,
        },
        { onConflict: 'transaction_id' }
      )
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('set-post-closing error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}