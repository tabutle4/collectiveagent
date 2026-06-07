import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { getWelcomeEmailHtml, getWeeklyReportEmailHtml } from './templates'
import { ListingCoordination, Listing } from '@/types/listing-coordination'

const FROM_UPN = 'transactions@collectiverealtyco.com'
const REPLY_TO = 'tcandcompliance@collectiverealtyco.com'
const BCC_EMAIL = 'tcandcompliance@collectiverealtyco.com'

export async function sendWelcomeEmail(
  coordination: ListingCoordination,
  listing: Listing,
  agent: {
    name: string
    email: string
    phone: string
  }
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    const scheduledTime = coordination.next_email_scheduled_for || null

    const html = getWelcomeEmailHtml(
      coordination,
      listing,
      agent.name,
      agent.email,
      agent.phone,
      scheduledTime
    )

    await sendMailAs({
      fromUpn: FROM_UPN,
      to: coordination.seller_email,
      cc: agent.email,
      bcc: BCC_EMAIL,
      replyTo: REPLY_TO,
      subject: `Collective Realty Co. - Welcome to Weekly Listing Coordination - ${listing.property_address}`,
      html,
    })

    // Graph does not return a message ID. Return a sentinel so callers that gate
    // on emailId truthiness (e.g. send-all-weekly-reports) still mark the report sent.
    return { success: true, emailId: `graph-${Date.now()}` }
  } catch (error: any) {
    console.error('Error sending welcome email:', error)
    return { success: false, error: error.userMessage || error.message }
  }
}

export async function sendWeeklyReportEmail(
  coordination: ListingCoordination,
  listing: Listing,
  agentEmail: string,
  dateSent: string,
  reportDownloadUrl1?: string,
  reportDownloadUrl2?: string,
  scheduleFor?: Date
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    // Graph does not support scheduled sends. Log a warning if scheduleFor was passed.
    // The email is sent immediately. The caller (send-all-weekly-reports) still stamps
    // email_scheduled_for in the DB for display purposes, which is fine.
    if (scheduleFor) {
      console.warn('sendWeeklyReportEmail: scheduleFor is not supported via Microsoft Graph. Email sent immediately.')
    }

    const html = getWeeklyReportEmailHtml(
      coordination,
      listing,
      dateSent,
      reportDownloadUrl1,
      reportDownloadUrl2
    )

    await sendMailAs({
      fromUpn: FROM_UPN,
      to: coordination.seller_email,
      cc: agentEmail,
      bcc: BCC_EMAIL,
      replyTo: REPLY_TO,
      subject: `Collective Realty Co. - Weekly Report - ${listing.property_address} | ${dateSent}`,
      html,
    })

    // Graph does not return a message ID. Return a sentinel so callers that gate
    // on emailId truthiness still mark the report sent.
    return { success: true, emailId: `graph-${Date.now()}` }
  } catch (error: any) {
    console.error('Error sending weekly report email:', error)
    return { success: false, error: error.userMessage || error.message }
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  cc,
  bcc,
  from,
  replyTo,
}: {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  bcc?: string | string[]
  from?: string
  replyTo?: string
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    // from is ignored - all sends go via Graph using FROM_UPN.
    // Callers that previously passed a custom from address route through
    // transactions@ via Graph. Reply-to still honours the caller's preference.
    await sendMailAs({
      fromUpn: FROM_UPN,
      to,
      cc,
      bcc,
      replyTo: replyTo || REPLY_TO,
      subject,
      html,
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error sending email:', error)
    return { success: false, error: error.userMessage || error.message }
  }
}
