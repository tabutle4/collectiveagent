import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archiveListingFolder } from '@/lib/microsoft-graph'
import { getCoordinationById } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { coordinationId, userId } = body

    if (!coordinationId || !userId) {
      return NextResponse.json(
        { error: 'Coordination ID and User ID are required' },
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

    // Get coordination and listing before deletion to archive the OneDrive folder
    const coordination = await getCoordinationById(coordinationId)
    if (coordination) {
      try {
        const listing = await getListingById(coordination.listing_id)
        if (listing) {
          // Archive the OneDrive folder before deleting the coordination
          await archiveListingFolder(listing.property_address, listing.id, listing.transaction_type || 'sale')
        }
      } catch (error) {
        console.error('Error archiving OneDrive folder:', error)
        // Continue with deletion even if archiving fails
      }
    }

    // Delete related email history first (cascade)
    await supabase
      .from('coordination_email_history')
      .delete()
      .eq('coordination_id', coordinationId)

    // Delete related weekly reports (cascade)
    await supabase
      .from('coordination_weekly_reports')
      .delete()
      .eq('coordination_id', coordinationId)

    // Delete the coordination
    const { error: deleteError } = await supabase
      .from('listing_coordination')
      .delete()
      .eq('id', coordinationId)

    if (deleteError) {
      console.error('Error deleting coordination:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete coordination' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Coordination and OneDrive folder archived successfully'
    })

  } catch (error: any) {
    console.error('Error in delete coordination API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete coordination' },
      { status: 500 }
    )
  }
}

