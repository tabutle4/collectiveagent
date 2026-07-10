import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

const fmt$ = (n: number | null | undefined): string => {
  const v = parseFloat(String(n ?? 0))
  if (isNaN(v)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v)
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '--'
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '--'
  }
}

const fmtName = (u: any): string => {
  if (!u) return ''
  return `${u.preferred_first_name || u.first_name || ''} ${
    u.preferred_last_name || u.last_name || ''
  }`.trim()
}

export interface EmailPreview {
  subject: string
  html: string
  to: string
  cc: string | null
  replyTo: string
}

/**
 * Resolves the "to" and "cc" addresses based on the agent and whether the
 * transaction is RC (Referral Collective) or CRC (Collective Realty Co.).
 *
 * CC goes to company_settings.executive_email regardless of entity — this is
 * the owner + ops inbox and is the same records destination for both CRC and
 * RC transactions.
 */
async function resolveRecipients(
  agent: any
): Promise<{ to: string; cc: string | null }> {
  const to = agent.email || agent.office_email || ''
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('executive_email')
    .limit(1)
    .maybeSingle()
  const cc = settings?.executive_email || null
  return { to, cc }
}

/**
 * Builds the Commission Statement email preview for a single TIA row.
 */
export async function buildStatementEmail(
  transactionId: string,
  internalAgentId: string
): Promise<EmailPreview> {
  const { data: tia } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('id, agent_id')
    .eq('id', internalAgentId)
    .single()
  if (!tia) throw new Error('Agent row not found')

  const { data: agent } = await supabaseAdmin
    .from('users')
    .select(
      'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, mls_choice'
    )
    .eq('id', tia.agent_id)
    .single()
  if (!agent) throw new Error('Agent not found')

  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select('id, property_address, transaction_type, closing_date, move_in_date')
    .eq('id', transactionId)
    .single()
  if (!txn) throw new Error('Transaction not found')

  const recipients = await resolveRecipients(agent)
  const firstName = agent.preferred_first_name || agent.first_name || 'there'
  const propertyLabel = txn.property_address || 'your recent transaction'
  const closedLabel = txn.closing_date || txn.move_in_date

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
  const statementUrl = `${appUrl}/api/statements/${internalAgentId}`
  const pdfUrl = `${statementUrl}?format=pdf`

  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">
      Your commission statement for
      <strong style="color:${EMAIL_COLORS.headingText};">${propertyLabel}</strong>${
    closedLabel ? ` closed ${fmtDate(closedLabel)}` : ''
  } is ready. View it online or download a PDF copy below.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
      <tr>
        <td style="padding:0 6px;">
          <a href="${statementUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View Statement</a>
        </td>
        <td style="padding:0 6px;">
          <a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background-color:#ffffff;color:#1a1a1a;text-decoration:none;border:1px solid #C5A278;border-radius:4px;font-size:14px;font-weight:600;">Download PDF</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;color:${EMAIL_COLORS.lightText};font-size:12px;">
      Please let us know if anything looks incorrect so we can make it right.
    </p>
  `

  const subject = `Commission statement: ${propertyLabel}`

  return {
    subject,
    html: getEmailLayout(content, {
      title: 'Commission Statement',
      subtitle: propertyLabel,
      preheader: `Your commission statement for ${propertyLabel} is ready to view`,
    }),
    to: recipients.to,
    cc: recipients.cc,
    replyTo: 'transactions@collectiverealtyco.com',
  }
}

/**
 * Builds the CDA (Commission Disbursement Authorization) email preview.
 * Typically sent to the title company, cc'd to brokerage_main_email.
 * On-card version sends it to the agent so they can forward it to title.
 */
export async function buildCdaEmail(
  transactionId: string,
  internalAgentId: string
): Promise<EmailPreview> {
  const { data: tia } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select(
      `
        id, agent_id, agent_role, agent_basis, split_percentage,
        agent_gross, processing_fee, coaching_fee, other_fees,
        agent_net, team_lead_commission, brokerage_split
      `
    )
    .eq('id', internalAgentId)
    .single()
  if (!tia) throw new Error('Agent row not found')

  const { data: agent } = await supabaseAdmin
    .from('users')
    .select(
      'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, mls_choice'
    )
    .eq('id', tia.agent_id)
    .single()
  if (!agent) throw new Error('Agent not found')

  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select(
      'id, property_address, property_city, property_state, property_zip, transaction_type, sales_price, closing_date, closed_date, title_company_name, title_company_email, title_company_contact_name'
    )
    .eq('id', transactionId)
    .single()
  if (!txn) throw new Error('Transaction not found')

  const recipients = await resolveRecipients(agent)
  const agentName = fmtName(agent)
  const propertyLabel = [txn.property_address, txn.property_city, txn.property_state, txn.property_zip]
    .filter(Boolean)
    .join(', ')

  // Pull the brokerage legal name for the payee label. CDA emails only go to
  // CRC transactions (RC is excluded upstream on the UI), so the CRC name
  // is expected. We still read from settings to stay in sync if CRC renames.
  const { data: agencySettings } = await supabaseAdmin
    .from('company_settings')
    .select('agency_name')
    .limit(1)
    .maybeSingle()
  const agencyName = agencySettings?.agency_name || 'Collective Realty Co.'

  const disburseAmount = Number(tia.agent_gross || 0) + Number(tia.brokerage_split || 0)

  const content = `
    <p class="email-greeting">CDA: Commission Disbursement Authorization</p>
    <p style="margin: 0 0 16px; color: ${EMAIL_COLORS.bodyText};">
      This Commission Disbursement Authorization is for the transaction below.
      Title company may disburse commission per the breakdown.
    </p>

    <div class="email-section">
      <h3 style="margin-bottom: 10px;">Property</h3>
      <p style="margin: 0; color: ${EMAIL_COLORS.headingText};">${propertyLabel || '--'}</p>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 10px;">
        <tr><td style="padding: 4px 0; color: ${EMAIL_COLORS.lightText};">Sales price</td>
            <td style="text-align: right; color: ${EMAIL_COLORS.headingText};">${fmt$(txn.sales_price)}</td></tr>
        <tr><td style="padding: 4px 0; color: ${EMAIL_COLORS.lightText};">Closing</td>
            <td style="text-align: right; color: ${EMAIL_COLORS.headingText};">${fmtDate(txn.closing_date || txn.closed_date)}</td></tr>
      </table>
    </div>

    <div class="email-section">
      <h3 style="margin-bottom: 10px;">Agent</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 4px 0; color: ${EMAIL_COLORS.lightText};">Name</td>
            <td style="text-align: right; color: ${EMAIL_COLORS.headingText};">${agentName}</td></tr>
        <tr><td style="padding: 4px 0; color: ${EMAIL_COLORS.lightText};">Role</td>
            <td style="text-align: right; color: ${EMAIL_COLORS.headingText};">${String(tia.agent_role || '').replace(/_/g, ' ')}</td></tr>
      </table>
    </div>

    <div class="email-section">
      <h3 style="margin-bottom: 10px;">Disbursement</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 4px 0; color: ${EMAIL_COLORS.lightText};">To ${agencyName}</td>
            <td style="text-align: right; color: ${EMAIL_COLORS.headingText}; font-weight: 600;">${fmt$(disburseAmount)}</td></tr>
      </table>
      <p style="margin: 10px 0 0; color: ${EMAIL_COLORS.lightText}; font-size: 12px;">
        Please make check payable to ${agencyName} and deliver per the
        instructions we'll provide at closing.
      </p>
    </div>

    ${
      txn.title_company_name
        ? `<p style="margin: 16px 0 0; color: ${EMAIL_COLORS.bodyText}; font-size: 13px;">
            Title company: ${txn.title_company_name}${
            txn.title_company_contact_name ? ` · ${txn.title_company_contact_name}` : ''
          }${txn.title_company_email ? ` · ${txn.title_company_email}` : ''}
          </p>`
        : ''
    }

    <p style="margin: 20px 0 0; color: ${EMAIL_COLORS.lightText}; font-size: 12px;">
      Questions? Reply to this email or contact the brokerage.
    </p>
  `

  const subject = `CDA: ${propertyLabel || 'Transaction'}`

  return {
    subject,
    html: getEmailLayout(content, {
      title: 'Commission Disbursement Authorization',
      subtitle: propertyLabel,
      preheader: `CDA for ${propertyLabel}`,
    }),
    to: recipients.to,
    cc: recipients.cc,
    replyTo: 'transactions@collectiverealtyco.com',
  }
}
