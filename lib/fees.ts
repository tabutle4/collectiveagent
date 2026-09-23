/**
 * What one agent actually owes for one fee.
 *
 * Three things can move a price, and they are applied in this order:
 *
 *   1. The standard fee from company_settings.
 *   2. A standing rate on the agent's own record, if one is set. This REPLACES
 *      the standard fee and suppresses any running promo - a negotiated price
 *      is the price, and a promo does not come off it. Stacking was considered
 *      and rejected: it makes two agents on the same standing rate pay
 *      different amounts depending on the month.
 *   3. Otherwise, the best running promo for that fee (lib/referralDiscounts).
 *
 * Credits come off whatever is left, last, and are the only part that is
 * consumed - a credit is money already collected or owed back, so it is spent
 * once and recorded against the invoice that spent it.
 *
 * Every route that bills an agent prices through here, so the number on the
 * onboarding screen, the number in the Payload invoice and the number in the
 * settings preview cannot drift apart.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { allocateCredits, CreditPlan, money } from '@/lib/feeMath'
import {
  FeeType,
  PricingAudience,
  ReferralDiscount,
  REFERRAL_DISCOUNT_COLUMNS,
  ResolvedDiscount,
  resolveReferralDiscount,
} from '@/lib/referralDiscounts'

/** users column holding the standing rate for each fee. */
export const FEE_OVERRIDE_COLUMNS: Record<FeeType, string> = {
  rc_annual: 'rc_annual_fee_override',
  crc_onboarding: 'onboarding_fee_override',
  crc_monthly: 'monthly_fee_override',
}

export interface OpenCredit {
  id: string
  amount: number
  remaining: number
  note: string | null
}

export interface AgentPricing {
  feeType: FeeType
  /** The standard fee everyone else pays. */
  baseFee: number
  /** The agent's standing rate, when one is set. Null means standard. */
  standingRate: number | null
  /** The promo that applied, or null. Never set when a standing rate is. */
  discount: ResolvedDiscount | null
  /** Price after standing rate or promo, before credits. */
  price: number
  /** Dollars of credit that would be spent on this charge. */
  creditApplied: number
  /** What to actually bill. */
  amountDue: number
  /** The credit rows behind creditApplied, oldest first. */
  creditsUsed: CreditPlan['creditsUsed']
}

/** A standing rate is any non-null value, including zero (a free agent). */
function readStandingRate(user: Record<string, any> | null, feeType: FeeType): number | null {
  if (!user) return null
  const raw = user[FEE_OVERRIDE_COLUMNS[feeType]]
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

/**
 * Promos a first-invoice-only rule has already spent for this agent. Only
 * monthly promos can be first-invoice-only, but the lookup is unconditional so
 * the rule keeps working if that ever changes.
 */
async function spentDiscountIds(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('agent_discount_uses')
    .select('discount_id')
    .eq('user_id', userId)
  return new Set((data || []).map((row: any) => row.discount_id))
}

async function openCredits(userId: string, feeType: FeeType): Promise<OpenCredit[]> {
  const { data } = await supabaseAdmin
    .from('agent_fee_credits')
    .select('id, amount, remaining, note')
    .eq('user_id', userId)
    .eq('fee_type', feeType)
    .eq('is_void', false)
    .gt('remaining', 0)
    .order('created_at', { ascending: true })

  return (data || []).map((row: any) => ({
    id: row.id,
    amount: money(row.amount),
    remaining: money(row.remaining),
    note: row.note ?? null,
  }))
}

/**
 * Price one fee for one agent.
 *
 * `applyCredits` false prices the charge without planning any credit spend,
 * which is what a preview screen wants when it is only showing a rate.
 */
export async function priceFeeForUser(params: {
  userId: string
  feeType: FeeType
  baseFee: number
  audience?: PricingAudience
  user?: Record<string, any> | null
  now?: Date
  applyCredits?: boolean
}): Promise<AgentPricing> {
  const {
    userId,
    feeType,
    baseFee: rawBaseFee,
    audience = 'outside_only',
    now = new Date(),
    applyCredits = true,
  } = params

  const baseFee = money(rawBaseFee)

  let user = params.user ?? null
  if (!user) {
    const { data } = await supabaseAdmin
      .from('users')
      .select(`id, ${Object.values(FEE_OVERRIDE_COLUMNS).join(', ')}`)
      .eq('id', userId)
      .maybeSingle()
    user = data as Record<string, any> | null
  }

  const standingRate = readStandingRate(user, feeType)

  let discount: ResolvedDiscount | null = null
  let price = baseFee

  if (standingRate !== null) {
    // A negotiated rate is the price. No promo on top - see the file header.
    price = standingRate
  } else {
    const { data: discountRows } = await supabaseAdmin
      .from('referral_discounts')
      .select(REFERRAL_DISCOUNT_COLUMNS)
      .eq('is_active', true)

    const rows = (discountRows || []) as unknown as ReferralDiscount[]
    const alreadySpent = rows.some(row => row.first_invoice_only)
      ? await spentDiscountIds(userId)
      : new Set<string>()

    const excludeDiscountIds = new Set(
      rows.filter(row => row.first_invoice_only && alreadySpent.has(row.id)).map(row => row.id)
    )

    discount = resolveReferralDiscount(rows, audience, baseFee, now, feeType, {
      excludeDiscountIds,
    })
    if (discount) price = discount.finalPrice
  }

  price = Math.max(0, money(price))

  const plan = applyCredits
    ? await planCredits(userId, feeType, price)
    : { creditApplied: 0, creditsUsed: [], amountDue: price }

  return {
    feeType,
    baseFee,
    standingRate,
    discount,
    price,
    creditApplied: plan.creditApplied,
    amountDue: plan.amountDue,
    creditsUsed: plan.creditsUsed,
  }
}

/**
 * Which credits would pay for a charge of this size, oldest first. Nothing is
 * written here - a plan is only spent by commitPricing, once the charge exists.
 *
 * Exported because a caller that works out its own price (the onboarding route
 * honours a discount snapshotted when a conversion started) still needs credits
 * applied the same way.
 */
export async function planCredits(
  userId: string,
  feeType: FeeType,
  price: number
): Promise<Pick<AgentPricing, 'creditApplied' | 'amountDue' | 'creditsUsed'>> {
  const target = Math.max(0, money(price))
  if (target <= 0) return { creditApplied: 0, amountDue: 0, creditsUsed: [] }
  return allocateCredits(await openCredits(userId, feeType), target)
}

/**
 * Spend the credits a pricing call planned, and record a first-invoice-only
 * promo as used. Call this only once the charge it paid for actually exists,
 * so a failed invoice does not burn someone's credit.
 *
 * `reference` identifies the charge - 'invoice:<payload id>' or
 * 'monthly:<Month Year>'. Every spend is written to agent_fee_credit_spends
 * first, which has a unique constraint on (credit_id, reference): running this
 * twice for the same charge inserts nothing the second time and leaves the
 * balance alone. That is what makes a cron re-run safe, and it is what lets
 * releaseCreditsFor put a credit back when its charge is cancelled.
 *
 * The balance write is guarded on the value the plan read, so two requests
 * planning the same credit cannot both decrement it.
 */
export async function commitPricing(
  pricing: AgentPricing,
  userId: string,
  reference: string
): Promise<void> {
  for (const credit of pricing.creditsUsed) {
    // Read, then insert, then decrement. The read handles the ordinary repeat
    // (a cron re-run); the unique constraint handles the race the read cannot
    // see, and a failed insert skips the decrement. Both orderings fail toward
    // not spending the credit twice, which is the safe direction.
    //
    // Deliberately not upsert with ignoreDuplicates: Supabase's documentation
    // does not say what .select() returns for a row that was not inserted, and
    // an unverified vendor behaviour is not something to hang money on.
    const { data: already } = await supabaseAdmin
      .from('agent_fee_credit_spends')
      .select('id')
      .eq('credit_id', credit.id)
      .eq('reference', reference)
      .maybeSingle()

    if (already) continue

    const { error: claimError } = await supabaseAdmin
      .from('agent_fee_credit_spends')
      .insert({ credit_id: credit.id, user_id: userId, reference, amount: credit.spend })

    if (claimError) {
      // Either a real failure or a lost race. Either way this run does not
      // spend the credit; the run that won the insert did.
      console.error('Did not claim agent fee credit', credit.id, claimError)
      continue
    }

    const { error } = await supabaseAdmin
      .from('agent_fee_credits')
      .update({
        remaining: credit.remainingAfter,
        consumed_at: credit.remainingAfter === 0 ? new Date().toISOString() : null,
        consumed_reference: reference,
      })
      .eq('id', credit.id)
      .eq('remaining', credit.remainingBefore)
    if (error) console.error('Failed to spend agent fee credit', credit.id, error)
  }

  if (pricing.discount?.firstInvoiceOnly) {
    const { error } = await supabaseAdmin
      .from('agent_discount_uses')
      .upsert(
        {
          discount_id: pricing.discount.id,
          user_id: userId,
          reference,
        },
        { onConflict: 'discount_id,user_id' }
      )
    if (error) console.error('Failed to record discount use', pricing.discount.id, error)
  }
}

/**
 * Put credits back when the charge they paid for is cancelled.
 *
 * The onboarding route closes the previous unpaid invoice every time an agent
 * reopens the payment step, so without this a credit would be burned against an
 * invoice nobody ever paid and the next invoice would come out higher than the
 * first. Each spend row is released once; a released row is left in place as
 * the record that it happened.
 */
export async function releaseCreditsFor(reference: string): Promise<void> {
  const { data: spends, error } = await supabaseAdmin
    .from('agent_fee_credit_spends')
    .select('id, credit_id, amount')
    .eq('reference', reference)
    .is('released_at', null)

  if (error) {
    console.error('Failed to read credit spends for release', reference, error)
    return
  }

  for (const spend of spends || []) {
    const { data: credit } = await supabaseAdmin
      .from('agent_fee_credits')
      .select('remaining, amount')
      .eq('id', spend.credit_id)
      .maybeSingle()
    if (!credit) continue

    const restored = Math.min(money(credit.amount), money(credit.remaining) + money(spend.amount))

    const { error: restoreError } = await supabaseAdmin
      .from('agent_fee_credits')
      .update({ remaining: restored, consumed_at: null, consumed_reference: null })
      .eq('id', spend.credit_id)
    if (restoreError) {
      console.error('Failed to restore agent fee credit', spend.credit_id, restoreError)
      continue
    }

    await supabaseAdmin
      .from('agent_fee_credit_spends')
      .update({ released_at: new Date().toISOString() })
      .eq('id', spend.id)
  }
}
