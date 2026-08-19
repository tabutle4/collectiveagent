import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { autoCascadeTransaction } from '@/lib/transactions/cascade'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'

/**
 * Move a check from one deal to another.
 *
 * A check landing on the wrong deal throws off both sides at once: the deal it
 * sat on counted money it never received, and the deal it belonged to looks
 * unpaid. Fixing it by hand meant editing checks_received directly, which skips
 * the cascade and the compliance stamp and leaves office_net and the pay-by
 * date stale on both deals. This does the write and the two follow-ups
 * together so neither can be forgotten.
 *
 * Both pages that offer the move call this: the payouts report and the
 * transaction detail page.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { action } = body

    // Transaction picker for the move dialog. Mirrors the search the compliance
    // tracker's link panel uses so both pickers behave the same way.
    if (action === 'search') {
      const q = String(body.query || '').trim()
      if (q.length < 2) return NextResponse.json({ transactions: [] })

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name, status, transaction_type, closing_date')
        .or(`property_address.ilike.%${q}%,client_name.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(15)

      if (error) throw error
      return NextResponse.json({ transactions: data || [] })
    }

    if (action === 'relink') {
      const checkId = String(body.check_id || '')
      const transactionId = String(body.transaction_id || '')
      if (!checkId || !transactionId) {
        return NextResponse.json({ error: 'Missing check_id or transaction_id' }, { status: 400 })
      }

      // Read the current owner before the write so the deal the check leaves
      // can be recalculated too.
      const { data: check, error: checkErr } = await supabaseAdmin
        .from('checks_received')
        .select('id, transaction_id')
        .eq('id', checkId)
        .single()
      if (checkErr || !check) return NextResponse.json({ error: 'Check not found' }, { status: 404 })

      const priorTxnId = check.transaction_id || null
      if (priorTxnId === transactionId) {
        return NextResponse.json({ error: 'That check is already on this transaction' }, { status: 409 })
      }

      // Confirm the target exists before pointing anything at it, so a bad id
      // cannot strand the check on a transaction that is not there.
      const { data: txn, error: txnErr } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address')
        .eq('id', transactionId)
        .single()
      if (txnErr || !txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

      // Blank the stamp in the same write that moves the check. The date belongs
      // to the deal the check is leaving, and syncCheckComplianceDate cannot be
      // relied on to correct it: if the destination has no submissions yet it
      // returns without writing, and the check would arrive still carrying the
      // origin's pay-by date. Clearing here scopes the reset to this one check,
      // so a hand-entered date on the destination's other checks survives.
      const { error: updErr } = await supabaseAdmin
        .from('checks_received')
        .update({
          transaction_id: transactionId,
          compliance_complete_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkId)
      if (updErr) throw updErr

      // The check carries commission money, so both deals have to be recomputed
      // and both re-stamped for compliance. The destination may now be fully
      // funded and complete; the origin may now be neither.
      await autoCascadeTransaction(transactionId)
      await syncCheckComplianceDate(transactionId)
      if (priorTxnId) {
        await autoCascadeTransaction(priorTxnId)
        await syncCheckComplianceDate(priorTxnId)
      }

      return NextResponse.json({
        success: true,
        check_id: checkId,
        transaction_id: transactionId,
        prior_transaction_id: priorTxnId,
        property_address: txn.property_address || null,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('check relink error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
