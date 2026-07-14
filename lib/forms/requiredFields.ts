/**
 * Server side required field enforcement.
 *
 * The `required` attributes on the forms are browser hints. They stop a normal
 * agent but they are trivially bypassed, and they are not what protects the
 * data. These checks run in the route, so a submission missing a required field
 * is rejected no matter how it was sent.
 *
 * Conditional fields are only required when their trigger applies. Requiring a
 * coordination payment method on a submission that never asked for coordination
 * would block a legitimate deal.
 */

export interface FieldRule {
  /** Body key to check. */
  key: string
  /** What the agent sees in the error. */
  label: string
  /**
   * When present, the field is only required if this returns true. Absent means
   * always required.
   */
  when?: (body: any) => boolean
  /**
   * Booleans that must be answered rather than truthy. A "no" answer is a valid
   * answer, so `false` passes; `undefined` and `null` do not.
   */
  answered?: boolean
}

/** Empty means missing. Zero and false are real answers, not missing ones. */
function isMissing(v: any): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

/**
 * Returns a human readable list of the problems. An empty array means the
 * submission is complete.
 */
export function checkRequired(body: any, rules: FieldRule[]): string[] {
  const missing: string[] = []
  for (const rule of rules) {
    if (rule.when && !rule.when(body)) continue

    const value = body?.[rule.key]

    if (rule.answered) {
      // A yes/no question. Answering "no" is fine. Not answering is not.
      if (value === undefined || value === null || value === '') {
        missing.push(rule.label)
      }
      continue
    }

    if (isMissing(value)) missing.push(rule.label)
  }
  return missing
}

/** Turns the missing list into one error sentence for the agent. */
export function requiredFieldsError(missing: string[]): string {
  if (missing.length === 1) return `${missing[0]} is required.`
  return `These fields are required: ${missing.join(', ')}.`
}

// ── Helpers used by the rules below ──────────────────────────────────────────

const wantsCoordination = (b: any) => !!b.coordination_requested
const notBrokerListing = (b: any) => !b.is_broker_listing

/** A lease on the compliance form, including a lease that was referred out. */
export function complianceIsLease(b: any): boolean {
  const rep = b.representing
  if (rep === 'referred_out') {
    return b.referred_client_type === 'tenant' || b.referred_client_type === 'landlord'
  }
  return rep === 'tenant' || rep === 'landlord'
}

/**
 * Title and loan only apply to a sale the agent is closing themselves.
 * This mirrors showTitleLoan on the compliance form, which hides those five
 * fields for leases and referred-out deals. The validator must never require a
 * field the agent cannot see.
 */
function complianceShowsTitleAndLoan(b: any): boolean {
  const rep = b.representing
  return rep !== 'tenant' && rep !== 'landlord' && rep !== 'referred_out'
}

// ── Rules per form ───────────────────────────────────────────────────────────

export const JUST_LISTED_RULES: FieldRule[] = [
  { key: 'street_address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'transaction_type', label: 'Sale or lease' },
  { key: 'lead_source', label: 'Lead source' },
  { key: 'client_names', label: 'Client name' },
  { key: 'client_phone', label: 'Client phone' },
  { key: 'client_email', label: 'Client email' },
  { key: 'dotloop_file_created', label: 'Whether the Dotloop file was created', answered: true },
  { key: 'coordination_requested', label: 'Whether you want listing coordination', answered: true },
  {
    key: 'coordination_payment_method',
    label: 'Coordination payment method',
    when: (b) => wantsCoordination(b) && notBrokerListing(b),
  },
  {
    key: 'coordination_payment_type',
    label: 'Coordination payment type',
    when: (b) => wantsCoordination(b) && notBrokerListing(b),
  },
]

export const PRE_LISTING_RULES: FieldRule[] = [
  { key: 'street_address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'transaction_type', label: 'Sale or lease' },
  { key: 'estimated_launch_date', label: 'Estimated launch date' },
  { key: 'lead_source', label: 'Lead source' },
  { key: 'client_names', label: 'Client name' },
  { key: 'client_phone', label: 'Client phone' },
  { key: 'client_email', label: 'Client email' },
  { key: 'dotloop_file_created', label: 'Whether the Dotloop file was created', answered: true },
  { key: 'listing_input_requested', label: 'Whether you want MLS listing input', answered: true },
  {
    key: 'listing_input_payment_method',
    label: 'Listing input payment method',
    when: (b) => !!b.listing_input_requested,
  },
  { key: 'coordination_requested', label: 'Whether you want listing coordination', answered: true },
  {
    key: 'coordination_payment_method',
    label: 'Coordination payment method',
    when: (b) => wantsCoordination(b) && notBrokerListing(b),
  },
  {
    key: 'coordination_payment_type',
    label: 'Coordination payment type',
    when: (b) => wantsCoordination(b) && notBrokerListing(b),
  },
]

export const UNDER_CONTRACT_RULES: FieldRule[] = [
  { key: 'street_address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'sales_price', label: 'Sales price' },
  { key: 'commission_rate', label: 'Commission rate' },
  { key: 'closing_date', label: 'Closing date' },
  { key: 'representing', label: 'Who you represent' },
  { key: 'lead_source', label: 'Lead source' },
  { key: 'client_name', label: 'Client name' },
  { key: 'client_email', label: 'Client email' },
  { key: 'other_agent_name', label: 'Other agent name' },
  { key: 'other_agent_phone', label: 'Other agent phone' },
  { key: 'other_agent_email', label: 'Other agent email' },
  { key: 'title_company', label: 'Title company' },
  { key: 'title_contact_name', label: 'Title contact name' },
  { key: 'title_phone', label: 'Title phone' },
  { key: 'title_email', label: 'Title email' },
  { key: 'flyer_choice', label: 'What to show on your flyer' },
  { key: 'team_name', label: 'Team name', when: (b) => b.flyer_choice === 'team' },
  { key: 'division_name', label: 'Division name', when: (b) => b.flyer_choice === 'division' },
  { key: 'documents_uploaded_ack', label: 'Confirmation that the contract documents are uploaded', answered: true },
]

/**
 * Compliance. The address parts are only required when no existing transaction
 * was found, because that is the only case where we create one.
 */
export function complianceRules(hasExistingTransaction: boolean): FieldRule[] {
  return [
    { key: 'street_address', label: 'Street address', when: () => !hasExistingTransaction },
    { key: 'city', label: 'City', when: () => !hasExistingTransaction },
    { key: 'state', label: 'State', when: () => !hasExistingTransaction },
    { key: 'zip', label: 'Zip', when: () => !hasExistingTransaction },

    { key: 'representing', label: 'Who you represent' },
    { key: 'closing_or_movein_date', label: 'Closing or move-in date' },
    { key: 'acceptance_date', label: 'Acceptance date' },
    { key: 'lead_source', label: 'Lead source' },
    { key: 'loan_type', label: 'Loan type', when: complianceShowsTitleAndLoan },
    { key: 'team_or_office', label: 'Team or office' },

    { key: 'tenant_transaction_type', label: 'Tenant transaction type', when: complianceIsLease },
    { key: 'lease_term_months', label: 'Lease term in months', when: complianceIsLease },
    {
      key: 'referred_client_type',
      label: 'Referred client type',
      when: (b) => b.representing === 'referred_out',
    },

    { key: 'client_name', label: 'Client name' },
    { key: 'client_email', label: 'Client email' },

    { key: 'commission_basis_price', label: 'Commission basis price' },
    { key: 'commission_rate', label: 'Commission rate' },
    { key: 'total_sales_rent_price', label: 'Total sales or rent price' },

    { key: 'title_officer_name', label: 'Title officer name', when: complianceShowsTitleAndLoan },
    { key: 'title_company', label: 'Title company', when: complianceShowsTitleAndLoan },
    { key: 'title_company_email', label: 'Title company email', when: complianceShowsTitleAndLoan },
    { key: 'title_phone', label: 'Title phone', when: complianceShowsTitleAndLoan },

    { key: 'flyer_display_type', label: 'What to show on your flyer' },
    {
      key: 'flyer_division',
      label: 'Flyer division',
      when: (b) => b.flyer_display_type === 'division',
    },
    { key: 'expedite_acknowledged', label: 'Expedite acknowledgement', answered: true },
  ]
}
