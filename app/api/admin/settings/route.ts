import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET - Fetch all settings
export async function GET(request: NextRequest) {
  try {
    // Require admin permission
    const authResult = await requirePermission(request, 'can_manage_settings')
    if ('error' in authResult) {
      // Fall back to broker role check
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Fetch company settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .select('*')
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Settings fetch error:', settingsError)
    }

    // Fetch commission plans
    const { data: plans, error: plansError } = await supabaseAdmin
      .from('commission_plans')
      .select('*')
      .order('name', { ascending: true })

    if (plansError) {
      console.error('Plans fetch error:', plansError)
    }

    // Fetch commission rules
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from('commission_rules')
      .select('*')
      .order('rule_key', { ascending: true })

    if (rulesError) {
      console.error('Rules fetch error:', rulesError)
    }

    // Build default settings if none exist
    const defaultSettings = {
      // Brokerage
      agency_name: 'Collective Realty Co.',
      agency_email: 'info@collectiverealtyco.com',
      brokerage_address_line1: '13201 Northwest Fwy',
      brokerage_address_line2: 'Ste 450',
      brokerage_city: 'Houston',
      brokerage_state: 'Texas',
      brokerage_zip: '77040',
      brokerage_main_email: 'info@collectiverealtyco.com',
      // Standard Agent
      standard_onboarding_fee: 399,
      standard_monthly_fee: 50,
      standard_late_fee: 25,
      board_requirement_days: 30,
      termination_notice_days: 14,
      commission_payment_days: 30,
      // Referral Agent
      referral_annual_fee: 299,
      referral_split_apartment: 85,
      referral_split_internal: 90,
      referral_split_external: 88,
      referral_brokerage_name: 'Referral Collective',
      referral_brokerage_email: 'referrals@collectiverealtyco.com',
      referral_termination_notice_days: 14,
      referral_payment_terms_days: 30,
      referral_refund_period_days: 90,
      referral_conversion_free_until: null,
      // Apartment Locating
      apartment_invoice_fee: 100,
    }

    return NextResponse.json({
      success: true,
      settings: settings || defaultSettings,
      plans: plans || [],
      rules: rules || [],
    })
  } catch (error: any) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch settings' }, { status: 500 })
  }
}

// POST - Update company settings
export async function POST(request: NextRequest) {
  try {
    // Require admin permission
    const authResult = await requirePermission(request, 'can_manage_settings')
    if ('error' in authResult) {
      // Fall back to broker role check
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { settings } = await request.json()

    if (!settings) {
      return NextResponse.json({ error: 'Settings are required' }, { status: 400 })
    }

    // Check if settings row exists
    const { data: existing } = await supabaseAdmin
      .from('company_settings')
      .select('id')
      .single()

    if (existing) {
      // Update existing
      const { error } = await supabaseAdmin
        .from('company_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (error) {
        throw error
      }
    } else {
      // Insert new
      const { error } = await supabaseAdmin
        .from('company_settings')
        .insert({
          ...settings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (error) {
        throw error
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Settings POST error:', error)
    return NextResponse.json({ error: error.message || 'Failed to save settings' }, { status: 500 })
  }
}
