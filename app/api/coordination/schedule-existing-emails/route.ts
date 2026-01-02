import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllActiveCoordinations } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'
import { sendWeeklyReportEmail } from '@/lib/email/send'

/**
 * Schedule emails for existing weekly reports that haven't been sent yet
 * This endpoint can be called to schedule emails for reports uploaded before
 * the Resend scheduling feature was implemented
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Get all active coordinations
    const coordinations = await getAllActiveCoordinations()
    
    const results = {
      total: 0,
      scheduled: 0,
      failed: 0,
      errors: [] as string[],
    }
    
    // Calculate next Monday at 6pm
    const now = new Date()
    const dayOfWeek = now.getDay()
    let daysUntilMonday = (8 - dayOfWeek) % 7
    
    if (daysUntilMonday === 0) {
      // It's Monday - check if it's before 6pm
      const currentHour = now.getHours()
      if (currentHour < 18) {
        // Before 6pm today, schedule for today at 6pm
        daysUntilMonday = 0
      } else {
        // After 6pm, schedule for next Monday
        daysUntilMonday = 7
      }
    }
    
    const nextMonday = new Date(now)
    nextMonday.setDate(now.getDate() + daysUntilMonday)
    nextMonday.setHours(18, 0, 0, 0) // 6:00 PM
    
    const dateSentStr = nextMonday.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
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
        
        // Find unsent weekly reports for this coordination
        const { data: unsentReports, error: reportsError } = await supabase
          .from('coordination_weekly_reports')
          .select('*')
          .eq('coordination_id', coordination.id)
          .eq('email_sent', false)
          .is('email_id', null)
          .order('week_start_date', { ascending: false })
        
        if (reportsError) {
          results.errors.push(`Error fetching reports for coordination ${coordination.id}: ${reportsError.message}`)
          results.failed++
          continue
        }
        
        if (!unsentReports || unsentReports.length === 0) {
          continue // No unsent reports for this coordination
        }
        
        results.total += unsentReports.length
        
        // Schedule email for the most recent unsent report
        const latestReport = unsentReports[0]
        
        const emailResult = await sendWeeklyReportEmail(
          coordination,
          listing,
          agentData.email,
          dateSentStr,
          latestReport.report_file_url || undefined,
          latestReport.report_file_url_2 || undefined,
          nextMonday
        )
        
        if (emailResult.success && emailResult.emailId) {
          // Update the report with the scheduled email ID
          await supabase
            .from('coordination_weekly_reports')
            .update({
              email_id: emailResult.emailId,
              email_scheduled_for: nextMonday.toISOString(),
            })
            .eq('id', latestReport.id)
          
          results.scheduled++
        } else {
          results.errors.push(`Failed to schedule email for ${listing.property_address}: ${emailResult.error}`)
          results.failed++
        }
        
      } catch (error: any) {
        results.errors.push(`Error processing coordination ${coordination.id}: ${error.message}`)
        results.failed++
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Scheduled ${results.scheduled} emails for existing reports`,
      results,
    })
    
  } catch (error: any) {
    console.error('Error scheduling existing emails:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to schedule existing emails' },
      { status: 500 }
    )
  }
}

