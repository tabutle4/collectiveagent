import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'
import { computeCommission } from '@/lib/transactions/math'

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
    // Date-only values parse as midnight UTC, a day early in Central.
    return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', {
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
      'id, property_address, closing_date, closed_date'
    )
    .eq('id', transactionId)
    .single()
  if (!txn) throw new Error('Transaction not found')

  const recipients = await resolveRecipients(agent)
  const agentName = fmtName(agent)
  // The deal carries one full address string; there are no separate city,
  // state or zip columns to append.
  const propertyLabel = txn.property_address || ''

  // Pull the brokerage legal name for the payee label. CDA emails only go to
  // CRC transactions (RC is excluded upstream on the UI), so the CRC name
  // is expected. We still read from settings to stay in sync if CRC renames.
  const { data: agencySettings } = await supabaseAdmin
    .from('company_settings')
    .select('agency_name')
    .limit(1)
    .maybeSingle()
  const agencyName = agencySettings?.agency_name || 'Collective Realty Co.'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
  const cdaUrl = `${appUrl}/api/admin/transactions/${transactionId}/cda/${internalAgentId}`
  const firstName = agent.preferred_first_name || agent.first_name || 'there'

  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">
      Your Commission Disbursement Authorization (CDA) for
      <strong style="color:${EMAIL_COLORS.headingText};">${propertyLabel || 'your recent transaction'}</strong>${
    txn.closing_date || txn.closed_date ? ` closed ${fmtDate(txn.closing_date || txn.closed_date)}` : ''
  } is ready. View it online below; you can print or save a copy for your records.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
      <tr>
        <td style="padding:0 6px;">
          <a href="${cdaUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View CDA</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;color:${EMAIL_COLORS.lightText};font-size:12px;">
      Please let us know if anything looks incorrect so we can make it right.
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

/**
 * Builds the "payment on its way" email for a single TIA row.
 *
 * Sent when the office initiates the payment, not when it clears. Agents used
 * to learn they had been paid only when money appeared in their account, and
 * marking the row paid happens after the funds clear the office bank, which is
 * too late to be news. The figures here are deliberately thin: what is landing,
 * when it was sent, and anything withheld, with the statement carrying the full
 * breakdown. Method and reference appear only when they have actually been
 * recorded -- a default would be a guess presented as fact.
 */
export async function buildPaymentSentEmail(
  transactionId: string,
  internalAgentId: string,
  // The date the caller is about to record. Passed in rather than read back so
  // this whole function can run before the row is claimed, which is what lets a
  // failed read abort the send instead of quoting a wrong figure after the fact.
  sentDate?: string
): Promise<EmailPreview> {
  const { data: tia } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('id, agent_id, payment_method, payment_reference, payment_sent_date')
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
    .select('id, property_address')
    .eq('id', transactionId)
    .single()
  if (!txn) throw new Error('Transaction not found')

  const recipients = await resolveRecipients(agent)
  const firstName = agent.preferred_first_name || agent.first_name || 'there'
  const propertyLabel = txn.property_address || 'your recent transaction'

  // The figure the agent is told has to be the one the statement shows, so the
  // two documents can never disagree. That means computing it the way the
  // statement does rather than reading the TIA row's own columns.
  //
  // agent_net and debts_deducted are only stamped inside mark_paid, which by
  // design happens after this email goes out, so reading them here would quote
  // the full 1099 and suppress the withheld line at exactly the moment a
  // withholding exists. Staged debts, by contrast, are written to agent_debts
  // the instant they are staged, which is before this point.
  //
  // Both reads below capture their error and throw. A failed read here would
  // otherwise return an empty set, which computes to $0.00 and to no
  // withholding -- a wrong number stated to an agent with nothing to signal it
  // went wrong. A statement can be re-rendered once someone notices; an email
  // cannot be recalled. So the caller gets an exception and sends nothing.
  const { data: agentRowsRaw, error: rowsError } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select(
      'id, amount_1099_reportable, agent_gross, btsa_amount, processing_fee, coaching_fee, other_fees, rebate_amount'
    )
    .eq('transaction_id', transactionId)
    .eq('agent_id', tia.agent_id)
  if (rowsError) {
    throw new Error(`Could not read the commission rows for this deal: ${rowsError.message}`)
  }
  const agentRows = agentRowsRaw?.length ? agentRowsRaw : []
  if (!agentRows.length) {
    throw new Error('No commission rows found for this agent on this deal.')
  }

  // Mirrors rowAmount1099 in app/api/statements/[id]/route.ts, including its
  // fallback. A stored zero on a row that carries a computed split means the
  // reportable amount was never stamped, not that the row is worth nothing;
  // without the fallback the email would quote less than the statement it
  // invites the agent to open.
  const rowAmount1099 = (r: any): number => {
    const stored = parseFloat(r.amount_1099_reportable)
    if (stored) return stored
    return computeCommission({
      agent_gross: r.agent_gross,
      btsa_amount: r.btsa_amount,
      processing_fee: r.processing_fee,
      coaching_fee: r.coaching_fee,
      other_fees: r.other_fees,
      rebate_amount: r.rebate_amount,
      credits_applied: 0,
      debts_deducted: 0,
    }).amount_1099
  }
  const amount1099 = agentRows.reduce((s: number, r: any) => s + rowAmount1099(r), 0)

  const { data: appliedDebts, error: debtsError } = await supabaseAdmin
    .from('agent_debts')
    .select('amount_paid')
    .in('offset_transaction_agent_id', agentRows.map((r: any) => r.id))
  if (debtsError) {
    throw new Error(`Could not read the withheld balances for this deal: ${debtsError.message}`)
  }
  const withheld = (appliedDebts || []).reduce(
    (s: number, d: any) => s + (parseFloat(d.amount_paid) || 0), 0
  )
  const netToAgent = Math.round((amount1099 - withheld) * 100) / 100

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
  const statementUrl = `${appUrl}/api/statements/${internalAgentId}`

  const row = (label: string, value: string) => `
    <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};">
      <strong style="color:${EMAIL_COLORS.headingText};">${label}:</strong> ${value}
    </p>`

  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">
      Your commission payment for
      <strong style="color:${EMAIL_COLORS.headingText};">${propertyLabel}</strong>
      has been sent. Depending on your bank it can take a few business days to appear.
    </p>
    <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
      ${row('Amount', fmt$(netToAgent))}
      ${row('Sent', fmtDate(sentDate || tia.payment_sent_date))}
      ${tia.payment_method ? row('Method', String(tia.payment_method)) : ''}
      ${tia.payment_reference ? row('Reference', String(tia.payment_reference)) : ''}
      ${withheld > 0 ? row('Withheld toward your balance', fmt$(withheld)) : ''}
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">
      Your commission statement has the full breakdown of how this amount was calculated.
    </p>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="${statementUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View Statement</a>
    </p>
    <p style="margin:24px 0 0;color:${EMAIL_COLORS.lightText};font-size:12px;">
      Please let us know if anything looks incorrect so we can make it right.
    </p>
  `

  return {
    subject: `Payment sent: ${propertyLabel}`,
    html: getEmailLayout(content, {
      title: 'Payment Sent',
      subtitle: propertyLabel,
      preheader: `Your commission payment for ${propertyLabel} is on its way`,
    }),
    to: recipients.to,
    cc: recipients.cc,
    replyTo: 'transactions@collectiverealtyco.com',
  }
}
