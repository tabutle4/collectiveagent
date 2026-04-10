export interface ReferralICAFields {
  agentFirstName: string
  agentLastName: string
  effectiveDate: string
  mailingAddress: string
  email: string
}

export interface ReferralICASettings {
  referral_annual_fee: number
  referral_split_apartment: number
  referral_split_internal: number
  referral_split_external: number
  referral_brokerage_name: string
  referral_brokerage_email: string
  referral_termination_notice_days: number
  referral_payment_terms_days: number
  referral_refund_period_days: number
  brokerage_address_line1: string
  brokerage_address_line2: string
  brokerage_city: string
  brokerage_state: string
  brokerage_zip: string
  brokerage_main_email: string
}

// Default settings (fallback if company_settings not loaded)
export const DEFAULT_REFERRAL_SETTINGS: ReferralICASettings = {
  referral_annual_fee: 299,
  referral_split_apartment: 85,
  referral_split_internal: 90,
  referral_split_external: 88,
  referral_brokerage_name: 'Referral Collective',
  referral_brokerage_email: 'referrals@collectiverealtyco.com',
  referral_termination_notice_days: 14,
  referral_payment_terms_days: 30,
  referral_refund_period_days: 90,
  brokerage_address_line1: '13201 Northwest Fwy',
  brokerage_address_line2: 'Ste 450',
  brokerage_city: 'Houston',
  brokerage_state: 'Texas',
  brokerage_zip: '77040',
  brokerage_main_email: 'info@collectiverealtyco.com',
}

export function getReferralICAContent(fields: ReferralICAFields, settings: ReferralICASettings = DEFAULT_REFERRAL_SETTINGS) {
  const { agentFirstName, agentLastName, effectiveDate, mailingAddress, email } = fields
  const agentName = `${agentFirstName} ${agentLastName}`
  
  // Build brokerage address
  const brokerageAddress = [
    settings.brokerage_address_line1,
    settings.brokerage_address_line2,
    `${settings.brokerage_city}, ${settings.brokerage_state}, ${settings.brokerage_zip}`
  ].filter(Boolean).join(', ')

  // Calculate brokerage splits (100 - agent split)
  const brokerageSplitApartment = 100 - settings.referral_split_apartment
  const brokerageSplitInternal = 100 - settings.referral_split_internal
  const brokerageSplitExternal = 100 - settings.referral_split_external

  return {
    title: 'REFERRAL AGENT INDEPENDENT CONTRACTOR AGREEMENT',
    effectiveDate,
    agentName,
    mailingAddress,
    email,
    sections: [
      {
        heading: null,
        body: `The Parties. This Referral Agent Independent Contractor Agreement ("Agreement") is made on ${effectiveDate} ("Effective Date"), by and between ${agentName} ("Referral Agent") and ${settings.referral_brokerage_name}, a Limited Function Referral Office (LFRO) licensed under the Texas Real Estate Commission, with a principal office address of ${brokerageAddress} ("Brokerage").\n\nThe Referral Agent and Brokerage, collectively the "Parties", agree as follows:`,
      },
      {
        heading: 'I. The Referral Agent',
        body: `The Referral Agent is a licensed real estate agent in the State of Texas. In accordance with Texas Real Estate Commission (TREC) rules governing Limited Function Referral Offices (LFROs), the Referral Agent agrees to limit their real estate activities exclusively to referrals as defined herein.\n\na.) Status. The Parties agree that the services provided by the Referral Agent are as an Independent Contractor and no other legal relationship exists or is implied. Nothing in this Agreement shall constitute an offer of employment, a partnership, a joint venture, or any other form of relationship other than the Referral Agent's relationship with the Brokerage.\n\nb.) Scope of Services. As a referral agent under an LFRO, the Referral Agent's real estate activities are strictly limited to:\n    • Providing names and contact information of potential buyers, sellers, tenants, or landlords to licensed agents at other brokerages\n    • Referring apartment-seeking clients to participating locating agents\n    • Receiving referral fees for successfully referred clients who complete transactions\n\nThe Referral Agent shall NOT:\n    • Negotiate contracts or agreements for real estate transactions\n    • Show properties or conduct property tours\n    • Provide opinions regarding price, terms, or conditions of transactions\n    • Prepare or present offers, contracts, or other transaction documents\n    • Hold open houses or engage in direct property marketing\n    • Provide any brokerage services beyond simple referrals\n\nc.) Licensing. At the Referral Agent's own expense, they will be required to maintain an active Texas real estate license in "good standing" through the term of this Agreement. In the event the license issued to the Referral Agent is revoked, suspended, or not renewed for any reason, this Agreement shall automatically terminate effective the date of such action. The Referral Agent agrees to hold the Brokerage harmless in any case related to licensing.\n\nd.) No MLS Membership Required. As an LFRO, the Brokerage does not require association membership or MLS access. The Referral Agent is not required to join any Board of Realtors or Multiple Listing Service.\n\ne.) Fines. The Referral Agent is entirely responsible for any fines or judgments made against them, including payment, in regards to the Texas Real Estate Commission or any other regulatory institution.\n\nf.) Annual Membership Fee. The Referral Agent agrees to pay an annual membership fee of $${settings.referral_annual_fee}, due upon signing this Agreement and annually thereafter on the anniversary date. This is the only fee charged by the Brokerage. There are no monthly fees, transaction fees, or processing fees.`,
      },
      {
        heading: 'II. Withholdings',
        body: `As an independent contractor, the Referral Agent understands they will be personally responsible for all Local, State, and Federal Taxes. In addition, the Referral Agent agrees to indemnify the Brokerage for any and all liabilities or costs related to the aforementioned employment withholdings.\n\na.) Employment Insurance. As an independent contractor relationship, the Brokerage provides no Worker's Compensation or Unemployment Insurance coverage of any kind. Referral Agent expressly waives such coverage and is hereby notified that if Workers Compensation Coverage is desired, Referral Agent must personally obtain coverage directly from a licensed insurance carrier at the Referral Agent's sole expense.`,
      },
      {
        heading: 'III. Brokerage Support',
        body: `The Brokerage shall provide the following support to Referral Agents:\n\na.) License Sponsorship. The Brokerage will sponsor the Referral Agent's license with TREC and maintain compliance with all LFRO requirements.\n\nb.) Referral Network Access. The Brokerage maintains relationships with full-service brokerages and apartment locating services to facilitate referral placements.\n\nc.) Payment Processing. The Brokerage will collect referral fees from receiving brokerages and agents and distribute commission payments to the Referral Agent according to the terms of this Agreement.\n\nd.) Training Resources. Access to the Agent Training Center for compliance training and referral best practices.\n\ne.) No Physical Office Required. As an LFRO, the Brokerage does not provide physical office space, and none is required for referral activities.`,
      },
      {
        heading: "IV. Referral Agent's Authority",
        body: `Referral Agent is NOT an agent of the Brokerage in transactions and shall have NO authority to bind the Brokerage by any promise or representation unless such authority is expressly granted in writing. The Referral Agent's authority is limited strictly to providing referrals as defined in Section I(b). Referral Agent indemnifies and agrees to hold Brokerage harmless for any acts or omissions made by Referral Agent contrary to this Agreement or in excess of the scope permitted for LFRO referral agents.`,
      },
      {
        heading: 'V. Fair Housing Requirements',
        body: `The Brokerage is committed to full compliance with all Federal and State Fair Housing Laws. Therefore, Referral Agent shall fully understand and comply with all Fair Housing requirements and shall not act in any way to deny equal professional services or housing opportunity to any person for reasons of race, color, religion, sex, handicap, familial status, or national origin as mandated in the "Equal Housing Opportunity Act" or any other current or future enacted regulations.`,
      },
      {
        heading: 'VI. Termination',
        body: `Either Party to this Agreement may, at their own discretion, terminate the Agreement by providing the other Party ${settings.referral_termination_notice_days} days written notice via an email to the address provided.\n\na.) Resignation. In the event of the Referral Agent's resignation, all pending referrals that have not yet resulted in closed transactions will be forfeited, and no referral fee shall be paid.\n\nb.) Termination for Cause. The Brokerage may immediately terminate this Agreement without notice if the Referral Agent engages in any real estate activity beyond the scope permitted for LFRO referral agents, violates TREC rules, or engages in conduct detrimental to the Brokerage.\n\nc.) Refund Policy. Annual membership fees are non-refundable except in the case of Brokerage termination without cause within ${settings.referral_refund_period_days} days of payment, in which case a prorated refund may be issued.`,
      },
      {
        heading: 'VII. Referral Fees and Commissions',
        body: `Referral fees earned by the Referral Agent through successful referrals shall be payable to the Brokerage, which will then pay the Referral Agent according to the commission splits below.\n\na.) Commission Splits.\n\nApartment Referrals (to Collective Realty Co. locating agents):\n• Split: ${settings.referral_split_apartment}/${brokerageSplitApartment} in favor of Referral Agent\n• Referral Agent receives ${settings.referral_split_apartment}% of the locating fee\n• Brokerage retains ${brokerageSplitApartment}%\n\nBuyer, Seller, Tenant, or Landlord Referrals (to Collective Realty Co. agents):\n• Split: ${settings.referral_split_internal}/${brokerageSplitInternal} in favor of Referral Agent\n• Referral Agent receives ${settings.referral_split_internal}% of the referral fee\n• Brokerage retains ${brokerageSplitInternal}%\n\nExternal Referrals (to out-of-state agents or other Texas brokerages):\n• Split: ${settings.referral_split_external}/${brokerageSplitExternal} in favor of Referral Agent\n• Referral Agent receives ${settings.referral_split_external}% of the referral fee\n• Brokerage retains ${brokerageSplitExternal}%\n\nb.) Payment of Referral Fees. All referral fees shall be paid to the Referral Agent within ${settings.referral_payment_terms_days} days of the Brokerage receiving payment from the receiving agent or brokerage. The Brokerage shall provide a commission statement for each referral payment.\n\nc.) Referral Fee Amounts. The referral fee amount is negotiated between the Referral Agent and the receiving agent or brokerage. Standard referral fees are typically 25% of the gross commission for buyer/seller transactions and vary for apartment locating fees.\n\nd.) Documentation. The Referral Agent must submit a referral agreement for each referral prior to the transaction closing. The Brokerage will provide referral agreement templates.`,
      },
      {
        heading: 'VIII. Assignment',
        body: `The Referral Agent shall not assign or otherwise transfer any of the rights and obligations so placed on the Referral Agent hereunder. Any purported or attempted assignment or other transfer or delegation in violation of this section shall deem this Agreement null and void.`,
      },
      {
        heading: 'IX. Indemnification',
        body: `Referral Agent agrees to indemnify and hold harmless the Brokerage, its agents, employees, officers, successors, assigns, and any other party deriving title under the term Brokerage from all fines, levies, suits, proceedings, claims, actions, or causes of actions of any kind whatsoever including, but not limited to, all costs, court costs, litigation expenses and attorney fees arising from, growing out of, in connection with or incidental to the Referral Agent's activities.`,
      },
      {
        heading: 'X. Notice',
        body: `Any notice to be given by one of the Parties to the other under, or in connection with this Agreement, shall be in writing and signed by or on behalf of the Party giving it, and addressed to the recipient at the mailing address or following e-mail:\n\nReferral Agent\nMailing Address: ${mailingAddress}\nE-Mail: ${email}\n\nBrokerage\nMailing Address: ${brokerageAddress}\nE-Mail: ${settings.referral_brokerage_email}`,
      },
      {
        heading: 'XI. Amendments & Modifications',
        body: `At any time with thirty (30) days' written notice, the Brokerage has the right to change the terms of this Agreement.`,
      },
      {
        heading: 'XII. No Waivers',
        body: `The rights and remedies of the parties to this Agreement are cumulative and not alternative. No waiver of any rights is to be charged against any Party unless such waiver is in writing signed by an authorized representative of the Party so charged. Neither the failure nor any delay by any Party in exercising any right, power, or privilege under this Agreement will operate as a waiver of such right, power, or privilege, and no single or partial exercise of any such right, power, or privilege will preclude any other or further exercise of such right, power, or privilege or the exercise of any other right, power, or privilege.`,
      },
      {
        heading: 'XIII. Severability',
        body: `If any provision of this Agreement is held invalid or unenforceable by any court of competent jurisdiction, the other provisions of this Agreement will remain in full force and effect, and, if legally permitted, such offending provision will be replaced with an enforceable provision that as nearly as possible effects the party's intent.`,
      },
      {
        heading: 'XIV. Execution in Counterparts',
        body: `This Agreement may be executed in counterparts (which may be exchanged by facsimile or electronic signature), each of which will be deemed an original, but all of which together will constitute the same Agreement.`,
      },
      {
        heading: 'XV. Governing Law',
        body: `The validity, construction, interpretation of this Agreement shall be governed by and construed in accordance with the laws in the State of Texas, without regard to principles of conflicts of law. The Parties hereby consent and agree to the exclusive jurisdiction of the state and federal courts located in Harris County, Texas for all suits, actions or proceedings directly or indirectly arising out of or relating to this Agreement, and waive any and all objections to such courts, including but not limited to objections based on improper venue or inconvenient forum, and each Party hereby irrevocably submits to the jurisdiction of such courts in any suits, actions or proceedings arising out of or relating to this Agreement.`,
      },
      {
        heading: 'XVI. LFRO Compliance',
        body: `This Agreement is entered into pursuant to the Texas Real Estate Commission rules governing Limited Function Referral Offices (LFROs). Both parties acknowledge and agree that:\n\na.) The Brokerage operates exclusively as an LFRO and does not provide full brokerage services.\n\nb.) The Referral Agent's activities are strictly limited to referral services as defined by TREC for LFRO agents.\n\nc.) Any violation of LFRO restrictions by the Referral Agent may result in immediate termination and potential regulatory action.\n\nd.) The Brokerage maintains all required TREC compliance documentation for LFRO operations.`,
      },
      {
        heading: 'XVII. Entire Agreement',
        body: `This Agreement constitutes the entire Agreement between the parties with respect to the subject matter contained herein, superseding all previous agreements pertaining to such subject matter, and may be modified only by an amendment executed in writing by the authorized officers of both parties hereto. All prior agreements, representations, warranties, statements, negotiations, understandings and undertakings are superseded hereby.\n\nBoth parties hereto represent that they have read this Agreement, understand it, agree to be bound by all terms and conditions stated herein, and acknowledge receipt of a signed, true and exact copy of this Agreement.\n\nIN WITNESS WHEREOF, the parties have executed this Agreement under seal as of the day and year first written above.`,
      },
    ],
  }
}