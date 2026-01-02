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
    // Use the coordination's scheduled time for the welcome email text
    const scheduledTime = coordination.next_email_scheduled_for || null
    
    const html = getWelcomeEmailHtml(
      coordination,
      listing,
      agent.name,
      agent.email,
      agent.phone,
      scheduledTime
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

/**
 * Calculate the next Monday at 6:00 PM
 */
function getNextMonday6PM(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days until next Monday
  let daysUntilMonday = (8 - dayOfWeek) % 7
  if (daysUntilMonday === 0) {
    // If it's Monday, check if it's before 6pm
    const currentHour = now.getHours()
    if (currentHour < 18) {
      // Before 6pm today, schedule for today
      daysUntilMonday = 0
    } else {
      // After 6pm, schedule for next Monday
      daysUntilMonday = 7
    }
  }
  
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + daysUntilMonday)
  nextMonday.setHours(18, 0, 0, 0) // 6:00 PM
  
  return nextMonday
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
    const html = getWeeklyReportEmailHtml(
      coordination,
      listing,
      dateSent,
      reportDownloadUrl1,
      reportDownloadUrl2
    )
    
    const emailOptions: any = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: coordination.seller_email,
      cc: [agentEmail],
      bcc: [BCC_EMAIL],
      replyTo: REPLY_TO,
      subject: `Collective Realty Co. - Weekly Report - ${listing.property_address} | ${dateSent}`,
      html,
    }
    
    // If scheduleFor is provided, schedule the email
    if (scheduleFor) {
      emailOptions.schedule = scheduleFor.toISOString()
    }
    
    const { data, error } = await resend.emails.send(emailOptions)
    
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

