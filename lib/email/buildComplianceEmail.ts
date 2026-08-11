import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

export interface ComplianceDocResult {
  name: string
  notes?: string | null
}

export interface ComplianceEmailPayload {
  propertyAddress: string
  transactionId: string
  reviewerName: string // always "Leah Parpan" regardless of who clicked send
  approved: ComplianceDocResult[]
  rejected: ComplianceDocResult[]
  recheckUrl: string
}

/**
 * Builds the compliance review email exactly matching Leah's current format:
 * - Subject: Reviewed -- [address]
 * - Approved list (green checkmark)
 * - Rejected list (red stop, reason, instructions)
 * - Recheck link button
 */
export function buildComplianceReviewEmail(payload: ComplianceEmailPayload): {
  subject: string
  html: string
} {
  const { propertyAddress, reviewerName, approved, rejected, recheckUrl } = payload

  const hasRejections = rejected.length > 0
  const hasApprovals = approved.length > 0

  // Approved docs section
  const approvedSection = hasApprovals
    ? `
      <div style="margin: 24px 0;">
        <div style="
          display: inline-block;
          background: #16a34a;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 3px;
          margin-bottom: 12px;
        ">Approved: ${approved.length}</div>
        <div style="border-left: 3px solid #16a34a; padding-left: 16px;">
          ${approved
            .map(
              doc => `
            <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
              <span style="color: #16a34a; font-size: 16px; line-height: 1.2; flex-shrink: 0;">&#10003;</span>
              <span style="font-size: 14px; color: ${EMAIL_COLORS.bodyText};">${doc.name}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>`
    : ''

  // Rejected docs section
  const rejectedSection = hasRejections
    ? `
      <div style="margin: 24px 0;">
        <div style="
          display: inline-block;
          background: #dc2626;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 3px;
          margin-bottom: 12px;
        ">Rejected: ${rejected.length}</div>
        <div style="border-left: 3px solid #dc2626; padding-left: 16px;">
          ${rejected
            .map(
              doc => `
            <div style="margin-bottom: 20px;">
              <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                <span style="color: #dc2626; font-size: 16px; line-height: 1.2; flex-shrink: 0;">&#128683;</span>
                <span style="font-size: 14px; font-weight: 600; color: ${EMAIL_COLORS.headingText};">${doc.name}</span>
              </div>
              ${
                doc.notes
                  ? `<div style="font-size: 13px; color: ${EMAIL_COLORS.bodyText}; line-height: 1.6; padding-left: 24px; white-space: pre-wrap;">${doc.notes}</div>`
                  : ''
              }
            </div>`
            )
            .join('')}
        </div>
      </div>`
    : ''

  // Recheck button (only shown when there are rejections)
  const recheckButton = hasRejections
    ? `
      <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: ${EMAIL_COLORS.bodyText};">
          Please complete the item(s) above as soon as possible, then submit the compliance recheck form when complete.
        </p>
        <p style="text-align: center; margin: 0;">
          <a href="${recheckUrl}" style="
            display: inline-block;
            padding: 11px 28px;
            background-color: ${EMAIL_COLORS.accent};
            color: #ffffff;
            text-decoration: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
          ">Submit Compliance Recheck</a>
        </p>
      </div>`
    : ''

  const content = `
    <p style="font-size: 15px; color: ${EMAIL_COLORS.headingText}; margin: 0 0 8px 0;">Hi there,</p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 0 0 4px 0;">
      ${reviewerName} has reviewed all submitted documents and exemption requests.
    </p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.lightText}; margin: 0 0 20px 0;">
      Transaction: ${propertyAddress}
    </p>

    ${approvedSection}
    ${rejectedSection}
    ${recheckButton}

    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 24px 0 0 0;">
      If you have any questions or concerns, please feel free to reply all to this email.
    </p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 8px 0 0 0;">Thank you,</p>
    <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid ${EMAIL_COLORS.border}; font-size: 13px; color: ${EMAIL_COLORS.lightText}; line-height: 1.7;">
      <strong style="color: ${EMAIL_COLORS.headingText};">${reviewerName}</strong><br>
      Transaction Coordination &amp; Compliance<br>
      Collective Realty Co.<br>
      <a href="mailto:compliance@collectiverealtyco.com" style="color: ${EMAIL_COLORS.accent};">compliance@collectiverealtyco.com</a>
    </div>
  `

  const subject = hasRejections
    ? `Action Required -- ${propertyAddress}`
    : `Reviewed -- ${propertyAddress}`

  const html = getEmailLayout(content, {
    title: 'Compliance Review',
    subtitle: propertyAddress,
    preheader: hasRejections
      ? `${rejected.length} document(s) need attention for ${propertyAddress}`
      : `All documents reviewed for ${propertyAddress}`,
  })

  return { subject, html }
}

export interface RetainerEmailPayload {
  clientName: string
  reviewerName: string // always "Leah Parpan" regardless of who clicked send
  status: 'complete' | 'incomplete'
  notes?: string | null
  resubmitUrl: string
}

/**
 * The retainer equivalent of buildComplianceReviewEmail.
 *
 * A retainer carries no document checklist, so the approved/rejected lists that
 * form the whole substance of the compliance email have nothing to render. The
 * status and the reviewer's notes take their place; everything around them --
 * greeting, subject pattern, action block, signature, envelope -- is the same,
 * so an agent reading it recognises it as the same email from the same person.
 */
export function buildRetainerReviewEmail(payload: RetainerEmailPayload): {
  subject: string
  html: string
} {
  const { clientName, reviewerName, status, notes, resubmitUrl } = payload

  const isIncomplete = status === 'incomplete'
  const pillColor = isIncomplete ? '#dc2626' : '#16a34a'
  const pillLabel = isIncomplete ? 'Action Required' : 'Complete'

  const statusSection = `
      <div style="margin: 24px 0;">
        <div style="
          display: inline-block;
          background: ${pillColor};
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 3px;
          margin-bottom: 12px;
        ">${pillLabel}</div>
        <div style="border-left: 3px solid ${pillColor}; padding-left: 16px;">
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <span style="color: ${pillColor}; font-size: 16px; line-height: 1.2; flex-shrink: 0;">${isIncomplete ? '&#128683;' : '&#10003;'}</span>
            <span style="font-size: 14px; color: ${EMAIL_COLORS.bodyText};">Retainer submission for ${clientName}</span>
          </div>
          ${
            notes
              ? `<div style="font-size: 13px; color: ${EMAIL_COLORS.bodyText}; line-height: 1.6; padding-left: 24px; white-space: pre-wrap;">${notes}</div>`
              : ''
          }
        </div>
      </div>`

  const resubmitButton = isIncomplete
    ? `
      <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: ${EMAIL_COLORS.bodyText};">
          Please take care of the item(s) above as soon as possible, then resubmit your retainer. Enter the same client name and pick the existing retainer when prompted, so it updates the one already on file rather than creating a second.
        </p>
        <p style="text-align: center; margin: 0;">
          <a href="${resubmitUrl}" style="
            display: inline-block;
            padding: 11px 28px;
            background-color: ${EMAIL_COLORS.accent};
            color: #ffffff;
            text-decoration: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
          ">Resubmit Retainer</a>
        </p>
      </div>`
    : ''

  const content = `
    <p style="font-size: 15px; color: ${EMAIL_COLORS.headingText}; margin: 0 0 8px 0;">Hi there,</p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 0 0 4px 0;">
      ${reviewerName} has reviewed your retainer submission.
    </p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.lightText}; margin: 0 0 20px 0;">
      Client: ${clientName}
    </p>

    ${statusSection}
    ${resubmitButton}

    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 24px 0 0 0;">
      If you have any questions or concerns, please feel free to reply all to this email.
    </p>
    <p style="font-size: 14px; color: ${EMAIL_COLORS.bodyText}; margin: 8px 0 0 0;">Thank you,</p>
    <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid ${EMAIL_COLORS.border}; font-size: 13px; color: ${EMAIL_COLORS.lightText}; line-height: 1.7;">
      <strong style="color: ${EMAIL_COLORS.headingText};">${reviewerName}</strong><br>
      Transaction Coordination &amp; Compliance<br>
      Collective Realty Co.<br>
      <a href="mailto:compliance@collectiverealtyco.com" style="color: ${EMAIL_COLORS.accent};">compliance@collectiverealtyco.com</a>
    </div>
  `

  const subject = isIncomplete
    ? `Action Required -- Retainer for ${clientName}`
    : `Reviewed -- Retainer for ${clientName}`

  const html = getEmailLayout(content, {
    title: 'Retainer Review',
    subtitle: clientName,
    preheader: isIncomplete
      ? `Your retainer for ${clientName} needs attention`
      : `Your retainer for ${clientName} has been reviewed`,
  })

  return { subject, html }
}
