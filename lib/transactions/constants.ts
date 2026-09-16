import { TransactionStatus } from './types'

// ===== App Role (re-exported for convenience) =====
export type { AppRole } from './role'

// ===== Contact Types =====
// Enforced in code only - not a DB constraint.
//
// THE list of transaction_contacts.contact_type values. It was previously a
// different list that nothing imported: it offered 'title', 'client' and
// 'coop_broker', while the Contacts tab rendered its own hardcoded options and
// wrote 'title_company' and 'cooperating_agent'. Two dead lists and one live
// set of <option> tags meant the app's "official" vocabulary carried values
// nothing read - and the Payload retainer webhook matched the dead list, which
// is how 11 rows ended up typed 'title' where Send to Title could not see them.
//
// The 15 non-legacy values here are exactly lib/doc-extract.ts
// VALID_CONTACT_TYPES and the ai-checklist-review prompt, so a contact the AI
// extracts and a contact typed by hand land on the same type. This array has 17
// entries: those 15 plus the two legacy values below, which doc-extract maps to
// 'other' and never produces. Keep the 15 in step if either list changes.
// The Contacts tab renders its dropdown from this array; add a type here and it
// appears there.
//
// 'client' and 'title' are kept as LEGACY options because live rows still use
// them. Without them those rows' types would not match any <option> and editing
// one would blank its type.
//
// 'title' is legacy specifically because the Payload retainer webhook used to
// write the PAYING CUSTOMER under it. Those rows are clients and agents, not
// title companies - see TITLE_CONTACT_TYPES below. Do not pick it for new
// contacts; reclassify the existing ones to the party they actually are.
export const CONTACT_TYPES = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'title_company', label: 'Title Company' },
  { value: 'title_officer', label: 'Title Officer' },
  { value: 'lender', label: 'Lender' },
  { value: 'loan_officer', label: 'Loan Officer' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'appraiser', label: 'Appraiser' },
  { value: 'cooperating_agent', label: 'Cooperating Agent' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'hoa', label: 'HOA' },
  { value: 'client', label: 'Client' },
  { value: 'title', label: 'Title (legacy - reclassify)' },
  { value: 'other', label: 'Other' },
]

export type ContactType = (typeof CONTACT_TYPES)[number]['value']

/**
 * Contact types that can supply the Send to Title recipient, most specific
 * first. lib/documents/cdaData.ts and the project_transaction_contacts SQL
 * function both search them in this order and MUST agree.
 *
 * 'title' is deliberately NOT here. The Payload retainer webhook used to write
 * the paying customer under that type, and those 11 live rows are clients,
 * tenants and one competing brokerage - personal gmail, hotmail and aol
 * addresses, plus a literal noemail@noemail.com. Four of them are leases, which
 * have no title company at all. Treating them as title contacts would have put
 * a commission disclosure in a private individual's inbox.
 */
export const TITLE_CONTACT_TYPES = ['title_company', 'title_officer'] as const

/** Contact types that represent a party to the deal, by side. */
export const BUYER_SIDE_CONTACT_TYPES = ['buyer', 'tenant'] as const
export const SELLER_SIDE_CONTACT_TYPES = ['seller', 'landlord'] as const

// ===== Referral Types =====
export const REFERRAL_TYPES = [
  { value: 'none', label: 'No Referral' },
  { value: 'brokerage', label: 'Brokerage Referral (from Courtney)' },
  { value: 'internal', label: 'Internal Agent Referral (CRC agent)' },
  { value: 'external', label: 'External Referral (outside broker)' },
]

export const REFERRAL_FEE_TYPES = [
  { value: 'percent', label: '% of Gross Commission' },
  { value: 'flat', label: 'Flat Amount ($)' },
]

// ===== Loan Types =====
// Matches CDA request form exactly, plus Cash
export const LOAN_TYPES = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'fha', label: 'FHA' },
  { value: 'va', label: 'VA' },
  { value: 'usda', label: 'USDA' },
  { value: 'jumbo', label: 'Jumbo' },
  { value: 'dpa', label: 'Down Payment Assistance (DPA)' },
  { value: 'bond', label: 'Bond / State Housing Program' },
  { value: 'fha_203k', label: 'FHA 203(k) Renovation' },
  { value: 'homestyle', label: 'HomeStyle Renovation' },
  { value: 'construction', label: 'Construction Loan' },
  { value: 'bridge', label: 'Bridge Loan' },
  { value: 'interest_only', label: 'Interest-Only' },
  { value: 'arm', label: 'Adjustable-Rate (ARM)' },
  { value: 'portfolio', label: 'Portfolio Loan' },
  { value: 'cash', label: 'Cash' },
  { value: 'none', label: 'None' },
  { value: 'unknown', label: 'Unknown' },
]

// ===== Lead Sources =====
// 15 options. kvcore_lead removed 2026-04-22 (no longer in use).
// `external_brokerage_referral` was formerly `external_agent_referral`.
export const LEAD_SOURCES = [
  { value: 'brokerage_referral', label: 'Brokerage Referral' },
  { value: 'team_lead_referral', label: 'Team Lead Referral' },
  { value: 'internal_agent_referral', label: 'Internal Agent Referral' },
  { value: 'external_brokerage_referral', label: 'External Brokerage Referral' },
  { value: 'repeat_client', label: 'Repeat Client' },
  { value: 'friend_family', label: 'Friend/Family' },
  { value: 'personal_referral', label: 'Personal Referral' },
  { value: 'ig_lead', label: 'IG Lead' },
  { value: 'har_lead', label: 'HAR Lead' },
  { value: 'ntreis_lead', label: 'NTREIS Lead' },
  { value: 'other_social_media', label: 'Other Social Media Lead' },
  { value: 'other_listing_service', label: 'Other Listing Service Lead' },
  { value: 'facebook_lead', label: 'Facebook Lead' },
  { value: 'client_referral', label: 'Client Referral' },
  { value: 'other', label: 'Other' },
]

export type LeadSourceBucket = 'own' | 'team_lead' | 'firm'

/**
 * Maps a user-facing lead source code to the 3 buckets used by
 * `team_agreement_splits.lead_source` (own, team_lead, firm).
 *
 * Rules:
 *   - brokerage_referral => firm (CRC generated the lead)
 *   - team_lead_referral => team_lead (obvious)
 *   - internal_agent_referral => team_lead IF the referring agent IS the
 *     agent's team lead; else own
 *   - everything else => own
 *
 * Non-team agents don't hit the team_agreement_splits lookup at all, but the
 * bucket is still stored for reporting (firm vs team_lead vs own lead source
 * analytics across the whole brokerage).
 */
export function getLeadSourceBucket(
  leadSource: string | null | undefined,
  referredAgentId?: string | null,
  teamLeadAgentId?: string | null
): LeadSourceBucket {
  if (!leadSource) return 'own'
  // Pass-through: callers may already pass a bucket name directly
  // (e.g. the team-member lead source picker buttons send 'team_lead' /
  // 'own' / 'firm'). Without this, 'team_lead' fell through to 'own' and
  // the team's team_lead split row never matched.
  if (leadSource === 'team_lead' || leadSource === 'firm' || leadSource === 'own') {
    return leadSource
  }
  if (leadSource === 'brokerage_referral') return 'firm'
  if (leadSource === 'team_lead_referral') return 'team_lead'
  if (leadSource === 'internal_agent_referral') {
    if (
      referredAgentId &&
      teamLeadAgentId &&
      referredAgentId === teamLeadAgentId
    ) {
      return 'team_lead'
    }
    return 'own'
  }
  return 'own'
}

/**
 * Lead sources that require a secondary `referred_agent_id` to be set.
 * Used by UI to block save when the picker is empty.
 */
export const LEAD_SOURCES_REQUIRING_AGENT = new Set([
  'internal_agent_referral',
])

// ===== Flyer Divisions =====
// Matches CDA request form, HOU/DFW kept separate, Collective Access added
export const FLYER_DIVISIONS = [
  { value: 'sports_ent_hou', label: 'Sports & Entertainment HOU' },
  { value: 'sports_ent_dfw', label: 'Sports & Entertainment DFW' },
  { value: 'community_service', label: 'Community Service Division' },
  { value: 'leasing', label: 'Leasing Division' },
  { value: 'events', label: 'Events Division' },
  { value: 'agent_engagement', label: 'Agent Engagement Division' },
  { value: 'collective_access_hou', label: 'Collective Access HOU' },
  { value: 'collective_access_dfw', label: 'Collective Access DFW' },
  { value: 'team', label: 'Use My Team Name Instead' },
  { value: 'houston', label: 'Houston' },
  { value: 'dallas', label: 'Dallas' },
]

// ===== Slide Configuration =====
// New 6-slide structure for the unified transaction page

export interface SlideConfig {
  id: string
  title: string
  description: string
  requiredForCompliance: boolean
  showForLeases: boolean
  showForSales: boolean
  adminOnly?: boolean
}

export const TRANSACTION_SLIDES: SlideConfig[] = [
  {
    id: 'type_agent',
    title: 'Transaction Type',
    description: 'Select type, assign agent, and referral info',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'property_contacts',
    title: 'Property & Contacts',
    description: 'Address, key dates, MLS, and contacts',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'commission',
    title: 'Commission',
    description: 'Gross commission, BTSA, rebates, and split',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'documents',
    title: 'Documents',
    description: 'Upload and assign required documents',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'compliance',
    title: 'Compliance Request',
    description: 'Verify all info and submit for review',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'payouts',
    title: 'Checks & Payouts',
    description: 'Process checks, CDAs, and payouts',
    requiredForCompliance: false,
    showForLeases: true,
    showForSales: true,
    adminOnly: true,
  },
]

export function getVisibleSlides(isLease: boolean, role?: string): SlideConfig[] {
  return TRANSACTION_SLIDES.filter(s => {
    if (s.adminOnly && role !== 'admin' && role !== 'broker') return false
    return isLease ? s.showForLeases : s.showForSales
  })
}

// Legacy slide config - kept for backward compatibility with existing pages
// until they are migrated to the new unified page
export interface LegacySlideConfig {
  id: string
  title: string
  description: string
  requiredForCompliance: boolean
  showForLeases: boolean
  showForSales: boolean
}

export const CREATION_SLIDES: LegacySlideConfig[] = [
  {
    id: 'type',
    title: 'Transaction Type',
    description: 'Select the type of transaction',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'property',
    title: 'Property Details',
    description: 'Property address and MLS info',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'client',
    title: 'Client Information',
    description: 'Client name, email, and phone',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'financials',
    title: 'Financial Details',
    description: 'Price, commission, and fees',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'dates',
    title: 'Key Dates',
    description: 'Closing date, move-in date, lease term',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'details',
    title: 'Additional Details',
    description: 'Representation, referrals, expedite',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'title_info',
    title: 'Title Information',
    description: 'Title company and officer',
    requiredForCompliance: true,
    showForLeases: false,
    showForSales: true,
  },
  {
    id: 'documents',
    title: 'Documents',
    description: 'Upload required documents',
    requiredForCompliance: true,
    showForLeases: true,
    showForSales: true,
  },
  {
    id: 'review',
    title: 'Review & Submit',
    description: 'Review and save or submit',
    requiredForCompliance: false,
    showForLeases: true,
    showForSales: true,
  },
]

// ===== Status Groups (for filtering) =====

export const STATUS_GROUPS = {
  active: ['prospect', 'active', 'pending'] as TransactionStatus[],
  compliance: ['submitted', 'in_review', 'revision_requested', 'compliant'] as TransactionStatus[],
  processing: ['cda_in_progress', 'payout_in_progress', 'broker_review'] as TransactionStatus[],
  complete: ['cda_sent', 'payout_processed', 'closed'] as TransactionStatus[],
  cancelled: ['cancelled'] as TransactionStatus[],
}

// ===== Auto-fill fields from agent profile =====

export const AGENT_AUTOFILL_FIELDS = [
  'preferred_first_name',
  'preferred_last_name',
  'email',
  'office',
  'team_name',
  'team_lead',
  'commission_plan',
  'license_number',
  'division',
] as const

// ===== Side options (for transaction sides on TIA + brokerage rows) =====
// Empty option for placeholder; filtered out by callers that don't need it.

export const SIDE_OPTIONS = [
  { value: '',         label: 'Select...' },
  { value: 'buyer',    label: 'Buyer' },
  { value: 'seller',   label: 'Seller' },
  { value: 'tenant',   label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
]

// ===== Brokerage role options (external brokerages) =====
// Consolidated to 3 values. Phase 1 cleanup migrated all legacy values
// (listing_agent, cooperating_agent, other) to one of these three.

export const BROKERAGE_ROLE_OPTIONS = [
  { value: 'buyers_agent',  label: "Buyer's Agent" },
  { value: 'sellers_agent', label: "Seller's Agent" },
  { value: 'referral',      label: 'Referral' },
]

// ===== Internal agent role options (TIA rows) =====

export const AGENT_ROLE_OPTIONS = [
  { value: 'primary_agent',    label: 'Primary Agent' },
  { value: 'listing_agent',    label: 'Listing Agent' },
  { value: 'co_agent',         label: 'Co-Agent' },
  { value: 'team_lead',        label: 'Team Lead' },
  { value: 'referral_agent',   label: 'Referral Agent' },
  { value: 'momentum_partner', label: 'Momentum Partner' },
]

// ===== Payment methods =====
//
// One list. There were two, and they disagreed: this file offered check,
// zelle, ach, wire and payload, while the check entry form offered check,
// zelle, payload and eCommission. So an ACH deposit could not be recorded at
// all, which live data confirms (zero checks carry method 'ach' while ACH
// deposits do happen), and an eCommission check rendered with no label on the
// transaction page because the label lookup read this list.
//
// Direction is the reason the two lists ever diverged, so it is a property
// here rather than a second list.
//
// eCommission is the odd one, and it is not really a method at all. eCommission
// advances money to an agent; at closing Collective Realty Co. withholds that
// amount from the agent's commission and pays eCommission back on the agent's
// behalf. So eCommission is a payee, and the way they are actually paid is ACH
// or check.
//
// It stays on the incoming list because that is where it is used, and removing
// it would erase the only trace of something real. On the four checks carrying
// it, the agent's share went to eCommission rather than to the agent, usually
// for an advance taken against a different deal. None of those four has an
// eCommission debt staged or an eCommission payee row, so that dropdown is the
// sole record that the money did not reach the agent. The proper home is a
// debt row plus an external payee row, which nine other deals do have; until
// that is enforced, do not treat this value as describing how a check arrived.
//
// Everything else genuinely goes both ways.
//
// Values are lowercase. Stored data is not: 299 agent payment rows read 'ACH'
// and 11 read 'Zelle', so every read goes through normalizePaymentMethod or
// paymentMethodLabel rather than comparing raw strings.

export const PAYMENT_METHODS = [
  { value: 'check',       label: 'Check',       incoming: true, outgoing: true },
  { value: 'zelle',       label: 'Zelle',       incoming: true, outgoing: true },
  { value: 'ach',         label: 'ACH',         incoming: true, outgoing: true },
  { value: 'wire',        label: 'Wire',        incoming: true, outgoing: true },
  { value: 'payload',     label: 'Payload',     incoming: true, outgoing: true },
  { value: 'ecommission', label: 'eCommission', incoming: true, outgoing: false },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

/** Money going out: agent payouts, external brokerages, landlords, PM fees. */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS
  .filter(m => m.outgoing)
  .map(m => ({ value: m.value as string, label: m.label as string }))

/** Money coming in: checks received. */
export const INCOMING_PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS
  .filter(m => m.incoming)
  .map(m => ({ value: m.value as string, label: m.label as string }))

/**
 * Stored value to canonical lowercase value, or null if it is not a method we
 * know. Case-insensitive because the stored data is mixed case.
 */
export function normalizePaymentMethod(m: string | null | undefined): PaymentMethod | null {
  if (!m) return null
  const lower = String(m).toLowerCase()
  const hit = PAYMENT_METHODS.find(o => o.value === lower)
  return hit ? hit.value : null
}

/**
 * What a person reads. Anything the list does not cover falls back to the
 * stored value rather than rendering blank, so an unrecognised method is
 * visible rather than silently missing.
 */
export function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return ''
  const hit = PAYMENT_METHODS.find(o => o.value === String(m).toLowerCase())
  return hit ? hit.label : m
}

// ===== Federal ID type options (for external brokerage 1099 reporting) =====

export const FEDERAL_ID_TYPE_OPTIONS = [
  { value: 'ein', label: 'EIN' },
  { value: 'ssn', label: 'SSN' },
]
