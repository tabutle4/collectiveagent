import type { PreferredVendor } from '@/types/tc-module'

/**
 * Merge field registry and preview renderer.
 *
 * The same merge field logic is used in three places:
 *   1. Preview modal on /admin/tc/process-steps
 *   2. Live preview pane on the template editor at /admin/tc/templates/[id]
 *   3. (Future) Server-side send-time rendering, which will produce the
 *      actual HTML that goes out via Graph Mail.Send. That renderer lives
 *      separately because it resolves real transaction data rather than
 *      preview placeholders.
 *
 * This file provides the preview renderer only. The send-time renderer
 * is Patch 4b work.
 */

// ----------------------------------------------------------------------------
// Registry of every merge field the UI knows about.
// ----------------------------------------------------------------------------
// The editor sidebar renders these as clickable pills. Grouping helps
// Leah navigate when there are many fields.

export interface MergeField {
  /** The raw token as it appears in template HTML: "{{client_first_name}}" */
  token: string
  /** Human-readable label for the pill UI. */
  label: string
  /** What the field means at send time. Shown on hover. */
  description: string
  /** Logical grouping for the UI. */
  group: MergeFieldGroup
}

export type MergeFieldGroup =
  | 'client'
  | 'property'
  | 'dates'
  | 'agents'
  | 'office'
  | 'links'
  | 'vendors'

export const MERGE_FIELD_GROUPS: Array<{ key: MergeFieldGroup; label: string }> = [
  { key: 'client', label: 'Client' },
  { key: 'property', label: 'Property' },
  { key: 'dates', label: 'Dates' },
  { key: 'agents', label: 'Agents' },
  { key: 'office', label: 'Office' },
  { key: 'links', label: 'Links' },
  { key: 'vendors', label: 'Vendor blocks' },
]

export const MERGE_FIELDS: MergeField[] = [
  // --- Client ---
  {
    token: '{{client_first_name}}',
    label: 'First name',
    description: 'Primary client first name. For two-client deals, the first listed client.',
    group: 'client',
  },
  {
    token: '{{client_full_name}}',
    label: 'Full name',
    description: 'Primary client full name.',
    group: 'client',
  },
  {
    token: '{{client_email}}',
    label: 'Email',
    description: 'Primary client email address.',
    group: 'client',
  },
  {
    token: '{{client_phone}}',
    label: 'Phone',
    description: 'Primary client phone number.',
    group: 'client',
  },

  // --- Property ---
  {
    token: '{{property_address}}',
    label: 'Full address',
    description: 'Street, city, state, zip.',
    group: 'property',
  },
  {
    token: '{{property_street}}',
    label: 'Street only',
    description: 'Just the street address line.',
    group: 'property',
  },
  {
    token: '{{property_city}}',
    label: 'City',
    description: 'City of the property.',
    group: 'property',
  },

  // --- Dates ---
  {
    token: '{{closing_date}}',
    label: 'Closing date',
    description: 'Scheduled closing date.',
    group: 'dates',
  },
  {
    token: '{{effective_date}}',
    label: 'Effective date',
    description: 'Contract effective date.',
    group: 'dates',
  },
  {
    token: '{{option_end_date}}',
    label: 'Option end date',
    description: 'End of the buyer option period.',
    group: 'dates',
  },
  {
    token: '{{tpfa_end_date}}',
    label: 'TPFA end date',
    description: 'End of the third-party financing addendum period.',
    group: 'dates',
  },
  {
    token: '{{move_in_date}}',
    label: 'Move-in date',
    description: 'Tenant move-in date for leases.',
    group: 'dates',
  },

  // --- Agents ---
  {
    token: '{{crc_agent_name}}',
    label: 'CRC agent name',
    description: 'Name of the Collective Realty Co. agent on the transaction.',
    group: 'agents',
  },
  {
    token: '{{crc_agent_email}}',
    label: 'CRC agent email',
    description: 'Email of the CRC agent.',
    group: 'agents',
  },
  {
    token: '{{crc_agent_phone}}',
    label: 'CRC agent phone',
    description: 'Phone of the CRC agent.',
    group: 'agents',
  },
  {
    token: '{{other_agent_name}}',
    label: 'Other agent name',
    description: 'Name of the external agent on the transaction (if any).',
    group: 'agents',
  },
  {
    token: '{{tc_name}}',
    label: 'TC name',
    description: 'Name of the Transaction Coordinator assigned to the deal.',
    group: 'agents',
  },
  {
    token: '{{tc_email}}',
    label: 'TC email',
    description: 'Email of the assigned TC. Used as the sender address.',
    group: 'agents',
  },

  // --- Office ---
  {
    token: '{{office_email}}',
    label: 'Office email',
    description: 'Configured in TC Settings.',
    group: 'office',
  },
  {
    token: '{{office_phone}}',
    label: 'Office phone',
    description: 'Configured in TC Settings.',
    group: 'office',
  },
  {
    token: '{{default_reply_to}}',
    label: 'Default reply-to',
    description: 'Reply-to email set in TC Settings.',
    group: 'office',
  },
  {
    token: '{{office_locations_html}}',
    label: 'Office locations HTML',
    description: 'HTML block of office locations configured in TC Settings.',
    group: 'office',
  },

  // --- Links ---
  {
    token: '{{google_review_link}}',
    label: 'Google review link',
    description: 'Configured in TC Settings.',
    group: 'links',
  },
  {
    token: '{{homestead_application_link}}',
    label: 'Homestead link',
    description:
      "Resolves per-transaction via homestead_county_id. Leave as-is; don't pick a county here.",
    group: 'links',
  },

  // --- Vendors (special: render as a block, not a substitution) ---
  {
    token: '{{preferred_vendors_inspection}}',
    label: 'Inspection vendors',
    description: 'Renders as a formatted block listing active inspection vendors.',
    group: 'vendors',
  },
  {
    token: '{{preferred_vendors_insurance}}',
    label: 'Insurance vendors',
    description: 'Renders as a formatted block listing active insurance vendors.',
    group: 'vendors',
  },
  {
    token: '{{preferred_vendors_home_warranty}}',
    label: 'Home warranty vendors',
    description: 'Renders as a formatted block listing active home warranty vendors.',
    group: 'vendors',
  },
  {
    token: '{{preferred_vendors_all}}',
    label: 'All vendors',
    description: 'Renders all three vendor groups (inspection, insurance, home warranty).',
    group: 'vendors',
  },
]

// ----------------------------------------------------------------------------
// Preview renderer
// ----------------------------------------------------------------------------
// Resolves vendor blocks with real vendor data and wraps every other
// {{field_name}} as a styled pill. Produces HTML safe to inject via
// dangerouslySetInnerHTML.

export function renderTemplatePreview(body: string, vendors: PreferredVendor[]): string {
  if (!body) return ''

  const byType = vendors
    .filter(v => v.is_active)
    .reduce<Record<string, PreferredVendor[]>>((acc, v) => {
      if (!acc[v.vendor_type]) acc[v.vendor_type] = []
      acc[v.vendor_type].push(v)
      return acc
    }, {})

  const renderVendor = (v: PreferredVendor): string => {
    const lines: string[] = []
    if (v.contact_name) lines.push(escapeHtml(v.contact_name))
    lines.push(escapeHtml(v.company_name))
    if (v.phone) lines.push(escapeHtml(v.phone))
    if (v.email) lines.push(escapeHtml(v.email))
    return `<p style="margin: 0 0 10px 0;">${lines.join('<br>')}</p>`
  }

  const renderGroup = (label: string, type: string): string => {
    const list = byType[type] || []
    if (list.length === 0) return ''
    return `<div style="text-align: center; margin: 16px 0;">
      <p style="margin: 0 0 10px 0;"><strong><u>${label}</u></strong></p>
      ${list.map(renderVendor).join('')}
    </div>`
  }

  let rendered = body

  rendered = rendered.replace(
    /\{\{preferred_vendors_inspection\}\}/g,
    renderGroup('Inspection Companies', 'inspection')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_insurance\}\}/g,
    renderGroup('Insurance Companies', 'insurance')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_home_warranty\}\}/g,
    renderGroup('Home Warranty Companies', 'home_warranty')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_all\}\}/g,
    renderGroup('Inspection Companies', 'inspection') +
      renderGroup('Insurance Companies', 'insurance') +
      renderGroup('Home Warranty Companies', 'home_warranty')
  )

  // Every other {{field}} becomes a styled pill showing the readable name.
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const readable = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span style="background: rgba(197, 162, 120, 0.12); color: #C5A278; padding: 1px 6px; border-radius: 4px; font-size: 0.92em; font-weight: 500;">[${readable}]</span>`
  })

  return rendered
}

// ----------------------------------------------------------------------------
// HTML escape helper. Exported because a few callers need to escape user
// content before interpolating into vendor blocks.
// ----------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
