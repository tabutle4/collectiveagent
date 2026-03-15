import { TransactionStatus } from './types'

// ===== Dropdown Options =====

export const REPRESENTATION_TYPES = [
  { value: 'buyer', label: 'Buyer Representation' },
  { value: 'seller', label: 'Seller Representation' },
  { value: 'dual', label: 'Dual Agency' },
  { value: 'intermediary', label: 'Intermediary' },
]

export const TENANT_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'relocating', label: 'Relocating' },
]

export const LOAN_TYPES = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'fha', label: 'FHA' },
  { value: 'va', label: 'VA' },
  { value: 'usda', label: 'USDA' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

export const LEAD_SOURCES = [
  { value: 'brokerage_referral', label: 'Brokerage Referral' },
  { value: 'team_lead_referral', label: 'Team Lead Referral' },
  { value: 'internal_agent_referral', label: 'Internal Agent Referral' },
  { value: 'external_agent_referral', label: 'External Agent Referral' },
  { value: 'repeat_client', label: 'Repeat Client' },
  { value: 'friend_family', label: 'Friend/Family' },
  { value: 'personal_referral', label: 'Personal Referral' },
  { value: 'ig_lead', label: 'IG Lead' },
  { value: 'kvcore_lead', label: 'kvCORE Lead' },
  { value: 'har_lead', label: 'HAR Lead' },
  { value: 'ntreis_lead', label: 'NTREIS Lead' },
  { value: 'other_social_media', label: 'Other Social Media Lead' },
  { value: 'other_listing_service', label: 'Other Listing Service Lead' },
  { value: 'facebook_lead', label: 'Facebook Lead' },
  { value: 'client_referral', label: 'Client Referral' },
  { value: 'other', label: 'Other' },
]

export const FLYER_DIVISIONS = [
  { value: 'sports_ent_hou', label: 'Sports & Entertainment HOU' },
  { value: 'sports_ent_dfw', label: 'Sports & Entertainment DFW' },
  { value: 'community_service', label: 'Community Service' },
  { value: 'events', label: 'Events' },
  { value: 'none', label: 'None' },
]

// ===== Slide Configuration =====

export interface SlideConfig {
  id: string
  title: string
  description: string
  requiredForCompliance: boolean
  showForLeases: boolean
  showForSales: boolean
}

export const CREATION_SLIDES: SlideConfig[] = [
  { id: 'type', title: 'Transaction Type', description: 'Select the type of transaction', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'property', title: 'Property Details', description: 'Property address and MLS info', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'client', title: 'Client Information', description: 'Client name, email, and phone', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'financials', title: 'Financial Details', description: 'Price, commission, and fees', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'dates', title: 'Key Dates', description: 'Closing date, move-in date, lease term', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'details', title: 'Additional Details', description: 'Representation, referrals, expedite', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'title_info', title: 'Title Information', description: 'Title company and officer', requiredForCompliance: true, showForLeases: false, showForSales: true },
  { id: 'documents', title: 'Documents', description: 'Upload required documents', requiredForCompliance: true, showForLeases: true, showForSales: true },
  { id: 'review', title: 'Review & Submit', description: 'Review and save or submit', requiredForCompliance: false, showForLeases: true, showForSales: true },
]

export function getVisibleSlides(isLease: boolean): SlideConfig[] {
  return CREATION_SLIDES.filter(s => isLease ? s.showForLeases : s.showForSales)
}

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
  'preferred_first_name', 'preferred_last_name', 'email', 'office',
  'team_name', 'team_lead', 'commission_plan', 'license_number', 'division',
] as const