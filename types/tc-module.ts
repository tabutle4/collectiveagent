/**
 * TC Module. TypeScript type definitions
 *
 * These types mirror the database schema from:
 *   deploy/sql/01_schema.sql
 *   deploy/sql/01_homestead.sql (Patch 2)
 *
 * Keep in sync with any schema changes.
 */

// ----------------------------------------------------------------------------
// Shared enums
// ----------------------------------------------------------------------------

export type TcTransactionType = 'buyer' | 'nc_buyer' | 'seller' | 'all'

export type TcStepType =
  | 'email'
  | 'agent_task'
  | 'tc_task'
  | 'office_task'
  | 'compliance_review'

export type TcStepOwner = 'tc' | 'agent' | 'office'

export type TcAnchor =
  | 'effective_date'
  | 'option_end_date'
  | 'tpfa_end_date'
  | 'closing_date'
  | 'completion_date'

export type TcRecurrence = 'none' | 'mon_thu' | 'weekly'

export type TcEventStatus =
  | 'pending'
  | 'needs_approval'
  | 'approved'
  | 'sent'
  | 'skipped'
  | 'cancelled'
  | 'failed'

export type TcSendVia = 'graph' | 'resend'

export type TcDocumentCategory = 'contract' | 'addenda' | 'amendment'

export type TcVendorType =
  | 'inspection'
  | 'insurance'
  | 'home_warranty'
  | 'title'
  | 'lender'
  | 'other'

export type TcRecipientRole =
  | 'client'
  | 'client2'
  | 'office'
  | 'crc_agent'
  | 'tc'
  | 'coop_agent'
  | 'lender'
  | 'title'
  | 'builder'

export type TcRecipientRoles = {
  to?: TcRecipientRole[]
  cc?: TcRecipientRole[]
  bcc?: TcRecipientRole[]
}

export type TcAttachmentRef = 'contract' | 'addenda' | 'amendment'

// ----------------------------------------------------------------------------
// Entity types
// ----------------------------------------------------------------------------

export interface PreferredVendor {
  id: string
  vendor_type: TcVendorType
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  display_order: number
  is_featured: boolean
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TcEmailTemplate {
  id: string
  slug: string
  name: string
  transaction_type: TcTransactionType
  category: string
  subject: string
  body_format: 'html' | 'plain_text'
  html_body: string | null
  plain_body: string | null
  default_recipient_roles: TcRecipientRoles
  attach_documents: TcAttachmentRef[]
  uses_banner: boolean
  uses_signature: boolean
  is_active: boolean
  notes: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface TcProcessStep {
  id: string
  slug: string
  transaction_type: 'buyer' | 'nc_buyer' | 'seller'
  step_order: number
  step_type: TcStepType
  title: string
  description: string | null
  owner: TcStepOwner | null
  template_id: string | null
  anchor: TcAnchor | null
  offset_days: number | null
  recurrence: TcRecurrence
  recurrence_end_anchor: TcAnchor | null
  recurrence_end_offset: number | null
  is_conditional: boolean
  condition_description: string | null
  needs_approval_by_default: boolean
  show_on_calendar: boolean
  is_active: boolean
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface TcScheduledEvent {
  id: string
  transaction_id: string
  process_step_id: string | null
  scheduled_for: string
  original_scheduled_for: string
  status: TcEventStatus
  recipients_resolved: {
    to?: string[]
    cc?: string[]
    bcc?: string[]
  } | null
  subject_resolved: string | null
  body_resolved: string | null
  attachment_doc_ids: string[] | null
  needs_shift_approval: boolean
  shift_reason: string | null
  last_shifted_at: string | null
  sent_at: string | null
  sent_by_user_id: string | null
  sent_from_user_id: string | null
  sent_via: TcSendVia | null
  graph_message_id: string | null
  skipped_at: string | null
  skipped_by_user_id: string | null
  skipped_reason: string | null
  calendar_event_id: string | null
  send_attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface TcSettings {
  id: string
  banner_image_url: string | null
  signature_html_template: string | null
  tc_calendar_group_id: string | null
  office_email: string
  office_phone: string | null
  default_reply_to: string
  google_review_link: string | null
  office_locations_html: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

// Patch 2: per-county homestead exemption application links.
// Resolved at email send-time via transactions.homestead_county_id.
export interface HomesteadCounty {
  id: string
  county_name: string
  state: string
  link_url: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Extraction types (Claude API output)
// ----------------------------------------------------------------------------

export interface ContractExtraction {
  property_address: string | null
  effective_date: string | null
  option_end_date: string | null
  tpfa_end_date: string | null
  closing_date: string | null
  completion_date: string | null
  earnest_money_amount: number | null
  option_fee_amount: number | null
  sales_price: number | null
  client_name: string | null
  client_email: string | null
  client2_name: string | null
  client2_email: string | null
  listing_agent: {
    name: string | null
    email: string | null
    phone: string | null
    brokerage: string | null
  } | null
  buyer_agent: {
    name: string | null
    email: string | null
    phone: string | null
    brokerage: string | null
  } | null
  title_company: string | null
  title_officer_name: string | null
  lender_company: string | null
  lender_contact_name: string | null
  financing_type: 'conventional' | 'fha' | 'va' | 'cash' | 'other' | null
  confidence: Record<string, number>
}

export interface AmendmentExtraction {
  amendment_effective_date: string | null
  date_changes: Array<{
    field: string
    new_value: string
    confidence: number
  }>
  price_change: {
    new_sales_price: number | null
    credit_amount: number | null
  } | null
  party_changes: Array<{
    party: string
    change: string
  }> | null
  other_changes: string[]
}
