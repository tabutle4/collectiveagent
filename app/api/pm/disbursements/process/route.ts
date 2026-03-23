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

    if (disbursement.payment_status === 'completed') {
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

    // Create Payload payout
    const property = disbursement.managed_properties
    const description = property
      ? `Rent disbursement - ${property.property_address} - ${disbursement.period_month}/${disbursement.period_year}`
      : `Rent disbursement - ${disbursement.period_month}/${disbursement.period_year}`

    const payoutRes = await fetch('https://api.payload.com/payouts/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: disbursement.net_amount.toString(),
        payment_method_id: landlord.payload_payment_method_id,
        description,
      }),
    })

    const payoutData = await payoutRes.json()
    if (!payoutRes.ok) {
      console.error('Failed to create Payload payout:', payoutData)
      return NextResponse.json(
        { error: payoutData.message || 'Failed to process payout' },
        { status: 500 }
      )
    }

    // Update disbursement
    await supabase
      .from('landlord_disbursements')
      .update({
        payload_payout_id: payoutData.id,
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
