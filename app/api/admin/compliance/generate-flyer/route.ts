import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/admin/compliance/generate-flyer
// Body: { transaction_id }
// Creates the compliance flyer (just_sold or just_leased) for an existing
// transaction so an admin can generate one from a prior submission.
//
// Idempotent PER TYPE: a deal can legitimately carry several flyers (Just
// Listed, Under Contract, Just Sold), so this only skips creation when a flyer
// OF THE SAME TYPE already exists. Checking for any flyer at all meant a deal
// that already had a Just Listed flyer could never get its Just Sold one.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const transactionId = body?.transaction_id
    if (!transactionId) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Confirm the transaction exists and read what we need to type the flyer.
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('transactions')
      .select('id, transaction_type, representing, flyer_division')
      .eq('id', transactionId)
      .maybeSingle()

    if (txnErr || !txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Derive sold vs leased the same way the compliance form does: lease when
    // the type code or representation indicates a tenant/landlord/lease deal.
    const t = String(txn.transaction_type || '').toLowerCase()
    const rep = String(txn.representing || '').toLowerCase()
    const isLease =
      t.includes('lease') || t.includes('tenant') || t.includes('landlord') || t.includes('apartment') ||
      rep === 'tenant' || rep === 'landlord'
    const flyerType = isLease ? 'just_leased' : 'just_sold'

    // Only skip if a flyer OF THIS TYPE already exists. Other types (Just
    // Listed, Under Contract) are separate flyers on the same deal and must not
    // block the compliance flyer from being created.
    const { data: existing } = await supabaseAdmin
      .from('transaction_flyers')
      .select('id, flyer_type, status')
      .eq('transaction_id', transactionId)
      .eq('flyer_type', flyerType)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        flyer_id: existing.id,
        flyer_type: existing.flyer_type,
        already_existed: true,
      })
    }

    const now = new Date().toISOString()
    const { data: flyer, error: flyerErr } = await supabaseAdmin
      .from('transaction_flyers')
      .insert({
        transaction_id: transactionId,
        flyer_type: flyerType,
        status: 'requested',
        requested_by: auth.user!.id,
        flyer_division: txn.flyer_division || null,
        updated_at: now,
      })
      .select('id')
      .single()

    if (flyerErr || !flyer) {
      return NextResponse.json({ error: 'Failed to create flyer' }, { status: 500 })
    }

    return NextResponse.json({ success: true, flyer_id: flyer.id, flyer_type: flyerType })
  } catch (err: any) {
    console.error('generate-flyer error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
