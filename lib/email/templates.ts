import { ListingCoordination, Listing } from '@/types/listing-coordination'
import { getMagicLinkUrl } from '@/lib/magic-links'
import { getEmailLayout, emailSection, emailButton, emailSignature } from './layout'

export function getWelcomeEmailHtml(
  coordination: ListingCoordination,
  listing: Listing,
  agentName: string,
  agentEmail: string,
  agentPhone: string,
  scheduledTime?: Date | string | null
): string {
  const magicLink = getMagicLinkUrl(coordination.seller_magic_link!)

  let scheduleText = 'every Monday at 6:00 PM'
  if (scheduledTime) {
    const scheduleDate = typeof scheduledTime === 'string' ? new Date(scheduledTime) : scheduledTime
    if (!isNaN(scheduleDate.getTime())) {
      const dayOfWeek = scheduleDate.toLocaleDateString('en-US', { weekday: 'long' })
      const time = scheduleDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      scheduleText = `every ${dayOfWeek} at ${time}`
    }
  }

  const content = `
    <p class="email-greeting">Hi ${coordination.seller_name},</p>
    
    <p>Welcome to Collective Realty Co.'s Weekly Listing Coordination service for your property at <strong>${listing.property_address}</strong>!</p>
    
    <p>We're excited to keep you informed every step of the way as we market your home.</p>
    
    ${emailSection(
      'What to Expect',
      `
      <ul>
        <li>Weekly email updates ${scheduleText}</li>
        <li>Showing activity and agent feedback</li>
        <li>MLS property views and engagement</li>
        <li>Your listing featured in our weekly email to 7,000+ buyers and agents</li>
      </ul>
    `
    )}
    
    ${emailSection(
      'Your Listing Dashboard',
      `
      <p>Access your personalized dashboard anytime to view all reports, showing history, and listing details:</p>
      ${emailButton('Access Your Dashboard', magicLink)}
      <p style="font-size: 11px; text-align: center; color: #888;">Bookmark this link for easy access to your reports anytime.</p>
    `
    )}
    
    ${emailSection(
      'Your Team',
      `
      <p><strong>Listing Agent:</strong><br>
      ${agentName}<br>
      ${agentEmail}<br>
      ${agentPhone}</p>
      
      <p style="margin-top: 15px;"><strong>Listing & Transaction Coordinator:</strong><br>
      Leah Parpan<br>
      listingspecialist@collectiverealtyco.com<br>
      (281) 638-9416</p>
    `
    )}
    
    <p>If you have any questions, feel free to reach out to your listing agent or our coordination team.</p>
    
    <p>We look forward to keeping you updated on your listing's progress!</p>
    
    ${emailSignature('Leah Parpan', 'Listing & Transaction Coordinator', 'listingspecialist@collectiverealtyco.com', '(281) 638-9416')}
  `

  return getEmailLayout(content, {
    title: 'Welcome to Weekly Listing Coordination',
    preheader: `Your listing coordination service for ${listing.property_address} is now active.`,
  })
}

export function getWeeklyReportEmailHtml(
  coordination: ListingCoordination,
  listing: Listing,
  dateSent: string,
  reportDownloadUrl1?: string,
  reportDownloadUrl2?: string
): string {
  const magicLink = getMagicLinkUrl(coordination.seller_magic_link!)

  const reportButtons =
    reportDownloadUrl1 || reportDownloadUrl2
      ? emailSection(
          "This Week's Reports",
          `
    <p style="text-align: center;">
      ${reportDownloadUrl1 ? `<a href="${reportDownloadUrl1}" class="email-btn" style="margin: 5px;">Download Showing Report</a>` : ''}
      ${reportDownloadUrl2 ? `<a href="${reportDownloadUrl2}" class="email-btn" style="margin: 5px;">Download Traffic Report</a>` : ''}
    </p>
  `
        )
      : ''

  const content = `
    <p class="email-greeting">Hi ${coordination.seller_name},</p>
    
    <p>Your weekly activity report for <strong>${listing.property_address}</strong> is ready.</p>
    
    ${reportButtons}
    
    ${emailSection(
      'Your Dashboard',
      `
      <p>View all your reports and listing details anytime:</p>
      ${emailButton('Your Listing Dashboard', magicLink)}
      <p style="font-size: 11px; text-align: center; color: #888;">This link remains active as long as your listing coordination service is active.</p>
    `
    )}
    
    <p>If you have any questions about this week's activity or your listing, please don't hesitate to reach out to your listing agent.</p>
    
    ${emailSignature('Leah Parpan', 'Listing & Transaction Coordinator', 'listingspecialist@collectiverealtyco.com', '(281) 638-9416')}
  `

  return getEmailLayout(content, {
    title: 'Weekly Listing Report',
    subtitle: `${listing.property_address} | ${dateSent}`,
    preheader: `Weekly report for ${listing.property_address} - ${dateSent}`,
  })
}