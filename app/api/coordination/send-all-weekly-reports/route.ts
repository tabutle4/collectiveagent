import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllActiveCoordinations } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'
import { sendWeeklyReportEmail } from '@/lib/email/send'
import { updateCoordination } from '@/lib/db/coordination'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { sendNow } = body // true = send now, false = schedule for next Monday

    const coordinations = await getAllActiveCoordinations()

    const results = {
      total: 0,
      sent: 0,
      scheduled: 0,
      failed: 0,
      errors: [] as string[],
    }

    const now = new Date()
    let scheduleDate: Date | undefined

    if (!sendNow) {
      // Calculate next Monday at 6pm
      const dayOfWeek = now.getDay()
      let daysUntilMonday = (8 - dayOfWeek) % 7

      if (daysUntilMonday === 0) {
        const currentHour = now.getHours()
        if (currentHour < 18) {
          daysUntilMonday = 0
        } else {
          daysUntilMonday = 7
        }
      }

      scheduleDate = new Date(now)
      scheduleDate.setDate(now.getDate() + daysUntilMonday)
      scheduleDate.setHours(18, 0, 0, 0)
    }

    const dateSentStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    for (const coordination of coordinations) {
      try {
        const listing = await getListingById(coordination.listing_id)
        if (!listing) {
          results.errors.push(`Listing not found for coordination ${coordination.id}`)
          results.failed++
          continue
        }

        const { data: agentData } = await supabase
          .from('users')
          .select('email')
          .eq('id', coordination.agent_id)
          .single()

        if (!agentData) {
          results.errors.push(`Agent not found for coordination ${coordination.id}`)
          results.failed++
          continue
        }

        // Find unsent weekly reports
        const { data: unsentReports, error: reportsError } = await supabase
          .from('coordination_weekly_reports')
          .select('*')
          .eq('coordination_id', coordination.id)
          .eq('email_sent', false)
          .is('email_id', null)
          .order('week_start_date', { ascending: false })
          .limit(1)

        if (reportsError || !unsentReports || unsentReports.length === 0) {
          continue // No unsent reports
        }

        results.total++
        const latestReport = unsentReports[0]

        const emailResult = await sendWeeklyReportEmail(
          coordination,
          listing,
          agentData.email,
          dateSentStr,
          latestReport.report_file_url || undefined,
          latestReport.report_file_url_2 || undefined,
          scheduleDate
        )

        if (emailResult.success && emailResult.emailId) {
          await supabase
            .from('coordination_weekly_reports')
            .update({
              email_id: emailResult.emailId,
              email_sent: sendNow ? true : false,
              email_sent_at: sendNow ? now.toISOString() : null,
              email_scheduled_for: scheduleDate ? scheduleDate.toISOString() : null,
            })
            .eq('id', latestReport.id)

          if (sendNow) {
            await updateCoordination(coordination.id, {
              last_email_sent_at: now.toISOString(),
              total_emails_sent: coordination.total_emails_sent + 1,
            })

            // Log email to history
            await supabase.from('coordination_email_history').insert({
              coordination_id: coordination.id,
              email_type: 'weekly_report',
              recipient_email: coordination.seller_email,
              recipient_name: coordination.seller_name,
              subject: `Collective Realty Co. - Weekly Report - ${listing.property_address} | ${dateSentStr}`,
              resend_email_id: emailResult.emailId,
              status: 'sent',
              sent_at: now.toISOString(),
              weekly_report_id: latestReport.id,
            })

            results.sent++
          } else {
            results.scheduled++
          }
        } else {
          results.errors.push(
            `Failed to ${sendNow ? 'send' : 'schedule'} email for ${listing.property_address}: ${emailResult.error}`
          )
          results.failed++
        }
      } catch (error: any) {
        results.errors.push(`Error processing coordination ${coordination.id}: ${error.message}`)
        results.failed++
      }
    }

    return NextResponse.json({
      success: true,
      message: sendNow
        ? `Sent ${results.sent} emails. ${results.failed} failed.`
        : `Scheduled ${results.scheduled} emails for next Monday. ${results.failed} failed.`,
      results,
    })
  } catch (error: any) {
    console.error('Error sending/scheduling weekly reports:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send/schedule weekly reports' },
      { status: 500 }
    )
  }
}
