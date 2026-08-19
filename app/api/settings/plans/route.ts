import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  getStandardPlanDefaults,
  HARD_FALLBACK,
  type StandardPlanDefaults,
} from '@/lib/documents/plan-defaults'
import {
  STANDARD_BASE_SPLIT,
  type CommissionPlanKey,
} from '@/lib/documents/commission-plan-content'

export const dynamic = 'force-dynamic'

/**
 * Public commission plan summary for the Collective Realty Co. information
 * page. Deliberately mirrors /api/settings/referral: no auth, DB driven,
 * always returns a renderable payload even when the reads fail.
 *
 * Only the three plans the firm publishes are ever returned. commission_plans
 * also holds negotiated and custom rows ('Custom - 90/10 Cap' and similar),
 * and those must never appear on a page a prospect can open.
 *
 * The numbers come from the same source the signed Commission Plan Agreement
 * prints from: STANDARD_BASE_SPLIT for the base split, and company_settings
 * through getStandardPlanDefaults for the cap, post cap split and training
 * fee. commission_plans is used only to override the display name and
 * description, so a marketing figure can never disagree with the figure the
 * prospect signs.
 */

const PUBLISHED_CODES: CommissionPlanKey[] = ['new_agent', 'no_cap', 'cap']

const PLAN_NAMES: Record<CommissionPlanKey, string> = {
  new_agent: 'New Agent Plan',
  no_cap: 'No Cap Plan',
  cap: 'Cap Plan',
}

const PLAN_DESCRIPTIONS: Record<CommissionPlanKey, string> = {
  new_agent:
    'For agents new to the firm with fewer than 5 sales transactions in the last 12 months. Part of the New Agent Training Program.',
  no_cap:
    'A consistently higher split with no cap, so you can focus on growing your business.',
  cap: 'Pay a set amount to the brokerage each cap year, then keep more of every closing after that.',
}

const PLAN_APPLIES_TO: Record<CommissionPlanKey, string> = {
  new_agent: 'Your first sales transactions at the firm',
  no_cap: 'All buyer, commercial, and listing transactions',
  cap: 'All buyer, commercial, and listing transactions',
}

/**
 * Firm standard number of sales transactions on the New Agent Plan before an
 * agent graduates. Matches the default applied in commission-plan-content.ts,
 * where a per agent override may lower or raise it. The published page shows
 * the firm standard only.
 */
const QUALIFYING_TRANSACTIONS = 5

function splitParts(split: string): { agent: number; firm: number } {
  const [agent, firm] = split.split('/').map(part => Number(part.trim()))
  return {
    agent: Number.isFinite(agent) ? agent : 0,
    firm: Number.isFinite(firm) ? firm : 0,
  }
}

function buildPlans(defaults: StandardPlanDefaults, rows: any[]) {
  const postCap = splitParts(defaults.postCapSplit)

  return PUBLISHED_CODES.map(code => {
    const row = rows.find(r => r.code === code)
    const base = splitParts(STANDARD_BASE_SPLIT[code])
    const hasCap = code === 'cap'

    return {
      code,
      name: row?.name || PLAN_NAMES[code],
      description: row?.description || PLAN_DESCRIPTIONS[code],
      applies_to: PLAN_APPLIES_TO[code],
      agent_split: base.agent,
      firm_split: base.firm,
      has_cap: hasCap,
      cap_amount: hasCap ? defaults.capAmount : null,
      post_cap_agent_split: hasCap ? postCap.agent : null,
      post_cap_firm_split: hasCap ? postCap.firm : null,
      training_fee: code === 'new_agent' ? defaults.coachingFee : null,
      qualifying_transactions: code === 'new_agent' ? QUALIFYING_TRANSACTIONS : null,
    }
  })
}

export async function GET() {
  try {
    const defaults = await getStandardPlanDefaults(supabaseAdmin)

    // Names and descriptions only. A failure here still leaves a full page.
    let rows: any[] = []
    try {
      const { data } = await supabaseAdmin
        .from('commission_plans')
        .select('code, name, description')
        .in('code', PUBLISHED_CODES)
      rows = data || []
    } catch (error: any) {
      console.error('Failed to fetch commission plans:', error)
    }

    return NextResponse.json({ success: true, plans: buildPlans(defaults, rows) })
  } catch (error: any) {
    // Unreachable today: both reads are guarded and splitParts is total. Kept
    // so the handler is structurally incapable of returning a 500, matching
    // /api/settings/referral. A public page must always render.
    console.error('Failed to build published plans:', error)
    return NextResponse.json({ success: true, plans: buildPlans(HARD_FALLBACK, []) })
  }
}
