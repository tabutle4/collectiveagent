import { supabaseAdmin } from '@/lib/supabase'
import { 
  ReferralICASettings, 
  DEFAULT_REFERRAL_SETTINGS 
} from './referral-ica-content'

// Fetch referral ICA settings from company_settings
export async function getReferralSettings(): Promise<ReferralICASettings> {
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select(`
      referral_annual_fee,
      referral_split_apartment,
      referral_split_internal,
      referral_split_external,
      referral_brokerage_name,
      referral_brokerage_email,
      referral_termination_notice_days,
      referral_payment_terms_days,
      referral_refund_period_days,
      brokerage_address_line1,
      brokerage_address_line2,
      brokerage_city,
      brokerage_state,
      brokerage_zip,
      brokerage_main_email
    `)
    .single()

  if (!settings) {
    return DEFAULT_REFERRAL_SETTINGS
  }

  return {
    referral_annual_fee: settings.referral_annual_fee ?? DEFAULT_REFERRAL_SETTINGS.referral_annual_fee,
    referral_split_apartment: settings.referral_split_apartment ?? DEFAULT_REFERRAL_SETTINGS.referral_split_apartment,
    referral_split_internal: settings.referral_split_internal ?? DEFAULT_REFERRAL_SETTINGS.referral_split_internal,
    referral_split_external: settings.referral_split_external ?? DEFAULT_REFERRAL_SETTINGS.referral_split_external,
    referral_brokerage_name: settings.referral_brokerage_name ?? DEFAULT_REFERRAL_SETTINGS.referral_brokerage_name,
    referral_brokerage_email: settings.referral_brokerage_email ?? DEFAULT_REFERRAL_SETTINGS.referral_brokerage_email,
    referral_termination_notice_days: settings.referral_termination_notice_days ?? DEFAULT_REFERRAL_SETTINGS.referral_termination_notice_days,
    referral_payment_terms_days: settings.referral_payment_terms_days ?? DEFAULT_REFERRAL_SETTINGS.referral_payment_terms_days,
    referral_refund_period_days: settings.referral_refund_period_days ?? DEFAULT_REFERRAL_SETTINGS.referral_refund_period_days,
    brokerage_address_line1: settings.brokerage_address_line1 ?? DEFAULT_REFERRAL_SETTINGS.brokerage_address_line1,
    brokerage_address_line2: settings.brokerage_address_line2 ?? DEFAULT_REFERRAL_SETTINGS.brokerage_address_line2,
    brokerage_city: settings.brokerage_city ?? DEFAULT_REFERRAL_SETTINGS.brokerage_city,
    brokerage_state: settings.brokerage_state ?? DEFAULT_REFERRAL_SETTINGS.brokerage_state,
    brokerage_zip: settings.brokerage_zip ?? DEFAULT_REFERRAL_SETTINGS.brokerage_zip,
    brokerage_main_email: settings.brokerage_main_email ?? DEFAULT_REFERRAL_SETTINGS.brokerage_main_email,
  }
}

