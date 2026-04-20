import type { PreferredVendor, TcSettings } from '@/types/tc-module'
import { EMAIL_COLORS } from '@/lib/email/layout'
import { escapeHtml, renderVendorGroup } from './mergeFields'

/**
 * Send-time merge renderer and TC email layout wrapper.
 *
 * This module is the send-side counterpart to renderTemplatePreview() in
 * mergeFields.ts. The preview renderer wraps unknown tokens in styled pill
 * spans so Leah can see which fields are present. The send renderer
 * produces the final HTML that goes out via Graph Mail.Send, so unknown
 * tokens must resolve to empty strings (not pills) and known tokens must
 * resolve to their real (or placeholder, for test sends) values.
 *
 * HTML-escaping policy:
 *   - Text fields (names, addresses, phone numbers, emails, dates, URLs):
 *     escaped via escapeHtml when rendering in 'html' mode.
 *   - office_locations_html: user-authored HTML from tc_settings, injected
 *     raw.
 *   - Vendor block tokens: resolved to HTML snippets via renderVendorGroup,
 *     which escapes per-vendor text internally.
 *   - In 'text' mode (used for subject lines): all values are substituted
 *     raw without escaping, since mail clients render subject as plain
 *     text and entity-encoded subjects look wrong.
 */

// ----------------------------------------------------------------------------
// Merge context
// ----------------------------------------------------------------------------

export interface MergeContext {
  // Client
  client_first_name: string
  client_full_name: string
  client_email: string
  client_phone: string
  // Property
  property_address: string
  property_street: string
  property_city: string
  // Dates (pre-formatted for display)
  closing_date: string
  effective_date: string
  option_end_date: string
  tpfa_end_date: string
  move_in_date: string
  // Agents
  crc_agent_name: string
  crc_agent_email: string
  crc_agent_phone: string
  other_agent_name: string
  tc_name: string
  tc_email: string
  // Office
  office_email: string
  office_phone: string
  default_reply_to: string
  office_locations_html: string // raw HTML
  // Links
  google_review_link: string
  homestead_application_link: string
  // Vendors (resolved via block tokens)
  vendors: PreferredVendor[]
}

// Keys whose values are raw HTML and must not be escaped when inserting
// into an HTML body. Everything else is treated as text.
const RAW_HTML_KEYS: ReadonlySet<string> = new Set(['office_locations_html'])

// Keys skipped by the scalar replacer. `vendors` is an array, handled by
// the block tokens above.
const NON_SCALAR_KEYS: ReadonlySet<string> = new Set(['vendors'])

// ----------------------------------------------------------------------------
// renderMergeFields
// ----------------------------------------------------------------------------

export type RenderMode = 'html' | 'text'

export function renderMergeFields(
  input: string,
  ctx: MergeContext,
  mode: RenderMode = 'html'
): string {
  if (!input) return ''

  let rendered = input

  // Vendor block tokens resolve first because they produce HTML fragments
  // that will themselves contain characters the generic replacer would
  // leave alone. They are also only meaningful in HTML mode; in text mode
  // we substitute empty strings so they do not appear as markup soup in a
  // subject line.
  const vendorsInspection =
    mode === 'html' ? renderVendorGroup('Inspection Companies', 'inspection', ctx.vendors) : ''
  const vendorsInsurance =
    mode === 'html' ? renderVendorGroup('Insurance Companies', 'insurance', ctx.vendors) : ''
  const vendorsWarranty =
    mode === 'html' ? renderVendorGroup('Home Warranty Companies', 'home_warranty', ctx.vendors) : ''

  rendered = rendered.replace(/\{\{preferred_vendors_inspection\}\}/g, () => vendorsInspection)
  rendered = rendered.replace(/\{\{preferred_vendors_insurance\}\}/g, () => vendorsInsurance)
  rendered = rendered.replace(/\{\{preferred_vendors_home_warranty\}\}/g, () => vendorsWarranty)
  rendered = rendered.replace(
    /\{\{preferred_vendors_all\}\}/g,
    () => vendorsInspection + vendorsInsurance + vendorsWarranty
  )

  // Scalar tokens. Unknown keys resolve to empty string.
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    if (NON_SCALAR_KEYS.has(name)) return ''
    const value = (ctx as unknown as Record<string, unknown>)[name]
    if (value == null) return ''
    const str = typeof value === 'string' ? value : String(value)
    if (mode === 'text') return str
    if (RAW_HTML_KEYS.has(name)) return str
    return escapeHtml(str)
  })

  return rendered
}

// ----------------------------------------------------------------------------
// wrapTcEmail
// ----------------------------------------------------------------------------
// Assembles the outer email document: optional banner, body, optional
// signature. Matches the structure shown in the template editor's Live
// Preview. This is TC-specific and deliberately separate from
// getEmailLayout() in lib/email/layout.ts, which is for system
// transactional emails (password resets, onboarding, etc.) with fixed
// chrome.

export interface WrapTcEmailInput {
  bodyHtml: string
  usesBanner: boolean
  usesSignature: boolean
  settings: Pick<TcSettings, 'banner_image_url' | 'signature_html_template'>
  preheader?: string
}

export function wrapTcEmail(input: WrapTcEmailInput): string {
  const { bodyHtml, usesBanner, usesSignature, settings, preheader } = input

  const showBanner = usesBanner && !!settings.banner_image_url
  const showSignature = usesSignature && !!settings.signature_html_template

  const bannerBlock = showBanner
    ? `<div style="text-align:center;margin-bottom:16px;">
         <img src="${escapeHtml(settings.banner_image_url!)}" alt="Collective Realty Co." style="max-width:100%;height:auto;display:block;margin:0 auto;" />
       </div>`
    : ''

  const signatureBlock = showSignature
    ? `<div style="margin-top:24px;">${settings.signature_html_template}</div>`
    : ''

  const preheaderBlock = preheader
    ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.lightBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${EMAIL_COLORS.bodyText};line-height:1.6;">
  ${preheaderBlock}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${EMAIL_COLORS.lightBg};">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${EMAIL_COLORS.white};">
          <tr>
            <td style="padding:24px;">
              ${bannerBlock}
              <div>${bodyHtml}</div>
              ${signatureBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
