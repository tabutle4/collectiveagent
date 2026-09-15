import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createAgentInvoice } from '@/lib/payload/agentInvoice'

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

    // Authenticate by campaign_token
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, payload_payee_id, mls_choice, monthly_fee_waived')
      .eq('campaign_token', token)
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

    // Step 1.5: Close any existing unpaid invoices that contain an onboarding
    // or annual membership line item for this customer. Each visit to the
    // token page generates a freshly prorated invoice, so any prior unpaid
    // one must be cancelled to avoid leaving duplicates that could be
    // auto-paid later. Per Payload's invoice API, the terminal cancellation
    // status is 'closed' (not 'voided' - that value only applies to
    // transactions). If closing any single invoice fails, abort here so the
    // customer never sees a state where two unpaid invoices coexist.
    try {
      const listRes = await fetch(
        `https://api.payload.com/invoices/?customer_id=${payloadCustomerId}&status=unpaid&limit=50`,
        { headers: { Authorization: plAuth() } }
      )
      const listData = await listRes.json()
      const onboardingItemTypes = new Set([
        'Onboarding Fee',
        'Monthly Fee (Prorated)',
        'Annual Membership Fee',
      ])
      const stale = (listData.values || []).filter((inv: any) =>
        (inv.items || []).some((item: any) => onboardingItemTypes.has(item?.type))
      )
      for (const inv of stale) {
        // 1. Submit the close
        const closeRes = await fetch(`https://api.payload.com/invoices/${inv.id}`, {
          method: 'PUT',
          headers: {
            Authorization: plAuth(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ status: 'closed' }),
        })
        if (!closeRes.ok) {
          const errBody = await closeRes.json().catch(() => null)
          console.error('Failed to submit close for stale onboarding invoice:', inv.id, errBody)
          return NextResponse.json(
            {
              error:
                'Could not clear a previous unpaid onboarding invoice. Please contact the office.',
            },
            { status: 500 }
          )
        }

        // 2. Verify the close took effect by re-fetching the invoice and
        // confirming its status is closed. A 200 on the PUT alone is not
        // enough; we want a positive confirmation before creating a new
        // invoice that could otherwise coexist with a still-unpaid duplicate.
        const verifyRes = await fetch(`https://api.payload.com/invoices/${inv.id}`, {
          headers: { Authorization: plAuth() },
        })
        const verifyData = await verifyRes.json().catch(() => null)
        if (!verifyRes.ok || verifyData?.status !== 'closed') {
          console.error(
            'Could not confirm closed status for stale onboarding invoice:',
            inv.id,
            'verify_ok:',
            verifyRes.ok,
            'verify_status:',
            verifyData?.status,
            'response:',
            verifyData
          )
          return NextResponse.json(
            {
              error:
                'Could not clear a previous unpaid onboarding invoice. Please contact the office.',
            },
            { status: 500 }
          )
        }
      }
    } catch (err) {
      console.error('Error clearing stale onboarding invoices:', err)
      return NextResponse.json(
        {
          error: 'Could not check for previous onboarding invoices. Please try again in a moment.',
        },
        { status: 500 }
      )
    }

    // Step 2: Build invoice based on agent type.
    // Referral Collective is a separate company from Collective Realty Co., so
    // its membership fees have to settle on the RC processing account. There is
    // deliberately NO fallback to the CRC account: routing RC money into CRC
    // commingles two entities' funds, which is worse than failing the payment
    // and telling somebody why.
    const processingId = isReferralAgent
      ? process.env.PAYLOAD_RC_PROCESSING_ID
      : process.env.PAYLOAD_PROCESSING_ID
    if (!processingId) {
      const entity = isReferralAgent ? 'Referral Collective' : 'Collective Realty Co.'
      console.error(`Missing Payload processing account for ${entity}`)
      return NextResponse.json(
        { error: `Payment account for ${entity} is not configured. Please contact office@collectiverealtyco.com.` },
        { status: 503 }
      )
    }
    const params = new URLSearchParams({
      type: 'bill',
      due_date: now.toISOString().split('T')[0],
      processing_id: processingId,
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
      // Agents with users.monthly_fee_waived set pay the onboarding fee only.
      // Leaving proratedAmount at 0 skips the line item below and keeps
      // invoiceAmount at the onboarding fee.
      if (!prospect.monthly_fee_waived) {
        proratedLabel = `Prorated Monthly Fee - ${startLabel} to ${endLabel}`
        proratedAmount = Math.round((standardMonthlyFee / daysInMonth) * remainingDays * 100) / 100
      }

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

    // Step 3: Create the invoice.
    //
    // Never collectable by autopay. This is the same Payload customer the
    // monthly fee is billed to, so once that agent turns autopay on, an unpaid
    // join invoice still sitting on the account would otherwise be fair game
    // for automatic collection.
    const created = await createAgentInvoice(params, { autopayAllowed: false })

    if (!created.ok) {
      console.error('Payload invoice creation failed:', created.error)
      return NextResponse.json(
        { error: created.error?.message || 'Failed to create invoice' },
        { status: 500 }
      )
    }

    const invoiceData = created.invoice
    if (!created.autopayConfirmed) {
      console.error(
        'Onboarding invoice created but could not be confirmed as exempt from autopay:',
        invoiceData?.id
      )
    }

    const invoiceId = invoiceData.id

    // Step 4: Get checkout token. Onboarding payment is a one-time charge for
    // both standard and referral agents. No autopay setup here. Autopay opt-in
    // happens later on the first regular monthly invoice payment link, which
    // uses Payload's standard checkout that already has the toggle built in.
    const checkoutIntent: any = {
      checkout_plugin: {
        amount: invoiceAmount,
        description: isReferralAgent ? 'Referral Collective Annual Membership' : 'Onboarding Invoice',
        conv_fee: true,
        card_payments: true,
        bank_account_payments: true,
      },
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