import { createClient } from '@/lib/supabase/server'
import { Listing, ListingFormData } from '@/types/listing-coordination'
import { generateFormToken } from '@/lib/magic-links'

export async function createListing(data: ListingFormData, agentId: string | null, skipTokenGeneration: boolean = false): Promise<Listing | null> {
  const supabase = createClient()
  
  // Only generate tokens if this is NOT a token-based submission
  // (Token-based submissions don't need tokens since they already used one)
  let preListingToken = null
  let justListedToken = null
  if (!skipTokenGeneration) {
    preListingToken = !data.mls_link ? await generateFormToken('pre-listing') : null
    justListedToken = data.mls_link ? await generateFormToken('just-listed') : null
  }
  
  // Check if agent is Courtney Okanlomo and mark listing_input_paid as true
  let listingInputPaid = false
  if (agentId) {
    try {
      const { data: agentData } = await supabase
        .from('users')
        .select('preferred_first_name, preferred_last_name, first_name, last_name')
        .eq('id', agentId)
        .single()
      
      if (agentData) {
        const agentName = `${agentData.preferred_first_name || agentData.first_name} ${agentData.preferred_last_name || agentData.last_name}`.toLowerCase()
        listingInputPaid = agentName.includes('courtney okanlomo') || agentName.includes('okanlomo')
      }
    } catch (error) {
      console.error('Error checking agent name for listing:', error)
    }
  }
  
  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      agent_id: agentId || null,
      agent_name: data.agent_name,
      property_address: data.property_address,
      transaction_type: data.transaction_type,
      mls_type: data.mls_type || null,
      client_names: data.client_names,
      client_phone: data.client_phone,
      client_email: data.client_email,
      lead_source: data.lead_source,
      mls_link: data.mls_link || null,
      estimated_launch_date: data.estimated_launch_date || null,
      status: data.mls_link ? 'active' : 'pre-listing',
      pre_listing_form_completed: !data.mls_link,
      just_listed_form_completed: !!data.mls_link,
      dotloop_file_created: data.dotloop_file_created,
      listing_input_requested: data.listing_input_requested,
      listing_input_paid: listingInputPaid,
      photography_requested: data.photography_requested,
      listing_input_fee: 50.00,
      pre_listing_token: preListingToken,
      just_listed_token: justListedToken,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating listing:', error)
    return null
  }
  
  return listing
}

export async function getListingById(id: string): Promise<Listing | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Error fetching listing:', error)
    return null
  }
  
  return data
}

export async function getAgentListings(agentId: string): Promise<Listing[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching agent listings:', error)
    return []
  }
  
  return data || []
}

export async function getAllListings(): Promise<Listing[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching all listings:', error)
    return []
  }
  
  return data || []
}

export async function updateListing(id: string, updates: Partial<Listing>): Promise<boolean> {
  const supabase = createClient()
  
  // Filter out undefined values and only include columns that exist in the database
  // Remove columns that might not exist yet (they'll be added via migration)
  const cleanUpdates: any = {}
  const allowedColumns = [
    'agent_id', 'agent_name', 'property_address', 'transaction_type', 'mls_type',
    'client_names', 'client_phone', 'client_email', 'mls_link',
    'estimated_launch_date', 'actual_launch_date', 'lead_source', 'status',
    'listing_website_url', 'dotloop_file_created', 'photography_requested',
    'listing_input_requested', 'co_listing_agent', 'is_broker_listing'
  ]
  
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof Listing] !== undefined && allowedColumns.includes(key)) {
      cleanUpdates[key] = updates[key as keyof Listing]
    }
  })
  
  const { error } = await supabase
    .from('listings')
    .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
  
  if (error) {
    console.error('Error updating listing:', error)
    console.error('Update data:', cleanUpdates)
    console.error('Error details:', JSON.stringify(error, null, 2))
    console.error('Error message:', error.message)
    console.error('Error code:', error.code)
    console.error('Error hint:', error.hint)
    
    // If error mentions a column, log it specifically
    if (error.message && error.message.includes('column')) {
      const columnMatch = error.message.match(/column "([^"]+)"/)
      if (columnMatch) {
        console.error(`Missing column detected: ${columnMatch[1]}`)
      }
    }
    
    return false
  }
  
  return true
}

export async function updateListingStatus(id: string, status: Listing['status']): Promise<boolean> {
  return updateListing(id, { status })
}

