import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
        referral_conversion_discount,
        referral_conversion_free_until
      `)
      .single()

    // Check if promo is active
    const now = new Date()
    const promoEnd = settings?.referral_conversion_free_until 
      ? new Date(settings.referral_conversion_free_until) 
      : null
    const promoActive = promoEnd && now <= promoEnd && (settings?.referral_conversion_discount || 0) > 0

    return NextResponse.json({
      success: true,
      settings: {
        annual_fee: settings?.referral_annual_fee ?? 299,
        split_apartment: settings?.referral_split_apartment ?? 85,
        split_internal: settings?.referral_split_internal ?? 90,
        split_external: settings?.referral_split_external ?? 88,
        brokerage_name: settings?.referral_brokerage_name ?? 'Referral Collective',
        promo_discount: promoActive ? settings?.referral_conversion_discount : 0,
        promo_active: promoActive,
      }
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
        promo_discount: 0,
        promo_active: false,
      }
    })
  }
}
