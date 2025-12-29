import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListingById } from '@/lib/db/listings'
import { getCoordinationById, updateCoordination } from '@/lib/db/coordination'
import { sendWeeklyReportEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { coordination_id } = await request.json()

    if (!coordination_id) {
      return NextResponse.json(
        { error: 'Coordination ID is required' },
        { status: 400 }
      )
    }

    const coordination = await getCoordinationById(coordination_id)
    if (!coordination) {
      return NextResponse.json(
        { error: 'Coordination not found' },
        { status: 404 }
      )
    }

    const listing = await getListingById(coordination.listing_id)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    // Get agent email for CC
    let agentEmail = ''
    if (coordination.agent_id) {
      const { data: agentData } = await supabase
        .from('users')
        .select('email')
        .eq('id', coordination.agent_id)
        .single()

      if (agentData) {
        agentEmail = agentData.email || ''
      }
    }

    // Get latest unsent report
    let reportFile1Url: string | undefined
    let reportFile2Url: string | undefined

    const { data: latestReport } = await supabase
      .from('coordination_weekly_reports')
      .select('*')
      .eq('coordination_id', coordination_id)
      .eq('email_sent', false)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .single()

    if (latestReport) {
      reportFile1Url = latestReport.report_file_url || undefined
      reportFile2Url = latestReport.report_file_url_2 || undefined
    }

    const dateSentStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    const emailResult = await sendWeeklyReportEmail(
      coordination,
      listing,
      agentEmail,
      dateSentStr,
      reportFile1Url,
      reportFile2Url
    )

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    // Update coordination and mark report as sent
    await updateCoordination(coordination_id, {
      last_email_sent_at: new Date().toISOString(),
      total_emails_sent: (coordination.total_emails_sent || 0) + 1,
    })

    // Mark the report as sent if we used one
    if (latestReport) {
      await supabase
        .from('coordination_weekly_reports')
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_id: emailResult.emailId,
        })
        .eq('id', latestReport.id)
    }

    // Log email to history
    await supabase
      .from('coordination_email_history')
      .insert({
        coordination_id,
        email_type: 'weekly_report',
        recipient_email: coordination.seller_email,
        recipient_name: coordination.seller_name,
        subject: `Collective Realty Co. - Weekly Report - ${listing.property_address} | ${dateSentStr}`,
        resend_email_id: emailResult.emailId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
        weekly_report_id: latestReport?.id || null,
      })

    return NextResponse.json({
      success: true,
      message: 'Weekly report email sent successfully',
      emailId: emailResult.emailId,
    })
  } catch (error: any) {
    console.error('Error sending weekly report email:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send weekly report email' },
      { status: 500 }
    )
  }
}

