/**
 * Centralized constants for Collective Agent app
 * Import from here instead of hardcoding values
 */

// ═══════════════════════════════════════════════════════════════════════════
// SESSION & AUTH
// ═══════════════════════════════════════════════════════════════════════════

export const SESSION_DURATION_HOURS = 8
export const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000

// ═══════════════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ROLES = {
  AGENT: 'agent',
  TC: 'tc',
  OPERATIONS: 'operations',
  BROKER: 'broker',
  SUPPORT: 'support',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

// Roles that can access /admin paths
export const ADMIN_ROLES: RoleName[] = ['broker', 'operations', 'tc', 'support']

// Roles with full admin privileges (can edit everything)
export const ELEVATED_ROLES: RoleName[] = ['broker', 'operations']

// ═══════════════════════════════════════════════════════════════════════════
// PATHS
// ═══════════════════════════════════════════════════════════════════════════

export const PATHS = {
  ADMIN_PREFIX: '/admin',
  AGENT_PREFIX: '/agent',
  LOGIN: '/auth/login',
  DASHBOARD_ADMIN: '/admin/dashboard',
  DASHBOARD_AGENT: '/agent/dashboard',
} as const

// Paths accessible by all authenticated users (not just admin or agent specific)
export const SHARED_PATHS = ['/transactions', '/training-center', '/roster', '/agent/profile']

// Public paths that don't require authentication
export const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/prospective-agent-form',
  '/agent-fee-info',
  '/campaign',
  '/forms',
  '/seller',
  '/onboard',
]

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY INFO
// ═══════════════════════════════════════════════════════════════════════════

export const COMPANY = {
  NAME: 'Collective Realty Co.',
  LEGAL_NAME: 'Referral Collective LLC',

  // Emails
  EMAIL_INFO: 'info@collectiverealtyco.com',
  EMAIL_OFFICE: 'office@collectiverealtyco.com',
  EMAIL_TC: 'tcandcompliance@collectiverealtyco.com',
  EMAIL_TRANSACTIONS: 'transactions@collectiverealtyco.com',
  EMAIL_PM: 'pm@collectiverealtyco.com',

  // Addresses
  ADDRESS_HOUSTON: '13201 Northwest Fwy, Ste 450, Houston, TX 77040',
  ADDRESS_DFW: 'Irving, TX', // Full address in company_settings

  // URLs
  URL_PRODUCTION: 'https://agent.collectiverealtyco.com',
  URL_TRAINING_CENTER: 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter',
} as const

// ═══════════════════════════════════════════════════════════════════════════
// BILLING
// ═══════════════════════════════════════════════════════════════════════════

export const BILLING = {
  MONTHLY_FEE: 50,
  ONBOARDING_FEE: 399,
  EXPEDITE_FEE: 95,
  LATE_FEE: 25,
} as const

// ═══════════════════════════════════════════════════════════════════════════
// OFFICES
// ═══════════════════════════════════════════════════════════════════════════

export const OFFICES = ['Houston', 'DFW'] as const
export type OfficeName = (typeof OFFICES)[number]

// ═══════════════════════════════════════════════════════════════════════════
// MLS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const MLS_TYPES = ['HAR', 'NTREIS', 'MetroTex', 'Other'] as const
export type MLSType = (typeof MLS_TYPES)[number]

// The users.mls_choice value that marks someone as a Referral Collective
// agent rather than a Collective Realty Co. one. It is the entity
// discriminator on the shared users table, so it decides who the CRC roster
// lists, who gets billed monthly rather than annually, and which brand an
// email signature carries. Spelled out in ~20 places across the app; new code
// should import it from here.
export const REFERRAL_COLLECTIVE_MLS_CHOICE = 'Referral Collective (No MLS)'

/**
 * An agent may move to Referral Collective at any time. Returning to
 * Collective Realty Co. is limited to two request deadlines a year, and the
 * change takes effect no sooner than company_settings.referral_termination_notice_days
 * after the Brokerage receives the written notice.
 *
 * Stated in the Referral Collective ICA (VI. Termination, subsection d) and on
 * the public Referral Collective information page. Both read this constant so
 * the agreement and the page can never disagree.
 */
export const RC_RETURN_REQUEST_DEADLINES = 'January 1 or June 30'

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION & LIMITS
// ═══════════════════════════════════════════════════════════════════════════

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const

// ═══════════════════════════════════════════════════════════════════════════
// DATE FORMATS
// ═══════════════════════════════════════════════════════════════════════════

export const DATE_FORMAT = {
  DISPLAY: 'MMM d, yyyy',
  INPUT: 'yyyy-MM-dd',
  FULL: 'MMMM d, yyyy',
} as const

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION DEFAULTS (actual values in company_settings table)
// ═══════════════════════════════════════════════════════════════════════════

export const COMMISSION_DEFAULTS = {
  BTSA_MIN_SALE_PCT: 3,
  BTSA_MIN_LEASE_PCT: 40,
  CAP_AMOUNT: 18000,
  QUALIFYING_TRANSACTIONS_TO_UPGRADE: 5,
} as const
