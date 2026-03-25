// PM-specific email layout
// Uses same styling as main layout but with PM branding

const BASE_URL = 'https://agent.collectiverealtyco.com'

export const PM_EMAIL_COLORS = {
  accent: '#C5A278',
  headerBg: '#FFFFFF',
  bodyText: '#555555',
  headingText: '#1A1A1A',
  lightText: '#888888',
  lightBg: '#F9F9F9',
  border: '#E5E5E5',
  white: '#FFFFFF',
  buttonText: '#FFFFFF',
}

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
  ${preheader ? `<span style="display:none;font-size:1px;color:${PM_EMAIL_COLORS.white};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
  <style>
    body {
      font-family: 'Montserrat', 'Trebuchet MS', Arial, sans-serif;
      line-height: 1.6;
      color: ${PM_EMAIL_COLORS.bodyText};
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: ${PM_EMAIL_COLORS.lightBg};
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
    }
    .email-header {
      background-color: ${PM_EMAIL_COLORS.headerBg};
      padding: 24px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
      border: 1px solid ${PM_EMAIL_COLORS.border};
      border-bottom: 3px solid ${PM_EMAIL_COLORS.accent};
    }
    .email-header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: ${PM_EMAIL_COLORS.headingText};
    }
    .email-header p {
      margin: 6px 0 0 0;
      font-size: 12px;
      color: ${PM_EMAIL_COLORS.lightText};
    }
    .email-content {
      background-color: ${PM_EMAIL_COLORS.white};
      padding: 30px 24px;
      border: 1px solid ${PM_EMAIL_COLORS.border};
      border-top: none;
    }
    .email-content p {
      font-size: 14px;
      margin: 12px 0;
      color: ${PM_EMAIL_COLORS.bodyText};
    }
    .email-content h3 {
      font-size: 13px;
      font-weight: 600;
      color: ${PM_EMAIL_COLORS.accent};
      margin: 0 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .email-greeting {
      font-size: 15px;
      color: ${PM_EMAIL_COLORS.headingText};
      margin-bottom: 16px;
    }
    .email-section {
      background-color: ${PM_EMAIL_COLORS.lightBg};
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .email-section p {
      margin: 6px 0;
      font-size: 13px;
    }
    .email-btn {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${PM_EMAIL_COLORS.accent};
      color: ${PM_EMAIL_COLORS.buttonText} !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .email-btn-dark {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${PM_EMAIL_COLORS.headingText};
      color: ${PM_EMAIL_COLORS.buttonText} !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .email-divider {
      border: none;
      border-top: 1px solid ${PM_EMAIL_COLORS.border};
      margin: 24px 0;
    }
    .email-footer {
      padding: 20px 24px;
      border: 1px solid ${PM_EMAIL_COLORS.border};
      border-top: none;
      border-radius: 0 0 8px 8px;
      background-color: ${PM_EMAIL_COLORS.white};
    }
    .email-footer p {
      margin: 0;
      font-size: 11px;
      color: ${PM_EMAIL_COLORS.lightText};
      text-align: center;
    }
    .email-footer a {
      color: ${PM_EMAIL_COLORS.accent};
      text-decoration: none;
    }
    .email-signature {
      margin-top: 24px;
      font-size: 13px;
      color: ${PM_EMAIL_COLORS.bodyText};
    }
    .email-signature strong {
      color: ${PM_EMAIL_COLORS.headingText};
    }
    ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    li {
      margin: 6px 0;
      font-size: 13px;
      color: ${PM_EMAIL_COLORS.bodyText};
    }
    a {
      color: ${PM_EMAIL_COLORS.accent};
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    ${
      title
        ? `<div class="email-header">
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>`
        : ''
    }
    
    <div class="email-content">
      ${content}
    </div>
    
    <div class="email-footer">
      <p>CRC Property Management | Collective Realty Co.</p>
      <p style="margin-top: 4px;">13201 Northwest Fwy, Ste 450, Houston, TX</p>
    </div>
  </div>
</body>
</html>`
}

// Helper to wrap content in a section box
export function pmEmailSection(title: string, content: string): string {
  return `<div class="email-section"><h3>${title}</h3>${content}</div>`
}

// Helper for a centered button
export function pmEmailButton(text: string, url: string, dark?: boolean): string {
  const cls = dark ? 'email-btn-dark' : 'email-btn'
  return `<p style="text-align:center;margin:20px 0;"><a href="${url}" class="${cls}">${text}</a></p>`
}

// ============================================
// PM EMAIL TEMPLATES
// ============================================

// Tenant: New repair request submitted (confirmation to tenant)
export function pmRepairSubmittedEmail(data: {
  tenantName: string
  propertyAddress: string
  category: string
  description: string
  repairId: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.tenantName},</p>
    <p>Your maintenance request has been submitted and our team will review it shortly.</p>
    
    <div class="email-section">
      <h3>Request Details</h3>
      <p><strong>Property:</strong> ${data.propertyAddress}</p>
      <p><strong>Category:</strong> ${data.category}</p>
      <p><strong>Description:</strong> ${data.description}</p>
    </div>
    
    <p>We'll be in touch with updates on the status of your request.</p>
    
    ${pmEmailButton('View in Tenant Portal', `${BASE_URL}/pm/tenant/login`)}
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Maintenance Request Received - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Maintenance Request Received',
      preheader: `Your maintenance request for ${data.propertyAddress} has been submitted.`,
    }),
  }
}

// Admin: New repair request notification
export function pmRepairAdminNotificationEmail(data: {
  tenantName: string
  tenantEmail: string
  propertyAddress: string
  landlordName: string
  category: string
  description: string
  urgency: string
  repairId: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">New Maintenance Request</p>
    <p>A tenant has submitted a new maintenance request that requires attention.</p>
    
    <div class="email-section">
      <h3>Request Details</h3>
      <p><strong>Tenant:</strong> ${data.tenantName} (${data.tenantEmail})</p>
      <p><strong>Property:</strong> ${data.propertyAddress}</p>
      <p><strong>Landlord:</strong> ${data.landlordName}</p>
      <p><strong>Category:</strong> ${data.category}</p>
      <p><strong>Urgency:</strong> ${data.urgency}</p>
      <p><strong>Description:</strong> ${data.description}</p>
    </div>
    
    ${pmEmailButton('View in Dashboard', `${BASE_URL}/admin/pm/repairs/${data.repairId}`)}
  `

  return {
    subject: `[PM] New Repair Request - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'New Maintenance Request',
      preheader: `New repair request from ${data.tenantName} at ${data.propertyAddress}`,
    }),
  }
}

// Tenant: Repair status update
export function pmRepairStatusEmail(data: {
  tenantName: string
  propertyAddress: string
  category: string
  status: string
  statusMessage?: string
  repairId: string
}): { subject: string; html: string } {
  const statusLabels: Record<string, string> = {
    pending: 'Pending Review',
    in_progress: 'In Progress',
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }

  const content = `
    <p class="email-greeting">Hi ${data.tenantName},</p>
    <p>There's an update on your maintenance request.</p>
    
    <div class="email-section">
      <h3>Status Update</h3>
      <p><strong>Property:</strong> ${data.propertyAddress}</p>
      <p><strong>Category:</strong> ${data.category}</p>
      <p><strong>Status:</strong> ${statusLabels[data.status] || data.status}</p>
      ${data.statusMessage ? `<p><strong>Note:</strong> ${data.statusMessage}</p>` : ''}
    </div>
    
    ${pmEmailButton('View in Tenant Portal', `${BASE_URL}/pm/tenant/login`)}
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Maintenance Update: ${statusLabels[data.status] || data.status} - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Maintenance Status Update',
      preheader: `Your maintenance request status: ${statusLabels[data.status] || data.status}`,
    }),
  }
}

// Tenant: Message from admin
export function pmAdminMessageEmail(data: {
  tenantName: string
  propertyAddress: string
  category: string
  message: string
  senderName: string
  repairId: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.tenantName},</p>
    <p>You have a new message regarding your maintenance request.</p>
    
    <div class="email-section">
      <h3>Message from ${data.senderName}</h3>
      <p>${data.message}</p>
    </div>
    
    <p style="font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
      <strong>Property:</strong> ${data.propertyAddress}<br>
      <strong>Category:</strong> ${data.category}
    </p>
    
    ${pmEmailButton('View in Tenant Portal', `${BASE_URL}/pm/tenant/login`)}
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Message About Your Maintenance Request - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'New Message',
      preheader: `New message from ${data.senderName} about your maintenance request`,
    }),
  }
}

// Admin: Tenant reply notification
export function pmTenantReplyEmail(data: {
  tenantName: string
  propertyAddress: string
  category: string
  message: string
  repairId: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Tenant Reply</p>
    <p>A tenant has replied to a maintenance request conversation.</p>
    
    <div class="email-section">
      <h3>Message from ${data.tenantName}</h3>
      <p>${data.message}</p>
    </div>
    
    <p style="font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
      <strong>Property:</strong> ${data.propertyAddress}<br>
      <strong>Category:</strong> ${data.category}
    </p>
    
    ${pmEmailButton('View in Dashboard', `${BASE_URL}/admin/pm/repairs/${data.repairId}`)}
  `

  return {
    subject: `[PM] Tenant Reply - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Tenant Reply',
      preheader: `Reply from ${data.tenantName} on maintenance request`,
    }),
  }
}

// Admin: Copy of message sent to tenant
export function pmAdminMessageSentEmail(data: {
  tenantName: string
  tenantEmail: string
  propertyAddress: string
  category: string
  message: string
  senderName: string
  repairId: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Message Sent</p>
    <p>The following message was sent to ${data.tenantName} (${data.tenantEmail}).</p>
    
    <div class="email-section">
      <h3>Your Message</h3>
      <p>${data.message}</p>
    </div>
    
    <p style="font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
      <strong>Property:</strong> ${data.propertyAddress}<br>
      <strong>Category:</strong> ${data.category}
    </p>
    
    ${pmEmailButton('View in Dashboard', `${BASE_URL}/admin/pm/repairs/${data.repairId}`)}
  `

  return {
    subject: `[PM] Message Sent to ${data.tenantName} - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Message Sent Confirmation',
      preheader: `Your message to ${data.tenantName} was sent successfully`,
    }),
  }
}

// Landlord: Welcome email with dashboard link
export function pmLandlordWelcomeEmail(data: {
  landlordName: string
  dashboardToken: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.landlordName},</p>
    <p>Welcome to CRC Property Management! Your landlord dashboard is ready.</p>
    
    <p>From your dashboard you can:</p>
    <ul>
      <li>View your properties and tenants</li>
      <li>Track rent payments and disbursements</li>
      <li>Download monthly statements</li>
      <li>Complete your W9 and bank setup</li>
    </ul>
    
    ${pmEmailButton('Access Your Dashboard', `${BASE_URL}/pm/landlord/${data.dashboardToken}`)}
    
    <p style="font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
      Save this email - your dashboard link is unique to you.
    </p>
    
    <div class="email-signature">
      Welcome aboard,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: 'Welcome to CRC Property Management',
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Welcome',
      preheader: 'Your landlord dashboard is ready',
    }),
  }
}

// Tenant: Welcome email with portal link
export function pmTenantWelcomeEmail(data: {
  tenantName: string
  propertyAddress: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.tenantName},</p>
    <p>Welcome to your new home at ${data.propertyAddress}!</p>
    
    <p>Your tenant portal is ready. From there you can:</p>
    <ul>
      <li>View your lease details</li>
      <li>Pay rent online</li>
      <li>Submit maintenance requests</li>
      <li>Contact property management</li>
    </ul>
    
    ${pmEmailButton('Access Tenant Portal', `${BASE_URL}/pm/tenant/login`)}
    
    <div class="email-signature">
      Welcome home,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Welcome to ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Welcome',
      preheader: `Welcome to your new home at ${data.propertyAddress}`,
    }),
  }
}

// Landlord: Bank activation email
export function pmBankActivationEmail(data: {
  landlordName: string
  activationUrl: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.landlordName},</p>
    <p>Please connect your bank account to receive rent disbursements via ACH.</p>
    
    <p>This secure link will allow you to:</p>
    <ul>
      <li>Verify your identity</li>
      <li>Connect your bank account</li>
      <li>Start receiving automatic deposits</li>
    </ul>
    
    ${pmEmailButton('Connect Bank Account', data.activationUrl)}
    
    <p style="font-size: 12px; color: ${PM_EMAIL_COLORS.lightText};">
      This link expires in 7 days. If you have any questions, please contact us.
    </p>
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: 'Connect Your Bank Account - CRC Property Management',
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Bank Account Setup',
      preheader: 'Connect your bank account to receive rent disbursements',
    }),
  }
}

// Tenant: Invoice/rent due email
export function pmRentDueEmail(data: {
  tenantName: string
  propertyAddress: string
  amount: number
  dueDate: string
  paymentUrl: string
}): { subject: string; html: string } {
  const content = `
    <p class="email-greeting">Hi ${data.tenantName},</p>
    <p>Your rent payment is due.</p>
    
    <div class="email-section">
      <h3>Payment Details</h3>
      <p><strong>Property:</strong> ${data.propertyAddress}</p>
      <p><strong>Amount Due:</strong> $${data.amount.toLocaleString()}</p>
      <p><strong>Due Date:</strong> ${data.dueDate}</p>
    </div>
    
    ${pmEmailButton('Pay Now', data.paymentUrl)}
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Rent Due: $${data.amount.toLocaleString()} - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Rent Payment Due',
      preheader: `Your rent of $${data.amount.toLocaleString()} is due ${data.dueDate}`,
    }),
  }
}

// Landlord: Disbursement sent
export function pmDisbursementEmail(data: {
  landlordName: string
  propertyAddress: string
  grossRent: number
  managementFee: number
  netAmount: number
  periodMonth: number
  periodYear: number
}): { subject: string; html: string } {
  const monthName = new Date(data.periodYear, data.periodMonth - 1).toLocaleString('default', {
    month: 'long',
  })

  const content = `
    <p class="email-greeting">Hi ${data.landlordName},</p>
    <p>Your rent disbursement for ${monthName} ${data.periodYear} has been processed.</p>
    
    <div class="email-section">
      <h3>Disbursement Details</h3>
      <p><strong>Property:</strong> ${data.propertyAddress}</p>
      <p><strong>Gross Rent:</strong> $${data.grossRent.toLocaleString()}</p>
      <p><strong>Management Fee:</strong> -$${data.managementFee.toLocaleString()}</p>
      <hr class="email-divider" style="margin: 10px 0;">
      <p><strong>Net Disbursement:</strong> $${data.netAmount.toLocaleString()}</p>
    </div>
    
    <p>The funds should arrive in your bank account within 2-3 business days.</p>
    
    <div class="email-signature">
      Thank you,<br>
      <strong>CRC Property Management</strong>
    </div>
  `

  return {
    subject: `Disbursement Sent: $${data.netAmount.toLocaleString()} - ${data.propertyAddress}`,
    html: getPMEmailLayout(content, {
      title: 'CRC Property Management',
      subtitle: 'Disbursement Processed',
      preheader: `Your ${monthName} disbursement of $${data.netAmount.toLocaleString()} has been sent`,
    }),
  }
}