import { NextRequest, NextResponse } from 'next/server'
import { getAllActiveCoordinations, updateCoordination } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'
import { getLatestListingReport } from '@/lib/microsoft-graph'
import { sendWeeklyReportEmail } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  let cronExecutionId: string | undefined
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    const supabase = createClient()

    // Auto-send disabled - use manual send button in listing coordination instead
    // To re-enable, remove the return line below
    return NextResponse.json({ success: true, results: { total: 0, sent: 0, failed: 0, errors: [], message: 'Auto-send disabled' } })
    
    const coordinations = await getAllActiveCoordinations()
    
    const results = {
      total: coordinations.length,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    }
    
    const now = new Date()
    const dateSentStr = now.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    })
    
    // Log cron execution start
    cronExecutionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
    try {
      await supabase
        .from('cron_execution_logs')
        .insert({
          id: cronExecutionId,
          cron_name: 'send-weekly-reports',
          started_at: now.toISOString(),
          status: 'running',
          total_items: coordinations.length,
        })
    } catch (err) {
      console.error('Error logging cron start:', err)
    }
    
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
        
        let reportFile1Url: string | undefined
        let reportFile2Url: string | undefined
        let latestReport: any = null
        
        try {
          const { data: reportData } = await supabase
            .from('coordination_weekly_reports')
            .select('*')
            .eq('coordination_id', coordination.id)
            .eq('email_sent', false)
            .order('week_start_date', { ascending: false })
            .limit(1)
            .single()
          
          if (reportData) {
            latestReport = reportData
            reportFile1Url = latestReport.report_file_url || undefined
            reportFile2Url = latestReport.report_file_url_2 || undefined
          }
        } catch (error) {
          console.error(`Error getting report for ${listing?.property_address}:`, error)
        }
        
        const emailResult = await sendWeeklyReportEmail(
          coordination,
          listing!,
          agentData!.email,
          dateSentStr,
          reportFile1Url,
          reportFile2Url
        )
        
        if (emailResult.success) {
          await updateCoordination(coordination.id, {
            last_email_sent_at: new Date().toISOString(),
            total_emails_sent: (coordination as any).total_emails_sent + 1,
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
              coordination_id: coordination.id,
              email_type: 'weekly_report',
              recipient_email: (coordination as any).seller_email,
              recipient_name: (coordination as any).seller_name,
              subject: `Collective Realty Co. - Weekly Report - ${listing!.property_address} | ${dateSentStr}`,
              resend_email_id: emailResult.emailId || null,
              status: 'sent',
              sent_at: new Date().toISOString(),
              weekly_report_id: latestReport?.id || null,
            })
          
          results.sent++
        } else {
          // Log failed email
          await supabase
            .from('coordination_email_history')
            .insert({
              coordination_id: coordination.id,
              email_type: 'weekly_report',
              recipient_email: (coordination as any).seller_email,
              recipient_name: (coordination as any).seller_name,
              subject: `Collective Realty Co. - Weekly Report - ${listing!.property_address} | ${dateSentStr}`,
              status: 'failed',
              error_message: emailResult.error || 'Unknown error',
              sent_at: new Date().toISOString(),
            })

          results.errors.push(`Failed to send email for ${listing!.property_address}: ${emailResult.error}`)
          results.failed++
        }
        
      } catch (error: any) {
        results.errors.push(`Error processing coordination ${coordination.id}: ${error.message}`)
        results.failed++
      }
    }
    
    // Log cron execution completion
    if (cronExecutionId) {
      try {
        await supabase
          .from('cron_execution_logs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            success_count: results.sent,
            failure_count: results.failed,
            error_details: results.errors.length > 0 ? JSON.stringify(results.errors) : null,
          })
          .eq('id', cronExecutionId)
      } catch (err) {
        console.error('Error logging cron completion:', err)
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
    })
    
  } catch (error: any) {
    console.error('Error in weekly reports cron:', error)
    
    // Log cron execution failure
    if (cronExecutionId) {
      try {
        const supabase = createClient()
        await supabase
          .from('cron_execution_logs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: error.message || 'Unknown error',
          })
          .eq('id', cronExecutionId)
      } catch (err) {
        console.error('Error logging cron failure:', err)
      }
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to send weekly reports' },
      { status: 500 }
    )
  }
}