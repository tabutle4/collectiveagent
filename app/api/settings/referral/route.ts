import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  REFERRAL_DISCOUNT_COLUMNS,
  ReferralDiscount,
  ResolvedDiscount,
  resolveReferralDiscount,
} from '@/lib/referralDiscounts'

export const dynamic = 'force-dynamic'

function publicShape(resolved: ResolvedDiscount | null) {
  if (!resolved) return null
  return {
    name: resolved.name,
    amount_off: resolved.amountOff,
    final_price: resolved.finalPrice,
  }
}

export async function GET() {
  try {
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select(`
        referral_annual_fee,
        referral_split_apartment,
        referral_split_internal,
        referral_split_external,
        referral_brokerage_name,
        referral_termination_notice_days
      `)
      .single()

    const { data: discountRows } = await supabaseAdmin
      .from('referral_discounts')
      .select(REFERRAL_DISCOUNT_COLUMNS)
      .eq('is_active', true)

    // Number() because referral_annual_fee is a numeric column, and the
    // onboarding page calls toFixed on this value.
    const annualFee = Number(settings?.referral_annual_fee ?? 299)
    const discounts = (discountRows || []) as unknown as ReferralDiscount[]

    // Both audiences are resolved here and the page picks the one that matches
    // who is looking. The figure that is actually billed is resolved again
    // server side from the same table by the same function, so what is shown
    // and what is charged cannot drift apart.
    const conversion = resolveReferralDiscount(discounts, 'crc_conversion', annualFee)
    const outside = resolveReferralDiscount(discounts, 'outside_only', annualFee)

    return NextResponse.json({
      success: true,
      settings: {
        annual_fee: annualFee,
        split_apartment: settings?.referral_split_apartment ?? 85,
        split_internal: settings?.referral_split_internal ?? 90,
        split_external: settings?.referral_split_external ?? 88,
        brokerage_name: settings?.referral_brokerage_name ?? 'Referral Collective',
        termination_notice_days: Number(settings?.referral_termination_notice_days ?? 14),
        discount_for_conversion: publicShape(conversion),
        discount_for_outside: publicShape(outside),
      },
    })
  } catch (error: any) {
    console.error('Failed to fetch referral settings:', error)
    return NextResponse.json({
      success: true,
      settings: {
        annual_fee: 299,
        split_apartment: 85,
        split_internal: 90,
        split_external: 88,
        brokerage_name: 'Referral Collective',
        termination_notice_days: 14,
        discount_for_conversion: null,
        discount_for_outside: null,
      },
    })
  }
}
