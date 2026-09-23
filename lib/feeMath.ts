/**
 * Fee arithmetic with no database and no environment behind it, so the money
 * rules can be tested directly - the same split lib/transactions/math.ts uses
 * for commission math.
 */

/** AGENTS.md money convention: parse, default to 0, round to cents. */
export function money(value: unknown): number {
  const parsed = parseFloat(String(value ?? 0)) || 0
  return Math.round(parsed * 100) / 100
}

/**
 * Spread a charge across credits, oldest first. Pure, so the money arithmetic
 * is testable without a database: see tests/fee-discounts.test.ts.
 *
 * A credit bigger than the charge is partly spent and keeps the rest for next
 * time - that remainder is the agent's money, not something to drop on the
 * floor.
 */
export interface CreditSpend {
  id: string
  spend: number
  remainingBefore: number
  remainingAfter: number
}

export interface CreditPlan {
  creditApplied: number
  amountDue: number
  creditsUsed: CreditSpend[]
}

export function allocateCredits(
  credits: { id: string; remaining: number }[],
  price: number
): CreditPlan {
  const target = Math.max(0, money(price))
  const creditsUsed: CreditSpend[] = []
  let creditApplied = 0
  let left = target

  for (const credit of credits) {
    if (left <= 0) break
    const remaining = money(credit.remaining)
    const spend = Math.min(remaining, left)
    if (spend <= 0) continue
    creditsUsed.push({
      id: credit.id,
      spend: money(spend),
      remainingBefore: remaining,
      remainingAfter: money(remaining - spend),
    })
    creditApplied = money(creditApplied + spend)
    left = money(left - spend)
  }

  return {
    creditApplied,
    amountDue: Math.max(0, money(target - creditApplied)),
    creditsUsed,
  }
}

