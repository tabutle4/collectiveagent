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
