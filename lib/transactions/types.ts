// ===== Transaction Status Types =====

export const TRANSACTION_STATUSES = [
  'prospect', 'active_listing', 'pending', 'submitted', 'in_review',
  'revision_requested', 'compliant', 'cda_in_progress', 'payout_in_progress',
  'broker_review', 'cda_sent', 'payout_processed', 'closed', 'cancelled',
] as const

export type TransactionStatus = typeof TRANSACTION_STATUSES[number]

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  prospect: 'Prospect',
  active_listing: 'Active Listing',
  pending: 'Pending',
  submitted: 'Submitted',
  in_review: 'In Review',
  revision_requested: 'Revision Requested',
  compliant: 'Compliant',
  cda_in_progress: 'CDA In Progress',
  payout_in_progress: 'Payout In Progress',
  broker_review: 'Broker Review',
  cda_sent: 'CDA Sent',
  payout_processed: 'Payout Processed',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS: Record<TransactionStatus, string> = {
  prospect: 'text-luxury-gray-3',
  active_listing: 'text-blue-600',
  pending: 'text-yellow-600',
  submitted: 'text-purple-600',
  in_review: 'text-purple-600',
  revision_requested: 'text-orange-600',
  compliant: 'text-green-600',
  cda_in_progress: 'text-blue-600',
  payout_in_progress: 'text-blue-600',
  broker_review: 'text-yellow-600',
  cda_sent: 'text-green-700',
  payout_processed: 'text-green-700',
  closed: 'text-luxury-gray-3',
  cancelled: 'text-red-600',
}

// ===== Compliance Status =====

export const COMPLIANCE_STATUSES = [
  'not_requested', 'submitted', 'in_review', 'approved', 'revision_requested',
] as const

export type ComplianceStatus = typeof COMPLIANCE_STATUSES[number]

// ===== Permission Helpers =====

export const AGENT_EDITABLE_STATUSES: TransactionStatus[] = ['prospect', 'active_listing', 'pending']
export const AGENT_LIMITED_EDIT_STATUSES: TransactionStatus[] = ['revision_requested']
export const LOCKED_STATUSES: TransactionStatus[] = ['closed', 'cancelled']

// ===== Database Interfaces =====

export interface Transaction {
  id: string
  created_at: string
  updated_at: string
  submitted_by: string | null
  transaction_email: string | null
  property_address: string
  status: TransactionStatus
  compliance_status: ComplianceStatus
  processing_fee_type_id: string | null
  transaction_type: string | null
  office_location: string | null
  representing: string | null

  // Client
  client_name: string | null
  client_email: string | null
  client_phone: string | null

  // Property
  mls_number: string | null
  mls_type: string | null
  mls_link: string | null
  county: string | null
  area: string | null

  // Dates
  closing_date: string | null
  closed_date: string | null
  move_in_date: string | null
  listing_date: string | null
  listing_expiration_date: string | null
  buyer_agreement_date: string | null
  buyer_agreement_expiration_date: string | null
  acceptance_date: string | null

  // Financial
  sales_price: number | null
  monthly_rent: number | null
  gross_commission: number | null
  gross_commission_type: string
  listing_side_commission: number | null
  listing_side_commission_type: string
  buying_side_commission: number | null
  buying_side_commission_type: string
  additional_client_commission: number
  bonus_amount: number
  rebate_amount: number

  // Referrals
  has_referral: boolean
  brokerage_referral: boolean
  brokerage_referral_fee: number
  brokerage_referral_fee_type: string
  internal_referral: boolean
  internal_referral_fee: number
  internal_referral_fee_type: string
  external_referral: boolean
  external_referral_fee: number
  external_referral_fee_type: string

  // BTSA
  has_btsa: boolean
  btsa_amount: number

  // eCommission
  has_ecommission: boolean
  ecommission_amount: number

  // Expedite
  expedite_requested: boolean
  expedite_fee: number

  // Lease-specific
  tenant_transaction_type: string | null
  lease_term: number | null

  // Sale-specific
  loan_type: string | null
  representation_type: string | null
  title_officer_name: string | null
  title_company: string | null
  title_company_email: string | null

  // Other
  lead_source: string | null
  flyer_division: string | null
  notes: any | null
  onedrive_folder_url: string | null
  custom_fields: Record<string, any>
  team_agreement_id: string | null
  sales_volume: number | null

  // Lock
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null

  // Compliance timestamps
  compliance_submitted_at: string | null
  compliance_submitted_by: string | null
  compliance_approved_at: string | null
  compliance_approved_by: string | null
  info_confirmed_at: string | null
  info_confirmed_by: string | null

  // CDA/Payout timestamps
  cda_completed_at: string | null
  cda_completed_by: string | null
  broker_approved_at: string | null
  broker_approved_by: string | null
  closed_at: string | null
  closed_by: string | null
  cda_status: string | null
  cda_url: string | null

  // Joined data (optional)
  processing_fee_types?: ProcessingFeeType
}

export interface ProcessingFeeType {
  id: string
  name: string
  code: string
  processing_fee: number
  fee_type: string
  is_lease: boolean
  counts_toward_cap: boolean
  counts_toward_upgrade: boolean
  additional_fee_description: string | null
  is_active: boolean
  display_order: number | null
}

export interface TransactionContact {
  id: string
  created_at: string
  updated_at: string
  transaction_id: string
  contact_type: string
  contact_type_other: string | null
  name: string | null
  phone: any | null
  email: any | null
  company: string | null
  notes: string | null
}

export interface TransactionDocument {
  id: string
  created_at: string
  updated_at: string
  transaction_id: string
  uploaded_by: string | null
  file_name: string
  file_url: string
  file_size: number | null
  file_type: string | null
  required_document_id: string | null
  compliance_status: string
  compliance_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  version: number
  onedrive_file_url: string | null
  onedrive_file_id: string | null
}

export interface RequiredDocument {
  id: string
  processing_fee_type_id: string | null
  name: string
  description: string | null
  is_required: boolean
  display_order: number
  is_active: boolean
}

export interface TransactionInternalAgent {
  id: string
  transaction_id: string
  agent_id: string
  agent_role: string
  commission_plan: string | null
  commission_plan_id: string | null
  agent_basis: number | null
  agent_basis_type: string
  split_percentage: number | null
  split_percentage_type: string
  agent_gross: number | null
  processing_fee: number
  processing_fee_type: string
  coaching_fee: number
  rebate_amount: number
  btsa_amount: number
  agent_net: number | null
  amount_1099_reportable: number | null
  payment_status: string
  payment_date: string | null
  payment_method: string | null
  payment_reference: string | null
  agent_statement_sent: boolean
  agent_statement_sent_date: string | null
  processing_fee_type_id: string | null
  team_lead_commission: number
}

export interface ComplianceReview {
  id: string
  created_at: string
  transaction_id: string
  reviewer_id: string | null
  status: string
  notes: string | null
  completed_at: string | null
}

export interface CheckReceived {
  id: string
  created_at: string
  updated_at: string
  transaction_id: string | null
  agent_id: string | null
  property_address: string | null
  check_amount: number
  check_number: string | null
  check_from: string | null
  check_image_url: string | null
  received_date: string
  deposited_date: string | null
  cleared_date: string | null
  brokerage_amount: number | null
  notes: string | null
  status: string
  compliance_complete_date: string | null
  crc_transferred: boolean
}

export interface CheckPayout {
  id: string
  created_at: string
  check_id: string
  payee_type: string
  user_id: string | null
  payee_name: string | null
  amount: number
  payment_status: string
  payment_date: string | null
  payment_method: string | null
  payment_reference: string | null
}

export interface CommissionPlan {
  id: string
  name: string
  code: string | null
  description: string | null
  agent_split_percentage: number
  firm_split_percentage: number
  agent_split_type: string
  firm_split_type: string
  has_cap: boolean
  cap_amount: number | null
  post_cap_agent_split: number | null
  post_cap_firm_split: number | null
  post_cap_split_type: string
  processing_fee_amount: number
  coaching_fee_amount: number
  min_transactions_to_upgrade: number | null
  upgrade_to_plan_id: string | null
  is_active: boolean
  notes: string | null
}