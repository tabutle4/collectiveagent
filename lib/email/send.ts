import { Resend } from 'resend'
import { getWelcomeEmailHtml, getWeeklyReportEmailHtml } from './templates'
import { ListingCoordination, Listing } from '@/types/listing-coordination'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'transactions@coachingbrokeragetools.com'
const FROM_NAME = 'Leah Parpan - Listing & Transaction Coordinator'
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
    const html = getWelcomeEmailHtml(
      coordination,
      listing,
      agent.name,
      agent.email,
      agent.phone
    )
    
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: coordination.seller_email,
      cc: [agent.email],
      bcc: [BCC_EMAIL],
      replyTo: REPLY_TO,
      subject: `Collective Realty Co. - Welcome to Weekly Listing Coordination - ${listing.property_address}`,
      html,
    })
    
    if (error) {
      console.error('Error sending welcome email:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, emailId: data?.id }
  } catch (error: any) {
    console.error('Error sending welcome email:', error)
    return { success: false, error: error.message }
  }
}

export async function sendWeeklyReportEmail(
  coordination: ListingCoordination,
  listing: Listing,
  agentEmail: string,
  dateSent: string,
  reportDownloadUrl1?: string,
  reportDownloadUrl2?: string
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    const html = getWeeklyReportEmailHtml(
      coordination,
      listing,
      dateSent,
      reportDownloadUrl1,
      reportDownloadUrl2
    )
    
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: coordination.seller_email,
      cc: [agentEmail],
      bcc: [BCC_EMAIL],
      replyTo: REPLY_TO,
      subject: `Collective Realty Co. - Weekly Report - ${listing.property_address} | ${dateSent}`,
      html,
    })
    
    if (error) {
      console.error('Error sending weekly report email:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, emailId: data?.id }
  } catch (error: any) {
    console.error('Error sending weekly report email:', error)
    return { success: false, error: error.message }
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  cc,
}: {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      replyTo: REPLY_TO,
      subject,
      html,
    })
    
    if (error) {
      console.error('Error sending email:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, emailId: data?.id }
  } catch (error: any) {
    console.error('Error sending email:', error)
    return { success: false, error: error.message }
  }
}

