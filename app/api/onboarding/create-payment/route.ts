import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const plAuth = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, payload_payee_id')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    // Step 1: Create Payload customer if they don't have one yet
    let payloadCustomerId = prospect.payload_payee_id

    if (!payloadCustomerId) {
      const customerRes = await fetch('https://api.payload.com/customers/', {
        method: 'POST',
        headers: {
          Authorization: plAuth(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: `${prospect.first_name} ${prospect.last_name}`.trim(),
          email: prospect.email,
        }),
      })

      const customerData = await customerRes.json()
      if (!customerRes.ok) {
        console.error('Payload customer creation failed:', customerData)
        return NextResponse.json(
          { error: customerData.message || 'Failed to create Payload account' },
          { status: 500 }
        )
      }

      payloadCustomerId = customerData.id

      // Save payload_payee_id to user record
      await supabaseAdmin
        .from('users')
        .update({ payload_payee_id: payloadCustomerId })
        .eq('id', prospect.id)
    }

    // Step 2: Calculate prorated fee with date range label
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const today = now.getDate()
    const remainingDays = daysInMonth - today + 1

    // Start = today, End = last day of month
    const pad = (n: number) => String(n).padStart(2, '0')
    const yy = String(now.getFullYear()).slice(2)
    const startLabel = `${pad(now.getMonth() + 1)}/${pad(today)}/${yy}`
    const endLabel = `${pad(now.getMonth() + 1)}/${pad(daysInMonth)}/${yy}`
    const proratedLabel = `Prorated Monthly Fee - ${startLabel} to ${endLabel}`

    const proratedAmount = Math.round((50 / daysInMonth) * remainingDays * 100) / 100

    // Step 3: Create the invoice
    const params = new URLSearchParams({
      type: 'bill',
      due_date: now.toISOString().split('T')[0],
      processing_id: process.env.PAYLOAD_PROCESSING_ID!,
      customer_id: payloadCustomerId,
      description: 'Onboarding Invoice',
      'items[0][type]': 'Onboarding Fee',
      'items[0][description]': 'Non-Refundable Onboarding Fee',
      'items[0][amount]': '399',
      'items[0][entry_type]': 'charge',
    })

    if (proratedAmount > 0) {
      params.append('items[1][type]', 'Monthly Fee (Prorated)')
      params.append('items[1][description]', proratedLabel)
      params.append('items[1][amount]', proratedAmount.toString())
      params.append('items[1][entry_type]', 'charge')
    }

    const invoiceRes = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        Authorization: plAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const invoiceData = await invoiceRes.json()
    if (!invoiceRes.ok) {
      console.error('Payload invoice creation failed:', invoiceData)
      return NextResponse.json(
        { error: invoiceData.message || 'Failed to create invoice' },
        { status: 500 }
      )
    }

    const invoiceId = invoiceData.id

    // Step 4: Get checkout token
    const tokenRes = await fetch('https://api.payload.com/access_tokens', {
      method: 'POST',
      headers: {
        Authorization: plAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'client',
        intent: {
  checkout_plugin: {
    amount: 399 + proratedAmount,
    description: 'Onboarding Invoice',
            conv_fee: true,
            auto_billing_toggle: true,
            keep_active_toggle: true,
            card_payments: true,
            bank_account_payments: true,
          },
        },
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('Payload checkout token failed:', tokenData)
      return NextResponse.json(
        { error: tokenData.message || 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      client_token: tokenData.id,
      invoice_id: invoiceId,
      prorated_amount: proratedAmount,
      prorated_label: proratedLabel,
    })
  } catch (error: any) {
    console.error('Onboarding create-payment error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}