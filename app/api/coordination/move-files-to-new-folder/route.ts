import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { graphClient } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'
import { getCoordinationById, updateCoordination } from '@/lib/db/coordination'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { listingId, userId } = body

    if (!listingId || !userId) {
      return NextResponse.json(
        { error: 'Listing ID and User ID are required' },
        { status: 400 }
      )
    }

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single()

    // Check role (simple string, not array)
    if (userError || userData?.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Get listing
    const listing = await getListingById(listingId)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const sanitizedAddress = listing.property_address.replace(/[/\\?%*:|"<>]/g, '-')
    const transactionLabel = (listing.transaction_type || 'sale') === 'lease' ? 'Lease' : 'Sale'
    
    // Old folder path (without Sale/Lease)
    const oldFolderPath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
    // New folder path (with Sale/Lease)
    const newFolderPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`

    // Check if old folder exists
    let oldFolderExists = false
    try {
      await graphClient.getFolder(oldFolderPath)
      oldFolderExists = true
    } catch (error: any) {
      if (error.statusCode !== 404 && error.code !== 'itemNotFound') {
        throw error
      }
    }

    if (!oldFolderExists) {
      return NextResponse.json({
        success: true,
        message: 'Old folder does not exist - nothing to move',
        filesMoved: 0,
      })
    }

    // Ensure new folder exists
    try {
      await graphClient.getFolder(newFolderPath)
    } catch (error: any) {
      if (error.statusCode === 404 || error.code === 'itemNotFound') {
        // Create new folder if it doesn't exist
        await graphClient.createFolder(newFolderPath)
      } else {
        throw error
      }
    }

    // List files in old folder
    const files = await graphClient.listFiles(oldFolderPath)
    
    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Old folder is empty - nothing to move',
        filesMoved: 0,
      })
    }

    // Move each file to new folder
    let filesMoved = 0
    let errors: string[] = []

    for (const file of files) {
      try {
        const sourceFilePath = `${oldFolderPath}/${file.name}`
        await graphClient.moveFile(sourceFilePath, newFolderPath)
        filesMoved++
      } catch (error: any) {
        const errorMsg = `Failed to move ${file.name}: ${error.message || 'Unknown error'}`
        errors.push(errorMsg)
        console.error(errorMsg, error)
      }
    }

    // If all files moved successfully, update the coordination folder link
    if (filesMoved > 0 && errors.length === 0) {
      const coordination = await getCoordinationById(listingId)
      if (coordination) {
        // Regenerate sharing link for new folder
        const newSharingUrl = await graphClient.createSharingLink(newFolderPath, 'view')
        
        await updateCoordination(coordination.id, {
          onedrive_folder_url: newSharingUrl,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Moved ${filesMoved} file(s) from old folder to new folder`,
      filesMoved,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error: any) {
    console.error('Error moving files:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to move files' },
      { status: 500 }
    )
  }
}

