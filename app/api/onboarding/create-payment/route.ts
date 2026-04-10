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

    // Fetch all settings (standard + referral)
    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('standard_onboarding_fee, standard_monthly_fee, referral_annual_fee')
      .single()
    
    const standardOnboardingFee = companySettings?.standard_onboarding_fee ?? 399
    const standardMonthlyFee = companySettings?.standard_monthly_fee ?? 50
    const referralAnnualFee = companySettings?.referral_annual_fee ?? 299

    // Authenticate by campaign_token - include mls_choice to determine agent type
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, payload_payee_id, mls_choice')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'

    // Fetch onboarding session to check for discount
    const { data: session } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('discount_amount')
      .eq('user_id', prospect.id)
      .single()
    
    const discountAmount = session?.discount_amount || 0

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

    const now = new Date()
    let invoiceAmount: number
    let proratedAmount = 0
    let proratedLabel = ''

    // Step 2: Build invoice based on agent type
    const params = new URLSearchParams({
      type: 'bill',
      due_date: now.toISOString().split('T')[0],
      processing_id: process.env.PAYLOAD_PROCESSING_ID!,
      customer_id: payloadCustomerId,
    })

    if (isReferralAgent) {
      // Referral agent: $299 annual fee only, no monthly (minus any discount)
      const finalAmount = Math.max(0, referralAnnualFee - discountAmount)
      const description = discountAmount > 0 
        ? `Referral Collective Annual Membership (${discountAmount >= referralAnnualFee ? 'Promo - Free' : `$${discountAmount} discount applied`})`
        : 'Referral Collective Annual Membership'
      params.append('description', description)
      params.append('items[0][type]', 'Annual Membership Fee')
      params.append('items[0][description]', description)
      params.append('items[0][amount]', finalAmount.toString())
      params.append('items[0][entry_type]', 'charge')
      invoiceAmount = finalAmount
    } else {
      // Standard agent: $399 onboarding + prorated monthly
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const today = now.getDate()
      const remainingDays = daysInMonth - today + 1

      const pad = (n: number) => String(n).padStart(2, '0')
      const yy = String(now.getFullYear()).slice(2)
      const startLabel = `${pad(now.getMonth() + 1)}/${pad(today)}/${yy}`
      const endLabel = `${pad(now.getMonth() + 1)}/${pad(daysInMonth)}/${yy}`
      proratedLabel = `Prorated Monthly Fee - ${startLabel} to ${endLabel}`
      proratedAmount = Math.round((standardMonthlyFee / daysInMonth) * remainingDays * 100) / 100

      params.append('description', 'Onboarding Invoice')
      params.append('items[0][type]', 'Onboarding Fee')
      params.append('items[0][description]', 'Non-Refundable Onboarding Fee')
      params.append('items[0][amount]', standardOnboardingFee.toString())
      params.append('items[0][entry_type]', 'charge')

      if (proratedAmount > 0) {
        params.append('items[1][type]', 'Monthly Fee (Prorated)')
        params.append('items[1][description]', proratedLabel)
        params.append('items[1][amount]', proratedAmount.toString())
        params.append('items[1][entry_type]', 'charge')
      }

      invoiceAmount = standardOnboardingFee + proratedAmount
    }

    // Step 3: Create the invoice
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
    // Referral agents: no auto-billing (they pay annually, not monthly)
    // Standard agents: offer auto-billing for monthly fees
    const checkoutIntent: any = {
      checkout_plugin: {
        amount: invoiceAmount,
        description: isReferralAgent ? 'Referral Collective Annual Membership' : 'Onboarding Invoice',
        conv_fee: true,
        card_payments: true,
        bank_account_payments: true,
      },
    }

    // Only show auto-billing toggle for standard agents (who have monthly fees)
    if (!isReferralAgent) {
      checkoutIntent.checkout_plugin.auto_billing_toggle = true
      checkoutIntent.checkout_plugin.keep_active_toggle = true
    }

    const tokenRes = await fetch('https://api.payload.com/access_tokens', {
      method: 'POST',
      headers: {
        Authorization: plAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'client',
        intent: checkoutIntent,
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
      is_referral: isReferralAgent,
    })
  } catch (error: any) {
    console.error('Onboarding create-payment error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}