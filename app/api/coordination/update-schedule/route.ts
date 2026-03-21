import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateCoordination } from '@/lib/db/coordination'
import { getAllActiveCoordinations } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'
import { sendWeeklyReportEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { coordinationId, scheduleDate, scheduleTime, applyToAll } = body

    if (!scheduleDate || !scheduleTime) {
      return NextResponse.json({ error: 'Schedule date and time are required' }, { status: 400 })
    }

    // Combine date and time into a single datetime
    const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`)

    if (isNaN(scheduledDateTime.getTime())) {
      return NextResponse.json({ error: 'Invalid date or time format' }, { status: 400 })
    }

    if (applyToAll) {
      // Update all active coordinations
      const coordinations = await getAllActiveCoordinations()
      let updated = 0
      let scheduled = 0

      for (const coordination of coordinations) {
        try {
          // Update coordination schedule
          await updateCoordination(coordination.id, {
            next_email_scheduled_for: scheduledDateTime.toISOString(),
          })
          updated++

          // Find unsent weekly reports and schedule them
          const { data: unsentReports } = await supabase
            .from('coordination_weekly_reports')
            .select('*')
            .eq('coordination_id', coordination.id)
            .eq('email_sent', false)
            .is('email_id', null)
            .order('week_start_date', { ascending: false })
            .limit(1)

          // Schedule weekly reports if available
          if (unsentReports && unsentReports.length > 0) {
            const listing = await getListingById(coordination.listing_id)
            if (listing) {
              const { data: agentData } = await supabase
                .from('users')
                .select('email')
                .eq('id', coordination.agent_id)
                .single()

              if (agentData) {
                const dateSentStr = scheduledDateTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })

                const latestReport = unsentReports[0]
                const emailResult = await sendWeeklyReportEmail(
                  coordination,
                  listing,
                  agentData.email,
                  dateSentStr,
                  latestReport.report_file_url || undefined,
                  latestReport.report_file_url_2 || undefined,
                  scheduledDateTime
                )

                if (emailResult.success && emailResult.emailId) {
                  await supabase
                    .from('coordination_weekly_reports')
                    .update({
                      email_id: emailResult.emailId,
                      email_scheduled_for: scheduledDateTime.toISOString(),
                    })
                    .eq('id', latestReport.id)

                  scheduled++
                }
              }
            }
          }
        } catch (error: any) {
          console.error(`Error updating coordination ${coordination.id}:`, error)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Updated schedule for ${updated} coordinations. Scheduled ${scheduled} emails.`,
        updated,
        scheduled,
      })
    } else {
      // Update single coordination
      if (!coordinationId) {
        return NextResponse.json(
          { error: 'Coordination ID is required when not applying to all' },
          { status: 400 }
        )
      }

      await updateCoordination(coordinationId, {
        next_email_scheduled_for: scheduledDateTime.toISOString(),
      })

      // Get coordination data with transaction
      const { data: coordinationData } = await supabase
        .from('listing_coordination')
        .select('*, transactions(*)')
        .eq('id', coordinationId)
        .single()

      let scheduled = 0

      if (coordinationData) {
        const listing = coordinationData.transactions as any
        const { data: agentData } = await supabase
          .from('users')
          .select(
            'preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone'
          )
          .eq('id', coordinationData.agent_id)
          .single()

        if (agentData && listing) {
          // Schedule unsent weekly reports
          const { data: unsentReports } = await supabase
            .from('coordination_weekly_reports')
            .select('*')
            .eq('coordination_id', coordinationId)
            .eq('email_sent', false)
            .is('email_id', null)
            .order('week_start_date', { ascending: false })
            .limit(1)

          if (unsentReports && unsentReports.length > 0) {
            const dateSentStr = scheduledDateTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })

            const latestReport = unsentReports[0]
            const emailResult = await sendWeeklyReportEmail(
              coordinationData as any,
              listing,
              agentData.email,
              dateSentStr,
              latestReport.report_file_url || undefined,
              latestReport.report_file_url_2 || undefined,
              scheduledDateTime
            )

            if (emailResult.success && emailResult.emailId) {
              await supabase
                .from('coordination_weekly_reports')
                .update({
                  email_id: emailResult.emailId,
                  email_scheduled_for: scheduledDateTime.toISOString(),
                })
                .eq('id', latestReport.id)

              scheduled++
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Schedule updated. ${scheduled} email(s) scheduled.`,
        scheduled,
      })
    }
  } catch (error: any) {
    console.error('Error updating schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update schedule' },
      { status: 500 }
    )
  }
}
