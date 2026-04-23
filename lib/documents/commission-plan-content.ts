export type CommissionPlanKey = 'new_agent' | 'no_cap' | 'cap'

export interface CommissionPlanOverrides {
  /** How many sales transactions on New Agent Plan before graduation. Default 5. */
  qualifyingTransactionTarget?: number | null
  /** If true, no coaching/training fee applies. Default false. */
  waiveCoachingFee?: boolean | null
  /** Dollar override for Cap Plan cap. Default $18,000. */
  capAmountOverride?: number | null
  /** Post-cap split string override, e.g. '95/5'. Default '97/3'. */
  postCapSplitOverride?: string | null
}

export interface CommissionPlanFields {
  agentName: string
  effectiveDate: string
  plan: CommissionPlanKey
  /** Optional overrides pulled from the users table. Omitted = standard terms. */
  overrides?: CommissionPlanOverrides
}

// ── Formatting helpers ────────────────────────────────────────────────────
const fmtMoney = (n: number): string =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

const hasCustomTerms = (o?: CommissionPlanOverrides): boolean => {
  if (!o) return false
  if (o.qualifyingTransactionTarget != null && o.qualifyingTransactionTarget !== 5) return true
  if (o.waiveCoachingFee === true) return true
  if (o.capAmountOverride != null && o.capAmountOverride !== 18000) return true
  if (o.postCapSplitOverride && o.postCapSplitOverride !== '97/3') return true
  return false
}

// ── Shared sections that don't vary by plan or overrides ──────────────────
const SPECIAL_ARRANGEMENTS = `II. Special Commission Arrangements

The following special arrangements apply to all Salespersons, regardless of primary plan selection:

Lease Transactions (Agent's Lead): 85/15 split in favor of agent
Brokerage Lead Referrals (Buyer): 50/50 split in favor of agent
Brokerage Lead Referrals (Lease): 75/25 split in favor of agent
Client Ownership: All brokerage-provided leads and resulting clients remain property of the Agency
Cap Exclusions: Lease transactions and brokerage lead transactions do not count toward commission caps`

const PROCESSING_FEES_SECTION = `III. Brokerage Processing Fees

Brokerage processing fees may apply based on transaction type. Refer to the Agent Training Center for a complete fee schedule.`

const GENERAL_TERMS = `IV. General Terms

All commission plans, splits, and fee structures outlined in this Agreement are available exclusively to active agents sponsored by Collective Realty Co. Departing agents should refer to the Firm Exit Process for post-departure commission terms. Brokerage processing fees are subject to change; refer to the Agent Training Center for the current fee schedule.

If the Salesperson is a member of a team registered with the Agency, the agent's portion of the commission split outlined in this Agreement will be further divided according to the terms of the Salesperson's Team Agreement. The Agency's portion is not affected by team arrangements.

This Agreement is incorporated into and made part of the Real Estate Agent Independent Contractor Agreement between the parties. In the event of any conflict between this Agreement and the Independent Contractor Agreement, the terms of the Independent Contractor Agreement shall control.

Both parties hereto represent that they have read this Agreement, understand it, and agree to be bound by all terms and conditions stated herein.`

// ── Plan content builders — overrides are applied inside these ────────────

function buildNewAgentIntro(target: number, customized: boolean): string {
  const first = customized
    ? `The Salesperson has been enrolled in the New Agent Plan under a customized arrangement specific to this Salesperson.`
    : `The Salesperson has been enrolled in the New Agent Plan.`

  const dealPhrase =
    target === 1
      ? 'the first sales transaction'
      : `the first ${target} sales transactions`

  return `${first} This plan applies to agents new to the firm who have fewer than 5 sales transactions in the last 12 months, and covers ${dealPhrase} completed while at the Agency. This plan is part of the Agency's New Agent Training Program and is designed to support agents in the early stages of their career at Collective Realty Co.`
}

function buildNewAgentRows(overrides: CommissionPlanOverrides | undefined): string[] {
  const target = overrides?.qualifyingTransactionTarget ?? 5
  const waive = overrides?.waiveCoachingFee === true

  const dealLabel =
    target === 1 ? 'First sales transaction' : `First ${target} sales transactions`

  const coachingLine = waive
    ? 'New Agent Training Fee: Waived under the Salespersons customized arrangement'
    : 'New Agent Training Fee: $500 per transaction'

  return [
    'Commission Split: 70 / 30 (Agent / Agency)',
    'Cap: None',
    `Applies To: ${dealLabel}`,
    coachingLine,
    'Brokerage Processing Fee: May apply based on transaction type',
  ]
}

function buildCapRows(overrides: CommissionPlanOverrides | undefined): string[] {
  const capAmt = overrides?.capAmountOverride ?? 18000
  const postCap = overrides?.postCapSplitOverride || '97/3'
  const [agentPct, agencyPct] = postCap.split('/').map(s => s.trim())

  return [
    'Commission Split: 70 / 30 (Agent / Agency)',
    `Cap: ${fmtMoney(capAmt)}`,
    `Post-Cap Split: ${agentPct} / ${agencyPct} (Agent / Agency) - the ${agencyPct}% includes the post-cap processing fee`,
    'Applies To: All buyer, commercial, and listing transactions',
    'Brokerage Processing Fee: May apply based on transaction type (waived post-cap)',
  ]
}

function buildCapIntro(overrides: CommissionPlanOverrides | undefined): string {
  const postCap = overrides?.postCapSplitOverride || '97/3'
  const [, agencyPct] = postCap.split('/').map(s => s.trim())
  return `The Salesperson has selected the Cap Plan. This plan applies to all buyer deals, commercial deals, and listing transactions. Starting with a competitive split, once the Salesperson has paid a predetermined amount to the Agency, they will benefit from a ${postCap} split for the remainder of the cap year. The ${agencyPct}% in the post-cap split represents the post-cap processing fee - no additional brokerage processing fee is charged on post-cap transactions.`
}

function buildPlanProgression(overrides: CommissionPlanOverrides | undefined): string {
  const target = overrides?.qualifyingTransactionTarget ?? 5
  const capAmt = overrides?.capAmountOverride ?? 18000
  const postCap = overrides?.postCapSplitOverride || '97/3'
  const [, agencyPct] = postCap.split('/').map(s => s.trim())

  const threshold =
    target === 5
      ? 'Upon completing all New Agent Training Program requirements,'
      : `Upon completing all New Agent Training Program requirements, and upon completion of the Salespersons first ${target} sales transactions under this Agreement,`

  return `V. Plan Progression (New Agent Plan Only)

${threshold} the Salesperson will select one of the following commission plans. The selected plan will be confirmed in writing at that time.

No Cap Plan: 85/15 split, no cap, brokerage processing fees may apply.
Cap Plan: 70/30 split, ${fmtMoney(capAmt)} cap, post-cap split ${postCap} (${agencyPct}% includes post-cap processing fee), brokerage processing fees may apply until cap is reached.

This Agreement does not expire and remains in effect until the Salespersons commission plan is updated or the Independent Contractor Agreement is terminated.`
}

// ── Main content builder ──────────────────────────────────────────────────
export function getCommissionPlanContent(fields: CommissionPlanFields) {
  const { agentName, effectiveDate, plan, overrides } = fields
  const customized = hasCustomTerms(overrides)
  const target = overrides?.qualifyingTransactionTarget ?? 5

  let intro: string
  let tableRows: string[]

  if (plan === 'new_agent') {
    intro = buildNewAgentIntro(target, customized)
    tableRows = buildNewAgentRows(overrides)
  } else if (plan === 'no_cap') {
    intro = `The Salesperson has selected the No Cap Plan. This plan applies to all buyer deals, commercial deals, and listing transactions. It guarantees a consistently higher commission split, allowing the Salesperson to concentrate on growing their business without concerns about commission caps.`
    tableRows = [
      'Commission Split: 85 / 15 (Agent / Agency)',
      'Cap: None',
      'Applies To: All buyer, commercial, and listing transactions',
      'Brokerage Processing Fee: May apply based on transaction type',
    ]
  } else {
    intro = buildCapIntro(overrides)
    tableRows = buildCapRows(overrides)
  }

  const planLabel =
    plan === 'new_agent'
      ? customized
        ? 'New Agent Plan (Custom)'
        : 'New Agent Plan'
      : plan === 'no_cap'
      ? 'No Cap Plan'
      : 'Cap Plan'

  // Customized terms summary — only shown for New Agent Plan with overrides,
  // since that's where the differences from standard are most material.
  const customizedSummary =
    plan === 'new_agent' && customized
      ? buildNewAgentCustomSummary(overrides)
      : null

  const sections: { heading: string | null; body: string }[] = [
    {
      heading: null,
      body: `This Real Estate Agent Commission Plan Agreement ("Agreement") is entered into on ${effectiveDate} ("Effective Date"), by and between ${agentName} ("Salesperson") and Collective Realty Co., with a principal office address of 13201 Northwest Fwy, Ste 450, Houston, Texas, 77040 ("Agency").\n\nThis Agreement supplements and is incorporated into the Real Estate Agent Independent Contractor Agreement signed by the Salesperson. The commission plan, splits, and fees outlined below govern all transactions performed by the Salesperson while sponsored by the Agency.`,
    },
    {
      heading: 'I. Selected Commission Plan',
      body: `${intro}\n\n${tableRows.join('\n')}${
        customizedSummary ? `\n\n${customizedSummary}` : ''
      }`,
    },
    { heading: null, body: SPECIAL_ARRANGEMENTS },
    { heading: null, body: PROCESSING_FEES_SECTION },
    ...(plan === 'new_agent'
      ? [{ heading: null, body: buildPlanProgression(overrides) }]
      : []),
    { heading: null, body: GENERAL_TERMS },
  ]

  return {
    title: 'REAL ESTATE AGENT COMMISSION PLAN AGREEMENT',
    planLabel,
    effectiveDate,
    agentName,
    sections,
  }
}

function buildNewAgentCustomSummary(overrides?: CommissionPlanOverrides): string {
  const bits: string[] = []
  const target = overrides?.qualifyingTransactionTarget ?? 5
  if (target !== 5) {
    bits.push(
      `this plan applies to the first ${target} sales transaction${
        target === 1 ? '' : 's'
      } rather than the first 5`
    )
  }
  if (overrides?.waiveCoachingFee === true) {
    bits.push('the New Agent Training Fee of $500 per transaction is waived for all transactions under this Agreement')
  }
  if (overrides?.capAmountOverride != null && overrides.capAmountOverride !== 18000) {
    bits.push(`the Cap Plan cap amount is ${fmtMoney(overrides.capAmountOverride)} instead of $18,000`)
  }
  if (overrides?.postCapSplitOverride && overrides.postCapSplitOverride !== '97/3') {
    bits.push(`the Cap Plan post-cap split is ${overrides.postCapSplitOverride} instead of 97/3`)
  }

  if (bits.length === 0) return ''

  const joined =
    bits.length === 1
      ? bits[0]
      : bits.length === 2
      ? bits.join(', and ')
      : bits.slice(0, -1).join(', ') + ', and ' + bits[bits.length - 1]

  return `Customized Terms Summary: The Salespersons arrangement differs from the standard New Agent Plan in the following respects: ${joined}. All other terms of the New Agent Plan apply as written.`
}

export function getCommissionPlanKey(commissionPlan: string): CommissionPlanKey {
  const plan = (commissionPlan || '').toLowerCase()
  if (plan.includes('new') || plan.includes('70_30_new')) return 'new_agent'
  if (plan.includes('no cap') || plan.includes('85_15_no_cap')) return 'no_cap'
  if (plan.includes('cap') || plan.includes('70_30_cap')) return 'cap'
  return 'no_cap' // default
}

/**
 * Reads a user row and extracts the commission plan overrides. Returns an
 * empty object if no overrides are set. Safe to call with any user shape —
 * missing columns just fall back to defaults.
 */
export function extractOverridesFromUser(user: any): CommissionPlanOverrides {
  if (!user) return {}
  return {
    qualifyingTransactionTarget:
      user.qualifying_transaction_target != null
        ? Number(user.qualifying_transaction_target)
        : null,
    waiveCoachingFee: user.waive_coaching_fee === true,
    capAmountOverride:
      user.cap_amount_override != null ? Number(user.cap_amount_override) : null,
    postCapSplitOverride: user.post_cap_split_override || null,
  }
}
