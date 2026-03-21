import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadWeeklyReports } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'
import { getAllActiveCoordinations } from '@/lib/db/coordination'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Get user_id from form data and verify admin role
    const formData = await request.formData()

    const coordination_id = formData.get('coordination_id') as string
    const listing_id = formData.get('listing_id') as string
    const user_id = formData.get('user_id') as string

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user_id)
      .single()

    // Check role (simple string, not array)
    if (userData?.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const report_date = formData.get('report_date') as string

    if (!report_date) {
      return NextResponse.json({ error: 'Report date is required' }, { status: 400 })
    }

    // Use the report_date as both week_start_date and week_end_date (simple upload date)
    const week_start_date = report_date
    const week_end_date = report_date

    const listing = await getListingById(listing_id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const file1 = formData.get('report_file_1') as File
    const file2 = formData.get('report_file_2') as File | null

    if (!file1) {
      return NextResponse.json({ error: 'Showing report file is required' }, { status: 400 })
    }

    // Traffic report is only required for HAR listings
    if (listing.mls_type !== 'NTREIS' && !file2) {
      return NextResponse.json(
        { error: 'Traffic report file is required for HAR listings' },
        { status: 400 }
      )
    }
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const file1Buffer = Buffer.from(await file1.arrayBuffer())

    let uploadResult
    try {
      // For NTREIS, only upload file1 (showing report)
      const file2Buffer = file2 ? Buffer.from(await file2.arrayBuffer()) : Buffer.alloc(0)
      const file2Name = file2 ? file2.name : ''

      uploadResult = await uploadWeeklyReports(
        listing.property_address,
        listing_id,
        week_start_date,
        week_end_date,
        file1Buffer,
        file1.name,
        file2Buffer,
        file2Name,
        listing.transaction_type || 'sale',
        listing.mls_type || 'HAR'
      )
    } catch (uploadError: any) {
      console.error('Error uploading reports to OneDrive:', uploadError)
      return NextResponse.json(
        {
          error: `Failed to upload reports to OneDrive: ${uploadError.message || 'Unknown error'}`,
        },
        { status: 500 }
      )
    }

    const { data: report, error: reportError } = await supabase
      .from('coordination_weekly_reports')
      .insert({
        coordination_id,
        week_start_date,
        week_end_date,
        report_file_url: uploadResult.file1DownloadUrl,
        report_file_name: file1.name,
        report_file_url_2: uploadResult.file2DownloadUrl || null,
        report_file_name_2: file2?.name || null,
        showings_count: null,
        mls_views: null,
        feedback: null,
        email_sent: false,
      })
      .select()
      .single()

    if (reportError) {
      console.error('Error creating report record:', reportError)
      return NextResponse.json({ error: 'Failed to save report record' }, { status: 500 })
    }

    // Do not automatically send or schedule emails on upload
    // Emails must be sent manually via the admin buttons

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (error: any) {
    console.error('Error uploading reports:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload reports' },
      { status: 500 }
    )
  }
}
