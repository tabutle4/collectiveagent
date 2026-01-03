import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { graphClient } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { reportId, userId } = body

    if (!reportId || !userId) {
      return NextResponse.json(
        { error: 'Report ID and User ID are required' },
        { status: 400 }
      )
    }

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single()

    // Check for 'Admin' (capital A) to match database schema
    if (userError || !userData?.roles?.includes('Admin')) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // First, get the report to find the file names
    const { data: report, error: reportFetchError } = await supabase
      .from('coordination_weekly_reports')
      .select('*')
      .eq('id', reportId)
      .single()

    if (reportFetchError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Get the coordination to find the listing
    const { data: coordination, error: coordError } = await supabase
      .from('listing_coordination')
      .select('listing_id')
      .eq('id', report.coordination_id)
      .single()

    if (coordError || !coordination) {
      return NextResponse.json(
        { error: 'Coordination not found for this report' },
        { status: 404 }
      )
    }

    // Get the listing to get the property address
    const listing = await getListingById(coordination.listing_id)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found for this report' },
        { status: 404 }
      )
    }

    // Delete files from OneDrive if they exist
    const sanitizedAddress = listing.property_address.replace(/[/\\?%*:|"<>]/g, '-')
    // Include listing ID to match the folder path used during creation
    const folderPath = `Listing Reports/Active/${sanitizedAddress}-${listing.id}`

    try {
      // Delete file 1 if it exists
      // The file name stored in DB is the original name, but in OneDrive it has the date prefix
      // We need to construct the full filename as it was uploaded
      if (report.report_file_name) {
        // Extract the date from week_start_date to match the upload filename format
        const dateLabel = report.week_start_date ? new Date(report.week_start_date).toISOString().split('T')[0].replace(/[/\\?%*:|"<>]/g, '-') : ''
        // The uploaded filename format is: Showing_Report_${dateLabel}_${originalFileName}
        // Check if the filename already has the prefix, if not, add it
        const file1Name = report.report_file_name.startsWith('Showing_Report_') 
          ? report.report_file_name 
          : `Showing_Report_${dateLabel}_${report.report_file_name}`
        const file1Path = `${folderPath}/${file1Name}`
        await graphClient.deleteFile(file1Path)
      }

      // Delete file 2 if it exists
      if (report.report_file_name_2) {
        const dateLabel = report.week_start_date ? new Date(report.week_start_date).toISOString().split('T')[0].replace(/[/\\?%*:|"<>]/g, '-') : ''
        const file2Name = report.report_file_name_2.startsWith('Traffic_Report_') 
          ? report.report_file_name_2 
          : `Traffic_Report_${dateLabel}_${report.report_file_name_2}`
        const file2Path = `${folderPath}/${file2Name}`
        await graphClient.deleteFile(file2Path)
      }
    } catch (onedriveError: any) {
      // Log OneDrive deletion errors but don't fail the request
      // The file might already be deleted or not exist
      console.error('Error deleting files from OneDrive (continuing with database deletion):', onedriveError)
    }

    // Delete the weekly report from database
    const { error: deleteError } = await supabase
      .from('coordination_weekly_reports')
      .delete()
      .eq('id', reportId)

    if (deleteError) {
      console.error('Error deleting weekly report:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete weekly report' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Weekly report and files deleted successfully'
    })

  } catch (error: any) {
    console.error('Error in delete weekly report API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete weekly report' },
      { status: 500 }
    )
  }
}

