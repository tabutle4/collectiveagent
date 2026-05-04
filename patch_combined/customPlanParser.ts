/**
 * Parse the embedded agent/firm split out of a "custom plan" string.
 *
 * The profile form (app/profile/page.tsx) encodes custom plans as text:
 *   "Custom - 85/15 Cap"      (sales)  → agent=85, firm=15
 *   "Custom Lease 90/10"      (lease)  → agent=90, firm=10
 *
 * These strings are stored on users.commission_plan / users.lease_commission_plan
 * but are NOT present as rows in the commission_plans table. When the DB lookup
 * misses, callers fall back to defaults (85/15) and the agent gets the wrong
 * split silently. Use this helper to recover the embedded ratio.
 *
 * Returns null when the string contains no recognizable split or the parts
 * don't sum to 100.
 */
export function parseCustomPlanSplit(
  planCode: string | null | undefined
): { agentPct: number; firmPct: number } | null {
  if (!planCode) return null
  const m = planCode.match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const f = parseInt(m[2], 10)
  if (!Number.isFinite(a) || !Number.isFinite(f)) return null
  if (a + f !== 100) return null
  if (a <= 0 || a > 100) return null
  return { agentPct: a, firmPct: f }
}
