import { getEmailLayout } from './layout'

// Single source of truth for the shared Canva Pro credential email.
// Used by the send-canva-access cron (per-agent, 24h after first login) and by
// the settings route (broadcast to agents when the password changes).
export function buildCanvaAccessEmail(opts: {
  greetingName?: string | null
  canvaUser: string
  canvaPassword: string
  canvaUrl: string
  isUpdate?: boolean
}): { subject: string; html: string } {
  const { greetingName, canvaUser, canvaPassword, canvaUrl, isUpdate } = opts
  const hi = greetingName ? `Hi ${greetingName},` : 'Hi team,'
  const lead = isUpdate
    ? 'The shared Canva Pro login has been updated. Here is the current login information.'
    : 'As part of your setup, you have access to our shared Canva Pro account for creating flyers, social posts, and marketing materials. Your login information is below.'
  const subject = isUpdate ? 'Updated Shared Canva Pro Login' : 'Your Shared Canva Pro Access'
  const html = getEmailLayout(
    `<p>${hi}</p>
     <p>${lead}</p>
     <p style="margin: 16px 0; padding: 16px; background-color: #F9F9F9; border-radius: 6px;">
       <strong>User:</strong> ${canvaUser}<br>
       <strong>Password:</strong> ${canvaPassword}
     </p>
     <p style="text-align: center; margin: 24px 0;">
       <a href="${canvaUrl}" style="display: inline-block; padding: 12px 28px; background-color: #C5A278; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">Open Shared Canva Account</a>
     </p>
     <p style="font-size: 13px; color: #888888;">This account is shared by the whole team, so please review the <a href="${canvaUrl}" style="color: #C5A278;">usage policy</a> and follow it for effective and fair use. Please do not change the password or account settings.</p>`,
    {
      title: isUpdate ? 'Updated Canva Pro Login' : 'Shared Canva Pro Access',
      preheader: 'Your shared Canva Pro login for creating marketing materials.',
    }
  )
  return { subject, html }
}
