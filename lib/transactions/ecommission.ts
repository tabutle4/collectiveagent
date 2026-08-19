/**
 * Canonical eCommission advance helpers.
 *
 * An eCommission advance is recorded in four separate places on a deal:
 *   1. transactions.ecommission_amount  - what the agent REPORTED on the
 *      compliance form. Display only.
 *   2. agent_debts (debt_type 'ecommission').amount_owed - the debt of record.
 *   3. agent_debts.amount_paid - frozen at stage time. This is the money
 *      actually withheld from the payout.
 *   4. transaction_external_brokerages ('eCommission%') - what eCommission
 *      gets paid on the CDA.
 *
 * Nothing kept those four in sync, so correcting the amount in one place left
 * the other three showing the old number. The rule now: the STAGED DEBT is the
 * money, and every screen that shows an advance figure reads it from here.
 * transactions.ecommission_amount is only used to detect that the reported
 * figure and the applied figure disagree, which is a thing the approver needs
 * to see rather than a number to display on its own.
 */

/**
 * debt_type for an eCommission commission advance. Withheld from the agent like
 * any other staged debt, but owed to eCommission -- an outside company -- so it
 * is disbursed to them, never kept by the brokerage.
 * Keep in sync with DEBT_TYPES in components/transactions/AgentBillingPanel.tsx.
 */
export const ECOMMISSION_DEBT_TYPE = 'ecommission'

/** Brokerage_name prefix used for the eCommission payout row on a deal. */
export const ECOMMISSION_PAYEE_NAME = 'eCommission (Advance Repayment)'

const n = (v: any): number => parseFloat(String(v ?? 0)) || 0
const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * The eCommission repayment ACTUALLY withheld from this payout, summed from the
 * staged debt rows. Matches on debt_type rather than on the description text so
 * a renamed or office-entered debt still counts.
 */
export function appliedEcommissionTotal(stagedRows: any[] | null | undefined): number {
  return round2(
    (stagedRows || []).reduce(
      (s: number, d: any) =>
        d.debt_type === ECOMMISSION_DEBT_TYPE && d.record_type !== 'credit'
          ? s + n(d.amount_paid)
          : s,
      0
    )
  )
}

export type EcommissionNotice = {
  /** applied = expected, missing/mismatch = needs attention before approving. */
  tone: 'applied' | 'missing' | 'mismatch'
  text: string
}

/**
 * The one eCommission notice, rendered identically on the send-for-approval
 * screen and the CDA approval screen. `applied` wins over `reported` because
 * `applied` is the number the payout actually used.
 */
export function ecommissionNotice(
  reported: any,
  applied: any
): EcommissionNotice | null {
  const f$ = (v: number) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const rep = round2(n(reported))
  const app = round2(n(applied))
  if (app > 0 && Math.abs(app - rep) >= 0.01) {
    // A reported figure that is absent entirely is a STRONGER signal than one
    // that merely differs, not a weaker one: money is being withheld for an
    // advance no one has reported. Gating this branch on `rep > 0` is what let
    // that case render as a healthy deal.
    if (rep <= 0) {
      return {
        tone: 'mismatch',
        text: `eCommission Advance ${f$(app)} is being withheld on this payout, but NO advance is reported on the compliance form. Confirm the payoff amount before approving.`,
      }
    }
    return {
      tone: 'mismatch',
      text: `eCommission Advance ${f$(app)} - repayment is applied above. The agent reported ${f$(rep)} on the compliance form, so one of the two is out of date. Confirm the payoff amount before approving.`,
    }
  }
  if (app > 0) {
    return {
      tone: 'applied',
      text: `eCommission Advance ${f$(app)} - repayment is applied above.`,
    }
  }
  if (rep > 0) {
    return {
      tone: 'missing',
      text: `eCommission Advance ${f$(rep)} reported on this deal but NO repayment is applied to this payout.`,
    }
  }
  return null
}
