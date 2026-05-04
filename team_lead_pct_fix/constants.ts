import { TransactionStatus } from './types'

// ===== App Role (re-exported for convenience) =====
export type { AppRole } from './role'

// ===== Contact Types =====
// Enforced in code only - not a DB constraint
export const CONTACT_TYPES = [
  { value: 'client', label: 'Client' },
  { value: 'title', label: 'Title Officer / Company' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'internal_referral_agent', label: 'Internal Referral Agent' },
  { value: 'external_referral_agent', label: 'External Referral Agent' },
  { value: 'external_referral_brokerage', label: 'External Referral Brokerage' },
  { value: 'momentum_partner', label: 'Momentum Partner' },
  { value: 'loan_officer', label: 'Loan Officer' },
  { value: 'coop_broker', label: 'Co-op Broker' },
]

export type ContactType = (typeof CONTACT_TYPES)[number]['value']

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
  active: ['prospect', 'active_listing', 'pending'] as TransactionStatus[],
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

// ===== Payment method options (used on payouts and brokerage payments) =====

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'check',   label: 'Check' },
  { value: 'zelle',   label: 'Zelle' },
  { value: 'ach',     label: 'ACH' },
  { value: 'wire',    label: 'Wire' },
  { value: 'payload', label: 'Payload' },
]

// ===== Federal ID type options (for external brokerage 1099 reporting) =====

export const FEDERAL_ID_TYPE_OPTIONS = [
  { value: 'ein', label: 'EIN' },
  { value: 'ssn', label: 'SSN' },
]
