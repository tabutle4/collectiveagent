export type CommissionPlanKey = 'new_agent' | 'no_cap' | 'cap'

export interface CommissionPlanFields {
  agentName: string
  effectiveDate: string
  plan: CommissionPlanKey
}

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

const PLAN_CONTENT: Record<CommissionPlanKey, { intro: string; tableRows: string[] }> = {
  new_agent: {
    intro: `The Salesperson has been enrolled in the New Agent Plan. This plan applies to agents new to the firm who have fewer than 5 sales transactions in the last 12 months, and covers the first 5 sales transactions completed while at the Agency. This plan is part of the Agency's New Agent Training Program and is designed to support agents in the early stages of their career at Collective Realty Co.`,
    tableRows: [
      'Commission Split: 70 / 30 (Agent / Agency)',
      'Cap: None',
      'Applies To: First 5 sales transactions',
      'New Agent Training Fee: $500 per transaction',
      'Brokerage Processing Fee: May apply based on transaction type',
    ],
  },
  no_cap: {
    intro: `The Salesperson has selected the No Cap Plan. This plan applies to all buyer deals, commercial deals, and listing transactions. It guarantees a consistently higher commission split, allowing the Salesperson to concentrate on growing their business without concerns about commission caps.`,
    tableRows: [
      'Commission Split: 85 / 15 (Agent / Agency)',
      'Cap: None',
      'Applies To: All buyer, commercial, and listing transactions',
      'Brokerage Processing Fee: May apply based on transaction type',
    ],
  },
  cap: {
    intro: `The Salesperson has selected the Cap Plan. This plan applies to all buyer deals, commercial deals, and listing transactions. Starting with a competitive split, once the Salesperson has paid a predetermined amount to the Agency, they will benefit from a 97/3 split for the remainder of the cap year. The 3% in the post-cap split represents the post-cap processing fee — no additional brokerage processing fee is charged on post-cap transactions.`,
    tableRows: [
      'Commission Split: 70 / 30 (Agent / Agency)',
      'Cap: $18,000',
      'Post-Cap Split: 97 / 3 (Agent / Agency) — the 3% includes the post-cap processing fee',
      'Applies To: All buyer, commercial, and listing transactions',
      'Brokerage Processing Fee: May apply based on transaction type (waived post-cap)',
    ],
  },
}

const PLAN_PROGRESSION = `V. Plan Progression (New Agent Plan Only)

Upon completing all New Agent Training Program requirements, the Salesperson will select one of the following commission plans. The selected plan will be confirmed in writing at that time.

No Cap Plan: 85/15 split, no cap, brokerage processing fees may apply.
Cap Plan: 70/30 split, $18,000 cap, post-cap split 97/3 (3% includes post-cap processing fee), brokerage processing fees may apply until cap is reached.

This Agreement does not expire and remains in effect until the Salesperson's commission plan is updated or the Independent Contractor Agreement is terminated.`

export function getCommissionPlanContent(fields: CommissionPlanFields) {
  const { agentName, effectiveDate, plan } = fields
  const planData = PLAN_CONTENT[plan]

  const planLabel =
    plan === 'new_agent' ? 'New Agent Plan' : plan === 'no_cap' ? 'No Cap Plan' : 'Cap Plan'

  const sections = [
    {
      heading: null,
      body: `This Real Estate Agent Commission Plan Agreement ("Agreement") is entered into on ${effectiveDate} ("Effective Date"), by and between ${agentName} ("Salesperson") and Collective Realty Co., with a principal office address of 13201 Northwest Fwy, Ste 450, Houston, Texas, 77040 ("Agency").\n\nThis Agreement supplements and is incorporated into the Real Estate Agent Independent Contractor Agreement signed by the Salesperson. The commission plan, splits, and fees outlined below govern all transactions performed by the Salesperson while sponsored by the Agency.`,
    },
    {
      heading: 'I. Selected Commission Plan',
      body: `${planData.intro}\n\n${planData.tableRows.join('\n')}`,
    },
    { heading: null, body: SPECIAL_ARRANGEMENTS },
    { heading: null, body: PROCESSING_FEES_SECTION },
    ...(plan === 'new_agent' ? [{ heading: null, body: PLAN_PROGRESSION }] : []),
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

export function getCommissionPlanKey(commissionPlan: string): CommissionPlanKey {
  const plan = (commissionPlan || '').toLowerCase()
  if (plan.includes('new') || plan.includes('70_30_new')) return 'new_agent'
  if (plan.includes('no cap') || plan.includes('85_15_no_cap')) return 'no_cap'
  if (plan.includes('cap') || plan.includes('70_30_cap')) return 'cap'
  return 'no_cap' // default
}