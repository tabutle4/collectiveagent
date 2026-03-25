// PM Module email layout - extends the base email layout with PM-specific styling
// Uses centralized colors and consistent branding

export const PM_EMAIL_COLORS = {
  accent: '#C5A278', // luxury-accent (tan/gold) - matches app
  headerBg: '#FFFFFF', // white header
  bodyText: '#555555', // luxury-gray-2
  headingText: '#1A1A1A', // luxury-gray-1
  lightText: '#888888', // luxury-gray-3
  lightBg: '#F9F9F9', // luxury-light
  border: '#E5E5E5', // luxury-gray-5
  white: '#FFFFFF',
  buttonText: '#FFFFFF',
}

export const PM_CONTACT = {
  email: 'pm@collectiverealtyco.com',
  phone: '(281) 638-9407',
  name: 'CRC Property Management',
}

// Production URL for email assets (must be absolute for email clients)
const BASE_URL = 'https://agent.collectiverealtyco.com'

/**
 * Generate a complete PM email with header, content, and footer
 */
export function getPMEmailLayout(
  content: string,
  options?: {
    title?: string
    subtitle?: string
    preheader?: string
  }
): string {
  const { title, subtitle, preheader } = options || {}

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: ${PM_EMAIL_COLORS.bodyText}; margin: 0; padding: 0; background-color: ${PM_EMAIL_COLORS.lightBg};">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background-color: ${PM_EMAIL_COLORS.headerBg}; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid ${PM_EMAIL_COLORS.border}; border-bottom: none;">
      <img src="${BASE_URL}/logo.png" alt="Collective Realty Co." style="height: 80px; margin-bottom: 12px;">
      ${title ? `<h1 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.05em; color: ${PM_EMAIL_COLORS.headingText};">${title}</h1>` : ''}
      ${subtitle ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: ${PM_EMAIL_COLORS.lightText};">${subtitle}</p>` : ''}
    </div>
    
    <!-- Content -->
    <div style="background-color: ${PM_EMAIL_COLORS.white}; padding: 28px 24px; border: 1px solid ${PM_EMAIL_COLORS.border}; border-top: none;">
      ${content}
    </div>
    
    <!-- Footer -->
    <div style="background-color: ${PM_EMAIL_COLORS.white}; padding: 16px 24px; border: 1px solid ${PM_EMAIL_COLORS.border}; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
        ${PM_CONTACT.name}<br>
        ${PM_CONTACT.phone} · <a href="mailto:${PM_CONTACT.email}" style="color: ${PM_EMAIL_COLORS.accent}; text-decoration: none;">${PM_CONTACT.email}</a>
      </p>
    </div>
    
  </div>
</body>
</html>`
}

/**
 * Generate a primary CTA button
 */
export function pmEmailButton(text: string, url: string): string {
  return `<p style="text-align: center; margin: 24px 0;">
    <a href="${url}" style="display: inline-block; padding: 12px 28px; background-color: ${PM_EMAIL_COLORS.accent}; color: ${PM_EMAIL_COLORS.buttonText}; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">
      ${text}
    </a>
  </p>`
}

/**
 * Generate a secondary (dark) button
 */
export function pmEmailButtonDark(text: string, url: string): string {
  return `<p style="text-align: center; margin: 24px 0;">
    <a href="${url}" style="display: inline-block; padding: 12px 28px; background-color: ${PM_EMAIL_COLORS.headerBg}; color: ${PM_EMAIL_COLORS.buttonText}; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">
      ${text}
    </a>
  </p>`
}

/**
 * Generate a highlighted content box (e.g., for messages, quotes)
 */
export function pmEmailBox(content: string, label?: string): string {
  return `<div style="background-color: ${PM_EMAIL_COLORS.lightBg}; border-left: 4px solid ${PM_EMAIL_COLORS.accent}; padding: 16px 20px; margin: 20px 0; border-radius: 0 4px 4px 0;">
    ${label ? `<p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; color: ${PM_EMAIL_COLORS.accent}; text-transform: uppercase; letter-spacing: 0.05em;">${label}</p>` : ''}
    <p style="margin: 0; color: ${PM_EMAIL_COLORS.bodyText}; font-size: 14px; white-space: pre-wrap;">${content}</p>
  </div>`
}

/**
 * Generate a detail row (label: value)
 */
export function pmEmailDetail(label: string, value: string): string {
  return `<p style="margin: 8px 0; font-size: 14px;">
    <strong style="color: ${PM_EMAIL_COLORS.headingText};">${label}:</strong> 
    <span style="color: ${PM_EMAIL_COLORS.bodyText};">${value}</span>
  </p>`
}

/**
 * Generate a link styled consistently
 */
export function pmEmailLink(text: string, url: string): string {
  return `<a href="${url}" style="color: ${PM_EMAIL_COLORS.accent}; text-decoration: none;">${text}</a>`
}

/**
 * Generate a greeting line
 */
export function pmEmailGreeting(name: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 15px; color: ${PM_EMAIL_COLORS.headingText};">Hi ${name},</p>`
}

/**
 * Generate paragraph text
 */
export function pmEmailText(text: string): string {
  return `<p style="margin: 12px 0; font-size: 14px; color: ${PM_EMAIL_COLORS.bodyText};">${text}</p>`
}

/**
 * Generate small/muted text
 */
export function pmEmailSmall(text: string): string {
  return `<p style="margin: 12px 0; font-size: 13px; color: ${PM_EMAIL_COLORS.lightText};">${text}</p>`
}

// =============================================================================
// Pre-built email templates for common PM scenarios
// =============================================================================

/**
 * Login link email for landlord/tenant portal
 */
export function pmLoginEmail(firstName: string, userType: 'landlord' | 'tenant', loginUrl: string): string {
  const portalName = userType === 'landlord' ? 'Landlord Portal' : 'Tenant Portal'
  
  return getPMEmailLayout(
    `${pmEmailGreeting(firstName)}
     ${pmEmailText(`Click the button below to sign in to your ${portalName}:`)}
     ${pmEmailButton('Sign In to Portal', loginUrl)}
     ${pmEmailSmall('This link will expire in 15 minutes.')}
     ${pmEmailSmall("If you didn't request this link, you can safely ignore this email.")}`,
    { title: 'Your Login Link', preheader: `Sign in to your ${portalName}` }
  )
}

/**
 * New repair request notification (to admin)
 */
export function pmRepairSubmittedEmail(
  tenantName: string,
  propertyAddress: string,
  title: string,
  description: string,
  urgency: string,
  repairId: string
): string {
  const dashboardUrl = `${BASE_URL}/admin/pm/repairs/${repairId}`
  
  return getPMEmailLayout(
    `${pmEmailText(`<strong>${tenantName}</strong> submitted a new repair request:`)}
     ${pmEmailBox(description, title)}
     ${pmEmailDetail('Property', propertyAddress)}
     ${pmEmailDetail('Urgency', urgency)}
     ${pmEmailText(`Reply to this email to respond directly, or ${pmEmailLink('view in dashboard', dashboardUrl)}.`)}`,
    { title: 'New Repair Request', subtitle: propertyAddress, preheader: `${title} - ${propertyAddress}` }
  )
}

/**
 * Tenant reply notification (to admin)
 */
export function pmTenantReplyEmail(
  tenantName: string,
  propertyAddress: string,
  repairTitle: string,
  message: string,
  repairId: string
): string {
  const dashboardUrl = `${BASE_URL}/admin/pm/repairs/${repairId}`
  
  return getPMEmailLayout(
    `${pmEmailText(`<strong>${tenantName}</strong> replied to a repair request:`)}
     ${pmEmailBox(message)}
     ${pmEmailDetail('Property', propertyAddress)}
     ${pmEmailDetail('Issue', repairTitle)}
     ${pmEmailText(`Reply to this email to respond, or ${pmEmailLink('view in dashboard', dashboardUrl)}.`)}`,
    { title: 'Tenant Reply', subtitle: repairTitle, preheader: `Reply from ${tenantName}` }
  )
}

/**
 * Admin message notification (to tenant)
 */
export function pmAdminMessageEmail(
  tenantFirstName: string,
  propertyAddress: string,
  message: string
): string {
  return getPMEmailLayout(
    `${pmEmailGreeting(tenantFirstName)}
     ${pmEmailText(`You have a new message regarding your repair request at <strong>${propertyAddress}</strong>:`)}
     ${pmEmailBox(message)}
     ${pmEmailSmall('Reply to this email or log in to your tenant portal to respond.')}`,
    { title: 'Repair Request Update', preheader: `Update on your repair at ${propertyAddress}` }
  )
}

/**
 * Repair status update (to tenant)
 */
export function pmRepairStatusEmail(
  tenantFirstName: string,
  propertyAddress: string,
  repairTitle: string,
  newStatus: string,
  notes?: string
): string {
  const statusLabels: Record<string, string> = {
    submitted: 'Submitted',
    in_progress: 'In Progress',
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  
  return getPMEmailLayout(
    `${pmEmailGreeting(tenantFirstName)}
     ${pmEmailText(`Your repair request at <strong>${propertyAddress}</strong> has been updated:`)}
     ${pmEmailDetail('Issue', repairTitle)}
     ${pmEmailDetail('Status', statusLabels[newStatus] || newStatus)}
     ${notes ? pmEmailBox(notes, 'Notes') : ''}
     ${pmEmailSmall('Log in to your tenant portal to view more details.')}`,
    { title: 'Repair Status Update', preheader: `${repairTitle} - ${statusLabels[newStatus] || newStatus}` }
  )
}