import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { disbursement_id } = await request.json()

    if (!disbursement_id) {
      return NextResponse.json({ error: 'Disbursement ID is required' }, { status: 400 })
    }

    // Fetch disbursement with landlord info
    const { data: disbursement, error: fetchError } = await supabase
      .from('landlord_disbursements')
      .select(`
        *,
        landlords(id, first_name, last_name, email, payload_payment_method_id, bank_status),
        managed_properties(id, property_address, city)
      `)
      .eq('id', disbursement_id)
      .single()

    if (fetchError || !disbursement) {
      return NextResponse.json({ error: 'Disbursement not found' }, { status: 404 })
    }

    // Block re-processing of any disbursement that's already settled or
    // in flight. 'completed' = ACH done; 'paid' = manually marked paid
    // (Zelle/check/ACH outside Payload); 'processing' = Payload ACH currently
    // in flight. All three mean Payload should not initiate another payout.
    if (['completed', 'paid', 'processing'].includes(disbursement.payment_status)) {
      return NextResponse.json({ error: 'Disbursement already processed' }, { status: 400 })
    }

    const landlord = disbursement.landlords

    // Verify landlord has connected bank account
    if (!landlord.payload_payment_method_id) {
      return NextResponse.json(
        { error: 'Landlord has not connected bank account. Send bank activation first.' },
        { status: 400 }
      )
    }

    if (landlord.bank_status !== 'connected') {
      return NextResponse.json(
        { error: 'Landlord bank account is not verified yet.' },
        { status: 400 }
      )
    }

    // Create the Payload payout. Payload's documented way to send money is
    // POST /transactions with type=credit (docs.payload.com/apis/payouts/);
    // there is no /payouts/ path in the API this app calls. The processing
    // account is passed explicitly - the same PM account the PM module's
    // invoice and payment-link routes already use - so rent money can never
    // silently draw from the account default.
    const property = disbursement.managed_properties
    const description = property
      ? `Rent disbursement - ${property.property_address} - ${disbursement.period_month}/${disbursement.period_year}`
      : `Rent disbursement - ${disbursement.period_month}/${disbursement.period_year}`

    // No fallback. PAYLOAD_PROCESSING_ID is the account that RECEIVES agent
    // invoices, so falling back to it would draw a landlord disbursement from
    // the wrong account whenever the PM variable was unset - silently, and
    // with real money. The agent payout path has no fallback for the same
    // reason. Unset means stop.
    const pmProcessingId = process.env.PAYLOAD_PM_PROCESSING_ID
    if (!pmProcessingId) {
      return NextResponse.json(
        {
          error:
            'PM payout processing account is not configured (PAYLOAD_PM_PROCESSING_ID).',
        },
        { status: 500 }
      )
    }

    // `receipts` is Payload's documented optional {name, email} array - "The
    // email that will receive the receipt." Nested list-of-objects form
    // encoding is the documented syntax (docs.payload.com/apis/api-design/).
    //
    // Kept for the same reason as the agent payout path (see the long note in
    // lib/payload/processPayout.ts): Payload's docs never promise a credit
    // recipient is emailed when this is omitted, the only automatic receipt
    // they describe is an account setting nobody has confirmed is on, and a
    // landlord who is never told their rent disbursement went out will simply
    // call the office. A duplicate receipt is the cheaper failure.
    const disbursementBody: Record<string, string> = {
      type: 'credit',
      amount: parseFloat(String(disbursement.net_amount)).toFixed(2),
      payment_method_id: landlord.payload_payment_method_id,
      processing_id: pmProcessingId,
      description,
    }
    if (landlord.email) {
      disbursementBody['receipts[0][email]'] = landlord.email
      const landlordName = `${landlord.first_name || ''} ${landlord.last_name || ''}`.trim()
      if (landlordName) disbursementBody['receipts[0][name]'] = landlordName
    }

    const payoutRes = await fetch('https://api.payload.com/transactions', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(disbursementBody),
    })

    // The response is a Transaction object (txn_... id). Payload's error
    // body carries error_description, not message.
    const payoutData = await payoutRes.json().catch(() => null)
    if (!payoutRes.ok) {
      console.error('Failed to create Payload payout:', payoutData)
      return NextResponse.json(
        { error: payoutData?.error_description || payoutData?.message || 'Failed to process payout' },
        { status: 500 }
      )
    }

    // Update disbursement
    await supabase
      .from('landlord_disbursements')
      .update({
        payload_payout_id: payoutData?.id || null,
        payment_status: 'processing',
        payment_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', disbursement_id)

    console.log(`Payout initiated for ${landlord.email}: $${disbursement.net_amount}`)

    return NextResponse.json({
      success: true,
      payout_id: payoutData.id,
      amount: disbursement.net_amount,
    })
  } catch (error: any) {
    console.error('Error processing disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
