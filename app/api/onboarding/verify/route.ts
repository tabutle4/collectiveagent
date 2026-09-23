import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { planCredits, priceFeeForUser } from '@/lib/fees'
import {
  REFERRAL_DISCOUNT_COLUMNS,
  ReferralDiscount,
  resolveReferralDiscount,
} from '@/lib/referralDiscounts'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find user by campaign_token (allow prospect or active for agents mid-onboarding)
    const { data: prospect, error } = await supabase
      .from('users')
      .select('*')
      .eq('campaign_token', token)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    // Get or create onboarding session
    let { data: session } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', prospect.id)
      .single()

    if (!session) {
      const { data: newSession } = await supabase
        .from('onboarding_sessions')
        .insert({
          user_id: prospect.id,
          current_step: 1,
          reminder_count: 0,
        })
        .select()
        .single()
      session = newSession
    }

    // What the onboarding page should show for the membership fee. A
    // conversion keeps the discount snapshotted when it started; anyone
    // joining Referral Collective from outside is priced against whatever is
    // running today, resolved by the same function the payment route uses.
    let resolvedDiscount: { name: string; amount_off: number } | null = null

    if (prospect.mls_choice === 'Referral Collective (No MLS)') {
      if (session?.previous_mls_choice) {
        const snapshot = Number(session.discount_amount || 0)
        if (snapshot > 0) {
          resolvedDiscount = {
            name: session.discount_name || 'Promotion',
            amount_off: snapshot,
          }
        }
      } else if (session?.payment_waived) {
        // Already waived by a full discount on an earlier visit. The waiver
        // sticks, so this reports the snapshot rather than re-pricing, and an
        // agent who was told the year is free is never billed later because
        // the promo ended in the meantime.
        resolvedDiscount = {
          name: session.discount_name || 'Promotion',
          amount_off: Number(session.discount_amount || 0),
        }
      } else {
        const { data: companySettings } = await supabase
          .from('company_settings')
          .select('referral_annual_fee')
          .single()

        const { data: discountRows } = await supabase
          .from('referral_discounts')
          .select(REFERRAL_DISCOUNT_COLUMNS)
          .eq('is_active', true)

        const annualFee = Number(companySettings?.referral_annual_fee || 299)
        const resolved = resolveReferralDiscount(
          (discountRows || []) as unknown as ReferralDiscount[],
          'outside_only',
          annualFee
        )

        if (resolved) {
          resolvedDiscount = { name: resolved.name, amount_off: resolved.amountOff }

          // A discount that covers the whole fee means there is nothing to
          // charge, so the payment step is completed here rather than sending
          // the agent to a zero dollar checkout. This mirrors what
          // convert-to-referral already does for a fully discounted CRC
          // conversion, and it is what drives the "Fee Waived" panel.
          //
          // Only ever stamped once, and never over a payment already made.
          if (resolved.finalPrice <= 0 && !session?.payment_waived && !session?.step_2_completed_at) {
            const waivedAt = new Date().toISOString()
            const { data: waived } = await supabase
              .from('onboarding_sessions')
              .update({
                payment_waived: true,
                step_2_completed_at: waivedAt,
                discount_amount: resolved.amountOff,
                discount_name: resolved.name,
                current_step: Math.max(Number(session?.current_step || 1), 2),
                updated_at: waivedAt,
              })
              .eq('user_id', prospect.id)
              .select()
              .single()

            if (waived) session = waived
          }
        }
      }
    }

    // The numbers the payment step shows. The block above still owns the
    // referral waiver; this is what the screen renders, for either agent type,
    // and it goes through the same resolver the payment route bills from so the
    // page and the invoice cannot disagree.
    const { data: feeSettings } = await supabase
      .from('company_settings')
      .select('standard_onboarding_fee, standard_monthly_fee, referral_annual_fee')
      .single()

    const isReferralProspect = prospect.mls_choice === 'Referral Collective (No MLS)'
    const joinFeeType = isReferralProspect ? 'rc_annual' : 'crc_onboarding'
    const joinBaseFee = isReferralProspect
      ? Number(feeSettings?.referral_annual_fee ?? 299)
      : Number(feeSettings?.standard_onboarding_fee ?? 399)
    const pricingAudience = session?.previous_mls_choice ? 'crc_conversion' : 'outside_only'

    const joinPricing = await priceFeeForUser({
      userId: prospect.id,
      feeType: joinFeeType,
      baseFee: joinBaseFee,
      audience: pricingAudience,
      user: prospect,
      applyCredits: false,
    })

    // A conversion is priced from its snapshot, not from today's promo.
    let joinPrice = joinPricing.price
    let joinDiscountName = joinPricing.discount?.name || null
    let joinDiscountAmount = joinPricing.discount?.amountOff || 0
    // Same condition as create-payment, deliberately. A conversion is priced
    // from its snapshot even when that snapshot is zero, so the number on the
    // screen is the number on the invoice.
    if (
      isReferralProspect &&
      joinPricing.standingRate === null &&
      (session?.previous_mls_choice || session?.payment_waived)
    ) {
      joinDiscountAmount = Number(session.discount_amount || 0)
      joinDiscountName = session.discount_name || null
      joinPrice = Math.max(0, Math.round((joinBaseFee - joinDiscountAmount) * 100) / 100)
    }

    const joinCredits = await planCredits(prospect.id, joinFeeType, joinPrice)

    const monthlyPricing =
      !isReferralProspect && !prospect.monthly_fee_waived
        ? await priceFeeForUser({
            userId: prospect.id,
            feeType: 'crc_monthly',
            baseFee: Number(feeSettings?.standard_monthly_fee ?? 50),
            audience: pricingAudience,
            user: prospect,
            applyCredits: false,
          })
        : null

    // Don't return sensitive fields
    const { password_hash, ...safeProspect } = prospect

    return NextResponse.json({
      prospect: safeProspect,
      session,
      discount: resolvedDiscount,
      pricing: {
        fee_type: joinFeeType,
        base_fee: joinBaseFee,
        standing_rate: joinPricing.standingRate,
        discount_name: joinDiscountName,
        discount_amount: joinDiscountAmount,
        credit_applied: joinCredits.creditApplied,
        amount_due: joinCredits.amountDue,
        monthly: monthlyPricing
          ? {
              base_fee: monthlyPricing.baseFee,
              price: monthlyPricing.price,
              standing_rate: monthlyPricing.standingRate,
              discount_name: monthlyPricing.discount?.name || null,
              discount_amount: monthlyPricing.discount?.amountOff || 0,
            }
          : null,
      },
    })
  } catch (error: any) {
    console.error('Onboarding verify error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
