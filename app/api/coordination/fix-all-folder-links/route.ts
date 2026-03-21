import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { regenerateFolderSharingLink } from '@/lib/microsoft-graph'
import { getAllActiveCoordinations } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    // Check role (simple string, not array)
    if (userError || userData?.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    // Get all active coordinations
    const coordinations = await getAllActiveCoordinations()
    let fixed = 0
    let errors = 0
    const errorDetails: string[] = []

    for (const coordination of coordinations) {
      try {
        const listing = await getListingById(coordination.listing_id)
        if (!listing) {
          errors++
          errorDetails.push(`Coordination ${coordination.id}: Listing not found`)
          continue
        }

        // Regenerate the folder link (will find the correct folder format - prefers folders with Sale/Lease)
        const newSharingUrl = await regenerateFolderSharingLink(
          listing.property_address,
          listing.id,
          listing.transaction_type || 'sale'
        )

        // Update the coordination with the new link
        await supabase
          .from('listing_coordination')
          .update({ onedrive_folder_url: newSharingUrl })
          .eq('id', coordination.id)

        fixed++
      } catch (error: any) {
        errors++
        errorDetails.push(`Coordination ${coordination.id}: ${error.message}`)
        console.error(`Error fixing folder link for coordination ${coordination.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} folder links. ${errors} errors.`,
      fixed,
      errors,
      errorDetails: errors > 0 ? errorDetails : undefined,
    })
  } catch (error: any) {
    console.error('Error fixing folder links:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fix folder links' },
      { status: 500 }
    )
  }
}
