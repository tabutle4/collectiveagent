import { NextRequest, NextResponse } from 'next/server'
import { updateListing } from '@/lib/db/listings'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { listing_id, updates } = body
    
    if (!listing_id || !updates) {
      return NextResponse.json(
        { error: 'Listing ID and updates are required' },
        { status: 400 }
      )
    }
    
    // If agent_name is being updated, try to find the agent and update agent_id
    if (updates.agent_name) {
      const agentNameParts = updates.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()
        
        // Try preferred name first (case-insensitive, any status, must have agent role)
        const { data: agentsByPreferred, error: preferredError } = await supabase
          .from('users')
          .select('id, preferred_first_name, preferred_last_name, roles')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .or('roles.cs.{agent},roles.cs.{Agent}')
          .limit(1)
        
        if (!preferredError && agentsByPreferred && agentsByPreferred.length > 0) {
          updates.agent_id = agentsByPreferred[0].id
        } else {
          // Try legal name (case-insensitive, any status, must have agent role)
          const { data: agentsByLegal, error: legalError } = await supabase
            .from('users')
            .select('id, first_name, last_name, roles')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .or('roles.cs.{agent},roles.cs.{Agent}')
            .limit(1)
          
          if (!legalError && agentsByLegal && agentsByLegal.length > 0) {
            updates.agent_id = agentsByLegal[0].id
          }
        }
      }
    }
    
    // Check if listing exists first
    const { data: existingListing, error: checkError } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listing_id)
      .single()
    
    if (checkError || !existingListing) {
      console.error('Listing not found:', checkError)
      return NextResponse.json(
        { error: `Listing not found: ${checkError?.message || 'Listing does not exist'}` },
        { status: 404 }
      )
    }
    
    const success = await updateListing(listing_id, updates)
    
    if (!success) {
      // Try to get the actual error from Supabase by attempting a test update
      const testUpdate: any = {}
      // Try updating with just one field to see which column fails
      if (updates.mls_type !== undefined) {
        testUpdate.mls_type = updates.mls_type
      } else if (updates.co_listing_agent !== undefined) {
        testUpdate.co_listing_agent = updates.co_listing_agent
      } else if (updates.is_broker_listing !== undefined) {
        testUpdate.is_broker_listing = updates.is_broker_listing
      }
      
      if (Object.keys(testUpdate).length > 0) {
        const { error: testError } = await supabase
          .from('listings')
          .update(testUpdate)
          .eq('id', listing_id)
        
        if (testError) {
          const errorMsg = testError.message || 'Unknown error'
          const missingColumn = errorMsg.match(/column "([^"]+)"/)?.[1]
          
          if (missingColumn) {
            return NextResponse.json(
              { 
                error: `Database column "${missingColumn}" is missing. Please run the migration at /admin/migrations to add missing columns.`,
                missingColumn,
                migrationUrl: '/admin/migrations'
              },
              { status: 500 }
            )
          }
        }
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to update listing. One or more database columns may be missing. Please check /admin/migrations for required migrations.',
          migrationUrl: '/admin/migrations'
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Listing updated successfully'
    })
    
  } catch (error: any) {
    console.error('Error updating listing:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update listing' },
      { status: 500 }
    )
  }
}

