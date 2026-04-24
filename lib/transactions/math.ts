/**
 * Canonical commission math for Collective Realty Co.
 *
 * Single source of truth — every place that computes agent_net or
 * amount_1099_reportable MUST use these functions. Do not inline the
 * formulas anywhere else. Locked 2026-04-24.
 *
 * FORMULA (Model A):
 *   amount_1099 = agent_gross + btsa − processing − coaching − other_fees − rebate
 *   agent_net   = amount_1099 − debts
 *
 * Notes:
 *   agent_gross is ALREADY post-team-split for team members. Team leads sit on
 *   their own TIA row linked via source_tia_id. Do NOT deduct
 *   team_lead_commission from either formula — it was carved out at the
 *   team-split step.
 *
 *   rebate is a client-facing credit that comes out of agent commission and
 *   reduces the agent's reportable income (not the firm's).
 *
 *   debts reduce cash out only, not tax liability (the debt being paid
 *   down is post-tax money from the agent's account balance).
 *
 *   btsa is added (bonus-to-sellers-agent, back-to-sellers-agent, etc).
 */

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface CommissionInputs {
  agent_gross?: number | string | null
  btsa_amount?: number | string | null
  processing_fee?: number | string | null
  coaching_fee?: number | string | null
  other_fees?: number | string | null
  rebate_amount?: number | string | null
  debts_deducted?: number | string | null
}

export interface CommissionResult {
  amount_1099: number
  agent_net: number
}

/**
 * Canonical commission calculator. Pass in any TIA row's fields (or the
 * proposed values for a recalc), get back the rounded amount_1099 and
 * agent_net.
 */
export function computeCommission(inputs: CommissionInputs): CommissionResult {
  const agentGross = num(inputs.agent_gross)
  const btsa = num(inputs.btsa_amount)
  const processing = num(inputs.processing_fee)
  const coaching = num(inputs.coaching_fee)
  const otherFees = num(inputs.other_fees)
  const rebate = num(inputs.rebate_amount)
  const debts = num(inputs.debts_deducted)

  const amount_1099 = agentGross + btsa - processing - coaching - otherFees - rebate
  const agent_net = amount_1099 - debts

  return {
    amount_1099: round2(amount_1099),
    agent_net: round2(agent_net),
  }
}

/**
 * Returns the formula string for display in commission statements and
 * tooltips. Skips zero terms to keep it readable.
 */
export function formulaDisplay(inputs: CommissionInputs): string {
  const parts: string[] = []
  const gross = num(inputs.agent_gross)
  const btsa = num(inputs.btsa_amount)
  const processing = num(inputs.processing_fee)
  const coaching = num(inputs.coaching_fee)
  const other = num(inputs.other_fees)
  const rebate = num(inputs.rebate_amount)
  const debts = num(inputs.debts_deducted)

  parts.push(`$${gross.toFixed(2)}`)
  if (btsa !== 0) parts.push(`+ $${btsa.toFixed(2)} BTSA`)
  if (processing !== 0) parts.push(`− $${processing.toFixed(2)} processing`)
  if (coaching !== 0) parts.push(`− $${coaching.toFixed(2)} coaching`)
  if (other !== 0) parts.push(`− $${other.toFixed(2)} other`)
  if (rebate !== 0) parts.push(`− $${rebate.toFixed(2)} rebate`)
  if (debts !== 0) parts.push(`− $${debts.toFixed(2)} debts`)

  return parts.join(' ')
}

/**
 * Convenience: computes and returns the list of deduction lines for UI
 * display (mini-tree arrows, field rows). Skips zero values.
 */
export function deductionLines(
  inputs: CommissionInputs
): Array<{ label: string; amount: number; sign: '+' | '−' }> {
  const lines: Array<{ label: string; amount: number; sign: '+' | '−' }> = []
  const add = (label: string, amount: number, sign: '+' | '−') => {
    if (amount !== 0) lines.push({ label, amount: Math.abs(amount), sign })
  }
  add('BTSA', num(inputs.btsa_amount), '+')
  add('Processing fee', num(inputs.processing_fee), '−')
  add('Coaching fee', num(inputs.coaching_fee), '−')
  add('Other fees', num(inputs.other_fees), '−')
  add('Rebate', num(inputs.rebate_amount), '−')
  add('Debts', num(inputs.debts_deducted), '−')
  return lines
}
