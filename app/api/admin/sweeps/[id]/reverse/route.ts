import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { entryTypeForCategory, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'

export const dynamic = 'force-dynamic'

// Undo a sweep by writing the opposite entry, never by deleting one.
//
// A ledger that can be edited after the fact is not a record of anything. The
// original sweep and its per-deal children stay exactly as written; this adds a
// reversing parent with its own children, and clears the stamps so the deals
// become sweepable again.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_sweeps')
  if (auth.error) return auth.error

  let reversalId: string | null = null

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason: string | null = body?.reason || null
    const entryDate: string = body?.entry_date || getCentralDateString()

    const { data: original, error: originalError } = await supabaseAdmin
      .from('brokerage_ledger')
      .select('id, category, amount, entry_date, description, bank_reference, created_at')
      .eq('id', id)
      .maybeSingle()
    if (originalError) throw originalError

    if (!original) {
      return NextResponse.json({ error: 'Sweep not found' }, { status: 404 })
    }
    if (original.category !== 'sweep') {
      return NextResponse.json({ error: 'That ledger entry is not a sweep' }, { status: 400 })
    }

    const { data: existingReversal } = await supabaseAdmin
      .from('brokerage_ledger')
      .select('id')
      .eq('category', 'sweep_reversal')
      .eq('external_id', `reversal:${id}`)
      .maybeSingle()
    if (existingReversal) {
      return NextResponse.json(
        { error: 'This sweep has already been reversed' },
        { status: 409 }
      )
    }

    const { data: children, error: childrenError } = await supabaseAdmin
      .from('brokerage_ledger')
      .select('id, transaction_id, amount, description')
      .eq('parent_entry_id', id)
    if (childrenError) throw childrenError

    const { data: reversal, error: reversalError } = await supabaseAdmin
      .from('brokerage_ledger')
      .insert({
        entry_date: entryDate,
        // Signed 'in', because the money comes back to the payouts account.
        // Written as 'adjustment' this row summed to zero, so a reversed sweep
        // left the balance permanently down by the amount it was meant to
        // return.
        entry_type: entryTypeForCategory('sweep_reversal'),
        category: 'sweep_reversal',
        description: `Reversed a sweep of ${original.description || 'office net'}`,
        amount: original.amount,
        bank_reference: original.bank_reference,
        external_id: `reversal:${id}`,
        notes: reason,
        recorded_by: auth.user.id,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      .select('id')
      .single()
    if (reversalError) throw reversalError
    reversalId = reversal.id

    if ((children || []).length > 0) {
      const { error: rowsError } = await supabaseAdmin.from('brokerage_ledger').insert(
        (children || []).map(c => ({
          entry_date: entryDate,
          entry_type: entryTypeForCategory('sweep_reversal'),
          category: 'sweep_reversal',
          description: c.description,
          amount: c.amount,
          transaction_id: c.transaction_id,
          parent_entry_id: reversalId,
          notes: reason,
          recorded_by: auth.user.id,
          account: DEFAULT_LEDGER_ACCOUNT,
        }))
      )
      if (rowsError) throw rowsError
    }

    const txnIds = (children || [])
      .map(c => c.transaction_id)
      .filter((v): v is string => !!v)

    // Unstamping is where undoing an old sweep can damage a newer one. A deal
    // reversed here, recomputed and swept again would be unstamped by an
    // unguarded clear, and the newer sweep's ledger rows would then describe
    // money the deal no longer says was moved. So a deal is only reopened if
    // this sweep is still the last one that touched it.
    let reopened: string[] = []
    let leftAlone: string[] = []
    if (txnIds.length > 0) {
      const { data: laterSweeps, error: laterError } = await supabaseAdmin
        .from('brokerage_ledger')
        .select('transaction_id, parent_entry_id, created_at')
        .eq('category', 'sweep')
        .in('transaction_id', txnIds)
        .neq('parent_entry_id', id)
        .gt('created_at', original.created_at)
      if (laterError) throw laterError

      const sweptAgain = new Set(
        (laterSweeps || []).map(r => r.transaction_id).filter((v): v is string => !!v)
      )
      reopened = txnIds.filter(t => !sweptAgain.has(t))
      leftAlone = txnIds.filter(t => sweptAgain.has(t))

      if (reopened.length > 0) {
        const { error: clearError } = await supabaseAdmin
          .from('transactions')
          .update({
            office_net_swept_at: null,
            office_net_swept_amount: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', reopened)
        if (clearError) throw clearError
      }
    }

    return NextResponse.json({
      success: true,
      reversal_entry_id: reversalId,
      deals_reopened: reopened.length,
      // Deals this reversal deliberately left stamped, because a later sweep
      // moved their share after the one being undone.
      deals_swept_again: leftAlone,
      amount: original.amount,
    })
  } catch (error: any) {
    if (reversalId) {
      await supabaseAdmin.from('brokerage_ledger').delete().eq('id', reversalId)
    }
    console.error('Reverse sweep error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
