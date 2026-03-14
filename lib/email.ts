import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing env.RESEND_API_KEY')
}

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * FROM Email Addresses - Different addresses for different purposes
 * All use the verified domain: coachingbrokeragetools.com
 * 
 * - onboarding: New agent welcome emails
 * - support: Password resets, help emails
 * - notifications: Admin notifications, system alerts
 * - office: Official communications from office
 * - admin: Admin-specific emails
 * 
 * To add new addresses, just add them here. No need to verify each one individually
 * in Resend - as long as the domain is verified, any address works.
 */
const FROM_EMAILS = {
  onboarding: 'Collective Realty Co. <onboarding@coachingbrokeragetools.com>',
  support: 'Collective Support <support@coachingbrokeragetools.com>',
  notifications: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
  office: 'Collective Realty Co. <office@coachingbrokeragetools.com>',
  admin: 'Collective Admin <admin@coachingbrokeragetools.com>',
}

const ADMIN_EMAIL = 'office@collectiverealtyco.com'

export async function sendProspectWelcomeEmail(prospect: {
  preferred_first_name: string
  email: string
}) {
  const html = getLuxuryEmailTemplate({
    greeting: `Hi ${prospect.preferred_first_name},`,
    content: `
      <p class="intro-text">Thank you for submitting your information. We're excited to learn more about you and your goals in real estate.</p>
      
      <p class="intro-text">At Collective Realty Co., we believe in offering real support, real structure, and real freedom so you can grow your business your way. Linked below, you'll find details about our commission plans and company offerings to help you explore whether we're the right fit for you.</p>
      
      <div class="section-box">
        <h2 class="section-title">Commission Plans & Offerings</h2>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Commission-Plans.aspx" class="btn btn-black">View Plans & Offerings</a>
        </div>
        
        <div class="password-box">
          Password: <span class="password-code">thefirm357</span>
        </div>
      </div>
    `,
    darkSection: `
      <h2 class="dark-section-title">Choose Your Next Step</h2>
      
      <div class="option-box">
        <h3 class="option-title">Ready to Move Forward?</h3>
        <p class="option-description">Submit the Join Our Firm form to request partnership.</p>
        <div style="text-align: center;">
          <a href="https://forms.office.com/Pages/ResponsePage.aspx?id=57xJl6bLKUG8z_SmhG224abx-HwYOq9AjRqZoiPnxy5UMzVUMkQyVjNRQUlQUkZOVllUNkJCM1ZHWS4u" class="btn btn-white">Join Our Firm</a>
        </div>
      </div>
      
      <div class="divider">OR</div>
      
      <div class="option-box">
        <h3 class="option-title">Schedule a Quick Call with Our Broker</h3>
        <p class="option-description">Connect with us to discuss your goals and learn how we can support your success.</p>
        <div style="text-align: center;">
          <a href="https://collectiverealtyco.setmore.com/services/1fe35e59-6d4f-4392-8227-c831b31cefd0" class="btn btn-white">Schedule Call</a>
        </div>
      </div>
    `,
    closing: `
      <div class="signature">
        <p>We're here to help, so feel free to reach out if you have any questions as you review everything.</p>
        <p style="margin-top: 15px;">Looking forward to connecting soon.</p>
      </div>
    `,
  })

  return resend.emails.send({
    from: FROM_EMAILS.onboarding,
    to: prospect.email,
    cc: ADMIN_EMAIL,
    subject: 'Next Steps with Collective Realty Co.',
    html,
  })
}

export async function sendAdminProspectNotification(
  adminEmails: string[],
  prospect: any
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  const html = getLuxuryEmailTemplate({
    greeting: 'New Prospective Agent Submission',
    content: `
      <p class="intro-text">A new prospect has submitted the prospective agent form.</p>
      
      <div class="section-box">
        <h3 style="margin-top: 0; color: #000;">CONTACT INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>Name:</strong> ${prospect.preferred_first_name} ${prospect.preferred_last_name}</p>
        <p style="margin: 8px 0;"><strong>Legal Name:</strong> ${prospect.first_name} ${prospect.last_name}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> ${prospect.email}</p>
        <p style="margin: 8px 0;"><strong>Phone:</strong> ${prospect.phone}</p>
        <p style="margin: 8px 0;"><strong>Location:</strong> ${prospect.location}</p>
        ${prospect.instagram_handle ? `<p style="margin: 8px 0;"><strong>Instagram:</strong> @${prospect.instagram_handle}</p>` : ''}
        
        <h3 style="margin-top: 25px; color: #000;">MLS INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>MLS:</strong> ${prospect.mls_choice}</p>
       <p style="margin: 8px 0;"><strong>Association Status:</strong> ${prospect.association_status_on_join === 'new_agent' ? 'Brand new licensed agent' : 'Previously a member with another brokerage'}</p>
        ${prospect.previous_brokerage ? `<p style="margin: 8px 0;"><strong>Previous Brokerage:</strong> ${prospect.previous_brokerage}</p>` : ''}
        
        <h3 style="margin-top: 25px; color: #000;">EXPECTATIONS</h3>
        <p style="margin: 8px 0;"><strong>What expectations do you have for Collective Realty Co.?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${prospect.expectations}"</p>
        
        <p style="margin: 8px 0;"><strong>Do you want to be held accountable?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${prospect.accountability}"</p>
        
        <p style="margin: 8px 0;"><strong>How do you plan to produce business leads?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${prospect.lead_generation}"</p>
        
        <p style="margin: 8px 0;"><strong>Is there anything you would like to add?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${prospect.additional_info}"</p>
        
        <h3 style="margin-top: 25px; color: #000;">REFERRAL & TEAM INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>How did you hear about us?</strong> ${prospect.how_heard}${prospect.how_heard_other ? ` - ${prospect.how_heard_other}` : ''}</p>
        ${prospect.referred_by_agent ? `<p style="margin: 8px 0;"><strong>Referring Agent:</strong> ${prospect.referred_by_agent}</p>` : '<p style="margin: 8px 0;"><strong>Referring Agent:</strong> N/A</p>'}
        ${prospect.joining_team ? `<p style="margin: 8px 0;"><strong>Joining Team:</strong> ${prospect.joining_team}</p>` : '<p style="margin: 8px 0;"><strong>Joining Team:</strong> N/A</p>'}
        
        <p style="margin: 25px 0 0 0; color: #666; font-size: 14px;"><strong>Submitted:</strong> ${new Date(prospect.created_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${appUrl}/admin/prospects/${prospect.id}" class="btn btn-black">View in Dashboard</a>
      </div>
    `,
    closing: `
      <p style="text-align: center; color: #666; font-size: 14px; font-style: italic;">Collective Realty Co. Admin Notification</p>
    `,
  })

  const allRecipients = [ADMIN_EMAIL, ...adminEmails]

  return resend.emails.send({
    from: FROM_EMAILS.notifications,
    to: allRecipients,
    subject: `New Prospective Agent: ${prospect.preferred_first_name} ${prospect.preferred_last_name}`,
    html,
  })
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`
  
  const html = getLuxuryEmailTemplate({
    greeting: `Hi ${userName},`,
    content: `
      <p class="intro-text">We received a request to reset your password for your Collective Realty Co. admin account.</p>
      
      <div class="section-box">
        <h2 class="section-title">Reset Your Password</h2>
        
        <p style="text-align: center; margin: 20px 0; color: #666;">Click the button below to create a new password. This link will expire in 1 hour.</p>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetUrl}" class="btn btn-black">Reset Password</a>
        </div>
        
        <p style="text-align: center; margin: 20px 0; color: #999; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    closing: `
      <p style="text-align: center; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="text-align: center; color: #999; font-size: 13px; word-break: break-all;">${resetUrl}</p>
    `,
  })

  return resend.emails.send({
    from: FROM_EMAILS.support,
    to: email,
    cc: ADMIN_EMAIL,
    subject: 'Reset Your Password - Collective Realty Co.',
    html,
  })
}

function getLuxuryEmailTemplate({
  greeting,
  content,
  darkSection,
  closing,
}: {
  greeting: string
  content: string
  darkSection?: string
  closing: string
}) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>Collective Realty Co.</title>
    <style>
        :root {
            color-scheme: light only;
            supported-color-schemes: light only;
        }
        
        body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
            font-family: 'Trebuchet MS', Arial, sans-serif !important;
        }
        
        [data-ogsc] body {
            background-color: #ffffff !important;
        }
        
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #ffffff !important;
            }
            .email-container {
                background-color: #ffffff !important;
            }
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .header {
            background: #ffffff !important;
            padding: 50px 40px;
            text-align: center;
            margin: 0;
        }
        
        .header-title {
            margin: 0;
            font-size: 18px;
            color: #000000 !important;
            font-weight: normal;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        
        .header-subtitle {
            margin: 8px 0 0 0;
            font-size: 14px;
            color: #000000 !important;
            font-weight: normal;
            letter-spacing: 2px;
        }
        
        .header-divider {
            width: 60px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #000000, transparent) !important;
            margin: 20px auto 0 auto;
        }
        
        .content {
            padding: 40px;
            background-color: #ffffff !important;
        }
        
        .greeting {
            font-size: 16px;
            color: #000000 !important;
            margin-bottom: 20px;
            font-weight: 600;
        }
        
        .intro-text {
            margin: 0 0 16px 0;
            font-size: 16px;
            line-height: 1.6;
            color: #333333 !important;
        }
        
        .section-box {
            background-color: #f8f8f8 !important;
            padding: 35px;
            margin: 30px 0;
            border-left: 3px solid #000000;
        }
        
        .section-title {
            font-size: 20px;
            color: #000000 !important;
            font-weight: 300;
            margin: 0 0 20px 0;
            text-align: center;
            letter-spacing: 1px;
        }
        
        .password-box {
            text-align: center;
            margin-top: 20px;
            font-size: 13px;
            color: #666 !important;
        }
        
        .password-code {
            font-family: 'Courier New', monospace;
            background-color: #ffffff !important;
            padding: 8px 16px;
            border: 1px solid #999999;
            letter-spacing: 1px;
            display: inline-block;
            margin-top: 8px;
            color: #000000 !important;
        }
        
        .dark-section {
            background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%) !important;
            padding: 40px;
            margin: 30px 0;
        }
        
        .dark-section-title {
            margin: 0 0 30px 0;
            font-size: 24px;
            color: #ffffff !important;
            font-weight: 300;
            text-align: center;
            letter-spacing: 2px;
        }
        
        .option-box {
            background-color: #2d2d2d !important;
            padding: 30px;
            margin-bottom: 20px;
            border-left: 3px solid #ffffff;
        }
        
        .option-box:last-child {
            margin-bottom: 0;
        }
        
        .option-title {
            font-size: 18px;
            color: #ffffff !important;
            font-weight: 400;
            margin: 0 0 12px 0;
            text-align: center;
        }
        
        .option-description {
            font-size: 14px;
            color: #aaaaaa !important;
            line-height: 1.6;
            margin: 0 0 20px 0;
            text-align: center;
        }
        
        .divider {
            text-align: center;
            margin: 25px 0;
            font-size: 14px;
            color: #999999 !important;
            letter-spacing: 2px;
        }
        
        .btn {
            display: inline-block;
            padding: 14px 32px;
            text-decoration: none;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
            border-radius: 2px;
            transition: all 0.3s ease;
        }
        
        .btn-white {
            background-color: #ffffff !important;
            color: #000000 !important;
            border: 2px solid #ffffff;
        }
        
        .btn-black {
            background-color: #000000 !important;
            color: #ffffff !important;
            border: 2px solid #000000;
        }
        
        .signature {
            margin-top: 30px;
            color: #333 !important;
            text-align: center;
        }
        
        .signature p {
            margin: 0 0 10px 0;
            font-size: 15px;
            line-height: 1.6;
            color: #333333 !important;
        }
        
        .footer {
            background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%) !important;
            padding: 30px;
            text-align: center;
        }
        
        .footer p {
            margin: 0;
            font-size: 13px;
            color: #aaaaaa !important;
            font-style: italic;
            letter-spacing: 1px;
        }
        
        @media (max-width: 640px) {
            .content,
            .dark-section {
                padding: 30px 25px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1 class="header-title">Collective Realty Co.</h1>
            <p class="header-subtitle">The Coaching Brokerage</p>
            <div class="header-divider"></div>
        </div>
        
        <div class="content">
            <p class="greeting">${greeting}</p>
            ${content}
        </div>
        
        ${darkSection ? `<div class="dark-section">${darkSection}</div>` : ''}
        
        <div class="content">
            ${closing}
        </div>
        
        <div class="footer">
            <p>Welcome to Collective Realty Co. - Where Excellence Meets Opportunity</p>
        </div>
    </div>
</body>
</html>
  `
}

export async function sendContactEmail({
  message,
  subject,
  userName,
  userEmail,
}: {
  message: string
  subject?: string
  userName: string
  userEmail: string
}) {
  const html = getLuxuryEmailTemplate({
    greeting: `Hello ${userName.split(' ')[0]},`,
    content: `
      <p style="margin-bottom: 20px;">Thank you for contacting the office. We will respond within 24 business hours.</p>
      
      <p style="margin-bottom: 25px;">For urgent matters, please call or text the office at <strong style="color: #C9A961;">281-638-9407</strong>.</p>
      
      <div class="section-box">
        <h3 style="margin-top: 0; color: #000;">YOUR MESSAGE</h3>
        ${subject ? `<p style="margin-bottom: 10px; font-weight: bold; color: #333;">Subject: ${subject}</p>` : ""}
        <div style="background: #f8f8f8; padding: 15px; border-left: 3px solid #C9A961; margin-top: 10px;">
          <p style="margin: 0; color: #333; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `,
    closing: `
      <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
        This message was sent from the Collective Agent admin portal.
      </p>
    `,
  })

  // Send to user (main recipient), CC office
  await resend.emails.send({
    from: FROM_EMAILS.support,
    to: userEmail,
    cc: 'office@collectiverealtyco.com',
    subject: subject ? `Support Request: ${subject}` : `Support Request Received`,
    html,
  })
}

export async function sendFormSubmissionNotification({
  formName,
  formType,
  submissionData,
  responseId,
  notificationEmail,
}: {
  formName: string
  formType: string
  submissionData: Record<string, any>
  responseId?: string
  notificationEmail: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const submissionDate = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
  
  // Format field labels and values
  const formatFieldLabel = (key: string): string => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  
  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return 'N/A'
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }
  
  // Build form fields HTML
  const fieldsHtml = Object.entries(submissionData)
    .filter(([key]) => !['id', 'created_at', 'updated_at', 'formType', 'form_type', 'listing_id', 'user_id', 'agent_id'].includes(key))
    .map(([key, value]) => {
      const label = formatFieldLabel(key)
      const formattedValue = formatFieldValue(value)
      return `
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e0e0e0;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #000; font-size: 14px;">${label}</p>
          <p style="margin: 0; color: #666; font-size: 14px; white-space: pre-wrap;">${formattedValue}</p>
        </div>
      `
    })
    .join('')
  
  const viewResponseLink = responseId 
    ? `${appUrl}/admin/form-responses?tab=${formType === 'pre-listing' ? 'pre-listing' : formType === 'just-listed' ? 'just-listed' : 'prospects'}`
    : null
  
  const html = getLuxuryEmailTemplate({
    greeting: 'New Form Submission',
    content: `
      <p class="intro-text">A new submission has been received for <strong>${formName}</strong>.</p>
      
      <div class="section-box">
        <h3 style="margin-top: 0; color: #000; margin-bottom: 20px;">SUBMISSION DETAILS</h3>
        <p style="margin: 8px 0; color: #666;"><strong>Form:</strong> ${formName}</p>
        <p style="margin: 8px 0; color: #666;"><strong>Submitted:</strong> ${submissionDate}</p>
        
        <h3 style="margin-top: 25px; color: #000; margin-bottom: 20px;">FORM DATA</h3>
        ${fieldsHtml}
      </div>
      
      ${viewResponseLink ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewResponseLink}" class="btn btn-black">View Response in Dashboard</a>
        </div>
      ` : ''}
    `,
    closing: `
      <p style="text-align: center; color: #666; font-size: 14px; font-style: italic;">Collective Realty Co. Form Notification</p>
    `,
  })

  return resend.emails.send({
    from: FROM_EMAILS.notifications,
    to: notificationEmail,
    subject: `New ${formName} Submission`,
    html,
  })
}
