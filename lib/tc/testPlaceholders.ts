import type { PreferredVendor, TcSettings, HomesteadCounty } from '@/types/tc-module'
import type { MergeContext } from './renderSendTime'

/**
 * Test-send placeholder context factory.
 *
 * A test send has no transaction, so client/property/agent/date merge
 * fields resolve to recognizable placeholder strings. Office fields,
 * vendor blocks, and the Harris County homestead link resolve to real
 * data so Leah can verify that those parts of a template render correctly
 * end-to-end before the first live transaction goes through.
 *
 * The placeholder values are intentionally obvious ("Test Client",
 * "testclient@example.com") so a reviewer reading the email in Outlook
 * knows at a glance that it came from the test-send path.
 */

export interface BuildTestContextInput {
  admin: {
    email: string
    first_name: string
    last_name: string
    preferred_first_name?: string | null
    preferred_last_name?: string | null
  }
  settings: Pick<
    TcSettings,
    | 'office_email'
    | 'office_phone'
    | 'default_reply_to'
    | 'google_review_link'
    | 'office_locations_html'
  >
  vendors: PreferredVendor[]
  harrisCounty: HomesteadCounty | null
  /** The sender mailbox selected in the modal. Used as {{tc_email}}. */
  fromEmail: string
}

function formatCentralDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  })
}

function adminDisplayName(admin: BuildTestContextInput['admin']): string {
  const first = admin.preferred_first_name || admin.first_name
  const last = admin.preferred_last_name || admin.last_name
  return `${first} ${last}`.trim()
}

export function buildTestContext(input: BuildTestContextInput): MergeContext {
  const { admin, settings, vendors, harrisCounty, fromEmail } = input

  const today = new Date()
  const plus = (days: number): Date => {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return d
  }

  const adminName = adminDisplayName(admin)

  return {
    // --- Client (fixed placeholder values) -----------------------------
    client_first_name: 'Test',
    client_full_name: 'Test Client',
    client_email: 'testclient@example.com',
    client_phone: '(555) 123-4567',

    // --- Property (fixed placeholder values) ---------------------------
    property_address: '123 Example St, Houston, TX 77001',
    property_street: '123 Example St',
    property_city: 'Houston',

    // --- Dates (anchored to today, Central time) -----------------------
    effective_date: formatCentralDate(today),
    closing_date: formatCentralDate(plus(30)),
    option_end_date: formatCentralDate(plus(10)),
    tpfa_end_date: formatCentralDate(plus(14)),
    move_in_date: formatCentralDate(plus(30)),

    // --- Agents (admin stands in for CRC agent and TC during tests) ----
    crc_agent_name: adminName,
    crc_agent_email: admin.email,
    // Per Tara: pull the real office phone so test emails look professional
    // if Leah shows them to colleagues. Falls back to empty string if the
    // setting is not configured yet.
    crc_agent_phone: settings.office_phone || '',
    other_agent_name: 'External Test Agent',
    tc_name: adminName,
    tc_email: fromEmail,

    // --- Office (real values from tc_settings) -------------------------
    office_email: settings.office_email || '',
    office_phone: settings.office_phone || '',
    default_reply_to: settings.default_reply_to || '',
    office_locations_html: settings.office_locations_html || '',
    google_review_link: settings.google_review_link || '',

    // --- Homestead (Harris County only for tests) ----------------------
    homestead_application_link: harrisCounty?.link_url || '',

    // --- Vendors (real, for block rendering) ---------------------------
    vendors,
  }
}

export function isHarrisCountyMissing(county: HomesteadCounty | null): boolean {
  return !county || !county.link_url
}
