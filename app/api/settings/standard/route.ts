import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select(`
        agency_name,
        agency_email,
        brokerage_address_line1,
        brokerage_address_line2,
        brokerage_city,
        brokerage_state,
        brokerage_zip,
        brokerage_main_email,
        standard_onboarding_fee,
        standard_monthly_fee,
        standard_late_fee,
        board_requirement_days,
        termination_notice_days,
        commission_payment_days
      `)
      .single()

    return NextResponse.json({
      success: true,
      settings: {
        agency_name: settings?.agency_name ?? 'Collective Realty Co.',
        agency_email: settings?.agency_email ?? 'info@collectiverealtyco.com',
        brokerage_address_line1: settings?.brokerage_address_line1 ?? '13201 Northwest Fwy',
        brokerage_address_line2: settings?.brokerage_address_line2 ?? 'Ste 450',
        brokerage_city: settings?.brokerage_city ?? 'Houston',
        brokerage_state: settings?.brokerage_state ?? 'Texas',
        brokerage_zip: settings?.brokerage_zip ?? '77040',
        brokerage_main_email: settings?.brokerage_main_email ?? 'office@collectiverealtyco.com',
        onboarding_fee: settings?.standard_onboarding_fee ?? 399,
        monthly_fee: settings?.standard_monthly_fee ?? 50,
        late_fee: settings?.standard_late_fee ?? 25,
        board_requirement_days: settings?.board_requirement_days ?? 30,
        termination_notice_days: settings?.termination_notice_days ?? 14,
        commission_payment_days: settings?.commission_payment_days ?? 30,
      }
    })
  } catch (error: any) {
    console.error('Failed to fetch standard settings:', error)
    return NextResponse.json({
      success: true,
      settings: {
        agency_name: 'Collective Realty Co.',
        agency_email: 'info@collectiverealtyco.com',
        brokerage_address_line1: '13201 Northwest Fwy',
        brokerage_address_line2: 'Ste 450',
        brokerage_city: 'Houston',
        brokerage_state: 'Texas',
        brokerage_zip: '77040',
        brokerage_main_email: 'office@collectiverealtyco.com',
        onboarding_fee: 399,
        monthly_fee: 50,
        late_fee: 25,
        board_requirement_days: 30,
        termination_notice_days: 14,
        commission_payment_days: 30,
      }
    })
  }
}
