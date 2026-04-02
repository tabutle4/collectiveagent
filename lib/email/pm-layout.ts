// PM Module email layout - extends the base email layout with PM-specific styling
// Uses centralized colors and consistent branding
// All styles are INLINE for maximum email client compatibility

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
    
    <!-- Header with white background and accent border -->
    <div style="background-color: ${PM_EMAIL_COLORS.headerBg}; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid ${PM_EMAIL_COLORS.border}; border-bottom: 3px solid ${PM_EMAIL_COLORS.accent};">
      ${title ? `<h1 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${PM_EMAIL_COLORS.headingText};">${title}</h1>` : ''}
      ${subtitle ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">${subtitle}</p>` : ''}
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
    <a href="${url}" style="display: inline-block; padding: 12px 28px; background-color: #1A1A1A; color: ${PM_EMAIL_COLORS.buttonText}; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">
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
    { title: 'CRC Property Management', subtitle: 'Your Login Link', preheader: `Sign in to your ${portalName}` }
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
     ${pmEmailButton('View in Dashboard', dashboardUrl)}`,
    { title: 'CRC Property Management', subtitle: 'New Repair Request', preheader: `${title} - ${propertyAddress}` }
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
     ${pmEmailButton('View in Dashboard', dashboardUrl)}`,
    { title: 'CRC Property Management', subtitle: 'Tenant Reply', preheader: `Reply from ${tenantName}` }
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
     ${pmEmailButton('View in Tenant Portal', `${BASE_URL}/pm/login`)}`,
    { title: 'CRC Property Management', subtitle: 'Repair Request Update', preheader: `Update on your repair at ${propertyAddress}` }
  )
}

/**
 * Admin message sent notification (to admin team - so everyone sees admin replies)
 */
export function pmAdminMessageSentEmail(
  adminName: string,
  tenantName: string,
  propertyAddress: string,
  repairTitle: string,
  message: string,
  repairId: string
): string {
  const dashboardUrl = `${BASE_URL}/admin/pm/repairs/${repairId}`
  
  return getPMEmailLayout(
    `${pmEmailText(`<strong>${adminName}</strong> sent a message to <strong>${tenantName}</strong>:`)}
     ${pmEmailBox(message)}
     ${pmEmailDetail('Property', propertyAddress)}
     ${pmEmailDetail('Issue', repairTitle)}
     ${pmEmailButton('View in Dashboard', dashboardUrl)}`,
    { title: 'CRC Property Management', subtitle: 'Staff Reply Sent', preheader: `Reply sent to ${tenantName}` }
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
     ${pmEmailButton('View in Tenant Portal', `${BASE_URL}/pm/login`)}`,
    { title: 'CRC Property Management', subtitle: 'Repair Status Update', preheader: `${repairTitle} - ${statusLabels[newStatus] || newStatus}` }
  )
}

/**
 * Bank activation email for landlord
 */
export function pmBankActivationEmail(
  landlordName: string,
  activationUrl: string
): string {
  return getPMEmailLayout(
    `${pmEmailGreeting(landlordName)}
     ${pmEmailText('Please connect your bank account to receive rent disbursements via ACH.')}
     ${pmEmailText('This secure link will allow you to:')}
     <ul style="margin: 10px 0; padding-left: 20px; color: ${PM_EMAIL_COLORS.bodyText}; font-size: 14px;">
       <li>Verify your identity</li>
       <li>Connect your bank account</li>
       <li>Start receiving automatic deposits</li>
     </ul>
     ${pmEmailButton('Connect Bank Account', activationUrl)}
     ${pmEmailSmall('This link expires in 7 days. If you have any questions, please contact us.')}`,
    { title: 'CRC Property Management', subtitle: 'Bank Account Setup', preheader: 'Connect your bank account to receive rent disbursements' }
  )
}

/**
 * Rent due email for tenant
 */
export function pmRentDueEmail(
  tenantName: string,
  propertyAddress: string,
  amount: number,
  dueDate: string,
  paymentUrl: string
): string {
  return getPMEmailLayout(
    `${pmEmailGreeting(tenantName)}
     ${pmEmailText('Your rent payment is due.')}
     ${pmEmailDetail('Property', propertyAddress)}
     ${pmEmailDetail('Amount Due', `$${amount.toLocaleString()}`)}
     ${pmEmailDetail('Due Date', dueDate)}
     ${pmEmailButton('Pay Now', paymentUrl)}`,
    { title: 'CRC Property Management', subtitle: 'Rent Payment Due', preheader: `Your rent of $${amount.toLocaleString()} is due ${dueDate}` }
  )
}

/**
 * Tenant portal invite email
 */
export function pmTenantInviteEmail(
  tenantName: string,
  propertyAddress: string
): string {
  return getPMEmailLayout(
    `${pmEmailGreeting(tenantName)}
     ${pmEmailText(`You've been added as a tenant at <strong>${propertyAddress}</strong>.`)}
     ${pmEmailText('Your tenant portal is ready. From there you can:')}
     <ul style="margin: 10px 0; padding-left: 20px; color: ${PM_EMAIL_COLORS.bodyText}; font-size: 14px;">
       <li>View your lease details</li>
       <li>Pay rent online</li>
       <li>Submit maintenance requests</li>
       <li>Contact property management</li>
     </ul>
     ${pmEmailButton('Access Tenant Portal', `${BASE_URL}/pm/login`)}
     ${pmEmailSmall('Click the button above and enter your email to receive a secure login link.')}`,
    { title: 'CRC Property Management', subtitle: 'Portal Access', preheader: `Access your tenant portal for ${propertyAddress}` }
  )
}

/**
 * Landlord portal invite email
 */
export function pmLandlordInviteEmail(
  landlordName: string
): string {
  return getPMEmailLayout(
    `${pmEmailGreeting(landlordName)}
     ${pmEmailText('Welcome to CRC Property Management! Your landlord portal is now ready.')}
     ${pmEmailText('<strong>To receive rent disbursements, you\'ll need to complete two quick steps:</strong>')}
     <ol style="margin: 10px 0; padding-left: 20px; color: ${PM_EMAIL_COLORS.bodyText}; font-size: 14px;">
       <li style="margin-bottom: 8px;"><strong>Submit your W9</strong> - Required for tax reporting (we'll send you a 1099 at year-end)</li>
       <li><strong>Connect your bank account</strong> - So we can deposit rent payments directly via ACH</li>
     </ol>
     ${pmEmailText('Both can be completed from your portal in just a few minutes.')}
     ${pmEmailText('<strong>Once set up, you\'ll be able to:</strong>')}
     <ul style="margin: 10px 0; padding-left: 20px; color: ${PM_EMAIL_COLORS.bodyText}; font-size: 14px;">
       <li>View your properties and tenants</li>
       <li>Track rent payments and disbursements</li>
       <li>Download monthly statements</li>
     </ul>
     ${pmEmailButton('Access Landlord Portal', `${BASE_URL}/pm/login`)}
     ${pmEmailSmall('Click the button above and enter your email to receive a secure login link.')}`,
    { title: 'CRC Property Management', subtitle: 'Welcome to Your Portal', preheader: 'Complete your landlord setup to receive rent payments' }
  )
}

/**
 * Disbursement sent email for landlord
 */
export function pmDisbursementEmail(
  landlordName: string,
  propertyAddress: string,
  grossRent: number,
  managementFee: number,
  netAmount: number,
  periodMonth: number,
  periodYear: number
): string {
  const monthName = new Date(periodYear, periodMonth - 1).toLocaleString('default', { month: 'long' })
  
  return getPMEmailLayout(
    `${pmEmailGreeting(landlordName)}
     ${pmEmailText(`Your rent disbursement for ${monthName} ${periodYear} has been processed.`)}
     <div style="background-color: ${PM_EMAIL_COLORS.lightBg}; padding: 20px; border-radius: 6px; margin: 20px 0;">
       ${pmEmailDetail('Property', propertyAddress)}
       ${pmEmailDetail('Gross Rent', `$${grossRent.toLocaleString()}`)}
       ${pmEmailDetail('Management Fee', `-$${managementFee.toLocaleString()}`)}
       <hr style="border: none; border-top: 1px solid ${PM_EMAIL_COLORS.border}; margin: 12px 0;">
       <p style="margin: 8px 0; font-size: 14px;">
         <strong style="color: ${PM_EMAIL_COLORS.headingText};">Net Disbursement:</strong> 
         <span style="color: ${PM_EMAIL_COLORS.accent}; font-weight: 600;">$${netAmount.toLocaleString()}</span>
       </p>
     </div>
     ${pmEmailText('The funds should arrive in your bank account within 2-3 business days.')}`,
    { title: 'CRC Property Management', subtitle: 'Disbursement Processed', preheader: `Your ${monthName} disbursement of $${netAmount.toLocaleString()} has been sent` }
  )
}