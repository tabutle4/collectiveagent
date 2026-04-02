import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing env.RESEND_API_KEY')
}

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAILS = {
  onboarding: 'Collective Realty Co. <onboarding@coachingbrokeragetools.com>',
  support: 'Collective Support <support@coachingbrokeragetools.com>',
  notifications: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
  office: 'Collective Realty Co. <office@coachingbrokeragetools.com>',
  admin: 'Collective Admin <admin@coachingbrokeragetools.com>',
}

const ADMIN_EMAIL = 'office@collectiverealtyco.com'

// ─── LUXURY TEMPLATE (prospect-facing and onboarding emails) ──────────────────

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
        :root { color-scheme: light only; supported-color-schemes: light only; }
        body { margin: 0 !important; padding: 0 !important; background-color: #ffffff !important; font-family: 'Trebuchet MS', Arial, sans-serif !important; }
        [data-ogsc] body { background-color: #ffffff !important; }
        @media (prefers-color-scheme: dark) { body { background-color: #ffffff !important; } .email-container { background-color: #ffffff !important; } }
        .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .header { background: #ffffff !important; padding: 50px 40px; text-align: center; margin: 0; }
        .header-title { margin: 0; font-size: 18px; color: #000000 !important; font-weight: normal; letter-spacing: 4px; text-transform: uppercase; }
        .header-subtitle { margin: 8px 0 0 0; font-size: 14px; color: #000000 !important; font-weight: normal; letter-spacing: 2px; }
        .header-divider { width: 60px; height: 2px; background: linear-gradient(90deg, transparent, #000000, transparent) !important; margin: 20px auto 0 auto; }
        .content { padding: 40px; background-color: #ffffff !important; }
        .greeting { font-size: 16px; color: #000000 !important; margin-bottom: 20px; font-weight: 600; }
        .intro-text { margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333 !important; }
        .section-box { background-color: #f8f8f8 !important; padding: 35px; margin: 30px 0; border-left: 3px solid #000000; }
        .section-title { font-size: 20px; color: #000000 !important; font-weight: 300; margin: 0 0 20px 0; text-align: center; letter-spacing: 1px; }
        .password-box { text-align: center; margin-top: 20px; font-size: 13px; color: #666 !important; }
        .password-code { font-family: 'Courier New', monospace; background-color: #ffffff !important; padding: 8px 16px; border: 1px solid #999999; letter-spacing: 1px; display: inline-block; margin-top: 8px; color: #000000 !important; }
        .dark-section { background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%) !important; padding: 40px; margin: 30px 0; }
        .dark-section-title { margin: 0 0 30px 0; font-size: 24px; color: #ffffff !important; font-weight: 300; text-align: center; letter-spacing: 2px; }
        .option-box { background-color: #2d2d2d !important; padding: 30px; margin-bottom: 20px; border-left: 3px solid #ffffff; }
        .option-box:last-child { margin-bottom: 0; }
        .option-title { font-size: 18px; color: #ffffff !important; font-weight: 400; margin: 0 0 12px 0; text-align: center; }
        .option-description { font-size: 14px; color: #aaaaaa !important; line-height: 1.6; margin: 0 0 20px 0; text-align: center; }
        .divider { text-align: center; margin: 25px 0; font-size: 14px; color: #999999 !important; letter-spacing: 2px; }
        .btn { display: inline-block; padding: 14px 32px; text-decoration: none; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px; }
        .btn-white { background-color: #ffffff !important; color: #000000 !important; border: 2px solid #ffffff; }
        .btn-black { background-color: #000000 !important; color: #ffffff !important; border: 2px solid #000000; }
        .signature { margin-top: 30px; color: #333 !important; text-align: center; }
        .signature p { margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #333333 !important; }
        .footer { background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%) !important; padding: 30px; text-align: center; }
        .footer p { margin: 0; font-size: 13px; color: #aaaaaa !important; font-style: italic; letter-spacing: 1px; }
        @media (max-width: 640px) { .content, .dark-section { padding: 30px 25px; } }
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
        <div class="content">${closing}</div>
        <div class="footer"><p>Welcome to Collective Realty Co. - Where Excellence Meets Opportunity</p></div>
    </div>
</body>
</html>
  `
}

// ─── PROSPECT WELCOME (luxury) ────────────────────────────────────────────────

export async function sendProspectWelcomeEmail(prospect: {
  preferred_first_name: string
  email: string
  join_link: string
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
        <div class="password-box">Password: <span class="password-code">thefirm357</span></div>
      </div>
      <div class="section-box">
        <h2 class="section-title">Weekly Coaching & Training</h2>
        <p style="text-align: center; color: #666; font-size: 15px; margin: 0 0 20px 0;">At Collective Realty Co., you'll have access to weekly coaching sessions, market updates, and hands-on support to help you close more deals and grow your business.</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://collectiverealtyco.setmore.com/services/1fe35e59-6d4f-4392-8227-c831b31cefd0" class="btn btn-black">View Coaching Calendar</a>
        </div>
      </div>
    `,
    darkSection: `
      <h2 class="dark-section-title">Choose Your Next Step</h2>
      <div class="option-box">
        <h3 class="option-title">Ready to Move Forward?</h3>
        <p class="option-description">Your personalized onboarding link is ready. Click below to complete your join steps, your information is pre-filled, so it only takes a few minutes.</p>
        <div style="text-align: center;"><a href="${prospect.join_link}" class="btn btn-white">Start Your Onboarding</a></div>
      </div>
      <div class="divider">OR</div>
      <div class="option-box">
        <h3 class="option-title">Schedule a Quick Call with Our Broker</h3>
        <p class="option-description">Connect with us to discuss your goals and learn how we can support your success.</p>
        <p style="text-align: center; color: #aaaaaa; font-size: 14px; margin: 0 0 15px 0;">Courtney Okanlomo<br>courtneyo@collectiverealtyco.com<br>(281) 989-8604</p>
        <div style="text-align: center;"><a href="https://collectiverealtyco.setmore.com/services/1fe35e59-6d4f-4392-8227-c831b31cefd0" class="btn btn-white">Schedule Call</a></div>
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
    subject: 'Thank You for Your Interest in Joining Collective Realty Co., The Coaching Brokerage',
    html,
  })
}

// ─── PASSWORD RESET (getEmailLayout) ─────────────────────────────────────────

export async function sendPasswordResetEmail(email: string, resetToken: string, userName: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`

  const html = getEmailLayout(
    `<p style="margin: 0 0 16px; font-size: 15px; color: #1a1a1a;">Hi ${userName},</p>
     <p style="margin: 0 0 16px; font-size: 14px; color: #555555; line-height: 1.6;">We received a request to reset your password for your Collective Realty Co. agent portal account.</p>
     <p style="margin: 0 0 16px; font-size: 14px; color: #555555; line-height: 1.6;">Click the button below to create a new password. This link will expire in 1 hour.</p>
     <p style="text-align: center; margin: 24px 0;">
       <a href="${resetUrl}" style="display: inline-block; padding: 12px 28px; background-color: #C5A278; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">Reset Password</a>
     </p>
     <p style="font-size: 13px; color: #888888; margin: 0 0 8px;">If you didn't request this, you can safely ignore this email.</p>
     <p style="font-size: 13px; color: #888888; margin: 0;">If the button doesn't work, copy and paste this link into your browser: <span style="word-break: break-all;">${resetUrl}</span></p>`,
    { title: 'Reset Your Password', preheader: 'Reset your Collective Realty Co. password' }
  )

  return resend.emails.send({
    from: FROM_EMAILS.support,
    to: email,
    cc: ADMIN_EMAIL,
    subject: 'Reset Your Password - Collective Realty Co.',
    html,
  })
}

// ─── CONTACT FORM CONFIRMATION (getEmailLayout) ───────────────────────────────

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
  const firstName = userName.split(' ')[0]

  const html = getEmailLayout(
    `<p style="margin: 0 0 16px; font-size: 15px; color: #1a1a1a;">Hello ${firstName},</p>
     <p style="margin: 0 0 16px; font-size: 14px; color: #555555; line-height: 1.6;">Thank you for contacting the office. We will respond within 24 business hours.</p>
     <p style="margin: 0 0 20px; font-size: 14px; color: #555555; line-height: 1.6;">For urgent matters, please call or text the office at <strong style="color: #1a1a1a;">281-638-9407</strong>.</p>
     <div style="background-color: #f9f9f9; padding: 20px 24px; border-left: 3px solid #C5A278; margin: 0 0 16px;">
       <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #C5A278; text-transform: uppercase; letter-spacing: 0.05em;">Your Message</p>
       ${subject ? `<p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1a1a1a;">Subject: ${subject}</p>` : ''}
       <p style="margin: 0; font-size: 14px; color: #555555; white-space: pre-wrap; line-height: 1.6;">${message}</p>
     </div>
     <p style="font-size: 13px; color: #888888; margin: 0;">This message was sent from the Collective Agent portal.</p>`,
    {
      title: 'Message Received',
      subtitle: subject || undefined,
      preheader: 'We received your message and will respond within 24 business hours.',
    }
  )

  await resend.emails.send({
    from: FROM_EMAILS.support,
    to: userEmail,
    cc: 'office@collectiverealtyco.com',
    subject: subject ? `Support Request: ${subject}` : `Support Request Received`,
    html,
  })
}

// ─── FORM SUBMISSION NOTIFICATION (getEmailLayout) ────────────────────────────

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

  const formatFieldLabel = (key: string): string =>
    key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return 'N/A'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  }

  const fieldsHtml = Object.entries(submissionData)
    .filter(([key]) => !['id', 'created_at', 'updated_at', 'formType', 'form_type', 'listing_id', 'user_id', 'agent_id'].includes(key))
    .map(([key, value]) => `
      <div style="margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #e5e5e5;">
        <p style="margin: 0 0 3px; font-weight: 600; color: #1a1a1a; font-size: 13px;">${formatFieldLabel(key)}</p>
        <p style="margin: 0; color: #555555; font-size: 13px; white-space: pre-wrap;">${formatFieldValue(value)}</p>
      </div>`)
    .join('')

  const viewResponseLink = responseId
    ? `${appUrl}/admin/form-responses?tab=${formType === 'pre-listing' ? 'pre-listing' : formType === 'just-listed' ? 'just-listed' : 'prospects'}`
    : null

  const html = getEmailLayout(
    `<p style="margin: 0 0 16px; font-size: 14px; color: #555555;">A new submission has been received for <strong style="color: #1a1a1a;">${formName}</strong>.</p>
     <div style="background-color: #f9f9f9; padding: 16px 20px; margin: 0 0 20px; border-left: 3px solid #C5A278;">
       <p style="margin: 0 0 6px; font-size: 13px; color: #555555;"><strong style="color: #1a1a1a;">Form:</strong> ${formName}</p>
       <p style="margin: 0; font-size: 13px; color: #555555;"><strong style="color: #1a1a1a;">Submitted:</strong> ${submissionDate}</p>
     </div>
     ${fieldsHtml}
     ${viewResponseLink ? `<p style="text-align: center; margin: 24px 0 0;"><a href="${viewResponseLink}" style="display: inline-block; padding: 12px 28px; background-color: #C5A278; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">View Response in Dashboard</a></p>` : ''}`,
    { title: `New ${formName} Submission`, preheader: `New submission received for ${formName}` }
  )

  return resend.emails.send({
    from: FROM_EMAILS.notifications,
    to: notificationEmail,
    subject: `New ${formName} Submission`,
    html,
  })
}

// ─── ONBOARDING NEXT STEPS (luxury, triggered at step 2) ─────────────────────

export async function sendOnboardingNextStepsEmail(prospect: {
  preferred_first_name: string
  first_name: string
  email: string
  campaign_token: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
  const onboardingUrl = `${appUrl}/onboard/${prospect.campaign_token}`
  const firstName = prospect.preferred_first_name || prospect.first_name

  const html = getLuxuryEmailTemplate({
    greeting: `Hello ${firstName},`,
    content: `
      <p class="intro-text">Thank you for submitting your information. We are excited that you decided to join the firm! Please complete the following steps as quickly as possible to have your license sponsored and gain access to all systems and resources.</p>
      <div class="section-box">
        <h2 class="section-title">Step 1 - Your Info</h2>
        <p style="text-align:center;color:#888;font-size:14px;margin:0;">Completed. Your information has been saved.</p>
      </div>
      <div class="section-box">
        <h2 class="section-title">Step 2 - Payment</h2>
        <p style="color:#333;font-size:14px;margin:0 0 8px;"><strong>1. Pay Your Onboarding and Prorated Monthly Fee</strong></p>
        <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">Complete your onboarding fee to unlock your agreements and TREC sponsorship. You will be prompted to pay directly in your onboarding portal.</p>
      </div>
      <div class="section-box">
        <h2 class="section-title">Steps 3 and 4 - Agreements</h2>
        <p style="color:#333;font-size:14px;margin:0 0 6px;"><strong>1. Sign Your Independent Contractor Agreement</strong></p>
        <p style="color:#555;font-size:14px;margin:0 0 16px;line-height:1.6;">Review and sign your ICA in the onboarding portal. This unlocks the next step.</p>
        <p style="color:#333;font-size:14px;margin:0 0 6px;"><strong>2. Sign Your Commission Plan Agreement</strong></p>
        <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">Review and sign the agreement for the commission plan you selected.</p>
      </div>
      <div class="section-box">
        <h2 class="section-title">Step 5 - Policy Manual</h2>
        <p style="color:#333;font-size:14px;margin:0 0 6px;"><strong>1. Review and Acknowledge the Policy Manual</strong></p>
        <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">Read through the brokerage policy manual and confirm your acknowledgment to continue.</p>
      </div>
      <div class="section-box">
        <h2 class="section-title">Step 6 - W-9</h2>
        <p style="color:#333;font-size:14px;margin:0 0 6px;"><strong>1. Complete Your W-9</strong></p>
        <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">You will receive a separate email from Track1099 with a secure link to complete your W-9 electronically. Please complete it promptly for tax reporting purposes.</p>
      </div>
      <div class="section-box">
        <h2 class="section-title">Step 7 - TREC Sponsorship</h2>
        <p style="color:#333;font-size:14px;margin:0 0 6px;"><strong>1. Accept Your TREC Invitation</strong></p>
        <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">Once your documents are complete, we will submit your TREC sponsorship request. You will receive an invitation email from TREC. Please accept it promptly.</p>
      </div>
    `,
    darkSection: `
      <h2 class="dark-section-title">Continue Your Onboarding</h2>
      <div class="option-box">
        <h3 class="option-title">Your Onboarding Portal</h3>
        <p class="option-description">Your personalized link is below. Your information is pre-filled, so pick up right where you left off.</p>
        <div style="text-align: center;"><a href="${onboardingUrl}" class="btn btn-white">Continue Onboarding</a></div>
      </div>
      <div class="option-box">
        <h3 class="option-title">Need Help or Support?</h3>
        <p class="option-description">The office is here to assist you.</p>
        <div style="text-align: center; display: flex; gap: 12px; justify-content: center;">
          <a href="mailto:office@collectiverealtyco.com" class="btn btn-white">Email Office</a>
          <a href="tel:2816389407" class="btn btn-white">Call Office</a>
        </div>
      </div>
    `,
    closing: `<p style="text-align: center; color: #666;">Welcome to the Collective, Where Excellence Meets Opportunity</p>`,
  })

  return resend.emails.send({
    from: FROM_EMAILS.onboarding,
    to: prospect.email,
    cc: ADMIN_EMAIL,
    subject: 'Next Steps: Your License Sponsorship with Collective Realty Co.',
    html,
  })
}

// ─── COURTNEY FOLLOW-UP (luxury, 3 days after prospect form) ─────────────────

const STEP_LABELS: Record<number, string> = {
  1: 'Your Info',
  2: 'Payment',
  3: 'Independent Contractor Agreement',
  4: 'Commission Plan Agreement',
  5: 'Policy Manual',
  6: 'W-9',
  7: 'TREC Sponsorship',
}

export async function sendCourtneyFollowUpEmail(prospect: {
  preferred_first_name: string
  first_name: string
  email: string
  campaign_token: string
  current_step: number | null
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
  const onboardingUrl = `${appUrl}/onboard/${prospect.campaign_token}`
  const firstName = prospect.preferred_first_name || prospect.first_name

  const stepLabel = prospect.current_step && prospect.current_step > 1
    ? STEP_LABELS[prospect.current_step] || `Step ${prospect.current_step}`
    : null

  const stepNotice = stepLabel
    ? `<div style="background:#f0f0f0;border:1px solid #ddd;padding:12px 16px;font-size:14px;color:#555;margin:16px 0;line-height:1.5;">
        You are currently on <strong>Step ${prospect.current_step}: ${stepLabel}</strong> of your onboarding. Pick up right where you left off using the link below.
      </div>`
    : ''

  const html = getLuxuryEmailTemplate({
    greeting: `Hi ${firstName}!`,
    content: `
      <p class="intro-text">Thank you again for your interest in embarking upon something special!</p>
      <p class="intro-text">I just wanted to take a moment to highlight your first 90 day experience with Collective Realty Co.</p>
      <p class="intro-text">At CRC, the first 90 days are intentionally structured around one thing: getting you into or scaling your production quickly and consistently. We don't take a "train with no execution" approach, we provide a clear roadmap that focuses on lead generation, client conversion, and amplifying a real pipeline from day one.</p>
      <p class="intro-text">You can expect a mix of hands-on training, live implementation, and accountability. That includes weekly strategy sessions, guided outreach, and support through your first transactions with the brokerage so that you're not figuring things out alone. This applies to both seasoned and new agents, as we have found that the strategies of CRC are unique to our brand and leadership.</p>
      <p class="intro-text">What also makes our model different is that we don't just give information, we focus heavily on execution. Agents who follow the process typically see early traction and increase because they're plugged into proven systems, not guessing at what to do next.</p>
      ${stepNotice}
      <p class="intro-text">Again, if you have any questions, please let me know. Talk soon!</p>
      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #eee;font-size:14px;color:#333;line-height:1.7;">
        <p style="margin:0 0 4px;font-weight:700;font-size:14px;color:#000;letter-spacing:0.05em;">COURTNEY OKANLOMO</p>
        <p style="margin:0;font-size:13px;color:#555;">Broker | Owner | Coach | Mentor<br>Collective Realty Co.</p>
        <p style="margin:10px 0 0;font-size:12px;color:#555;">
          (M) (281) 989-8604 &nbsp;|&nbsp; (O) (281) 638-9407 &nbsp;|&nbsp; (F) (281) 516-5806<br>
          courtneyo@collectiverealtyco.com<br>
          13201 Northwest Fwy Ste 450, Houston TX 77040<br>
          2300 Valley View Ln Ste 518, Irving TX 75062<br>
          <a href="http://courtneyokanlomo.com" style="color:#C5A278;text-decoration:none;">courtneyokanlomo.com</a>
        </p>
      </div>
    `,
    darkSection: `
      <h2 class="dark-section-title">Continue Your Onboarding</h2>
      <div class="option-box">
        <h3 class="option-title">Your Onboarding Portal</h3>
        <p class="option-description">Your personalized link is ready. Pick up right where you left off.</p>
        <div style="text-align: center;"><a href="${onboardingUrl}" class="btn btn-white">Continue Onboarding</a></div>
      </div>
    `,
    closing: ``,
  })

  return resend.emails.send({
    from: 'Courtney Okanlomo <courtneyo@coachingbrokeragetools.com>',
    replyTo: 'courtneyo@collectiverealtyco.com',
    to: prospect.email,
    subject: 'Courtney O. - Just Wanted You To Know',
    html,
  })
}