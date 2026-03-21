import { createClient } from '@/lib/supabase/server'
import { Listing, ListingFormData } from '@/types/listing-coordination'
import { generateFormToken } from '@/lib/magic-links'

export async function createListing(
  data: ListingFormData,
  agentId: string | null,
  skipTokenGeneration: boolean = false
): Promise<Listing | null> {
  const supabase = createClient()

  // Only generate tokens if this is NOT a token-based submission
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
        const agentName =
          `${agentData.preferred_first_name || agentData.first_name} ${agentData.preferred_last_name || agentData.last_name}`.toLowerCase()
        listingInputPaid = agentName.includes('courtney okanlomo') || agentName.includes('okanlomo')
      }
    } catch (error) {
      console.error('Error checking agent name for listing:', error)
    }
  }

  // Step 1: Insert into transactions table
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      property_address: data.property_address,
      transaction_type: data.transaction_type,
      mls_type: data.mls_type || null,
      mls_link: data.mls_link || null,
      lead_source: data.lead_source,
      listing_date: data.estimated_launch_date || null,
      status: data.mls_link ? 'active' : 'pre-listing',
      pre_listing_form_completed: !data.mls_link,
      just_listed_form_completed: !!data.mls_link,
      dotloop_file_created: data.dotloop_file_created,
      listing_input_requested: data.listing_input_requested,
      listing_input_paid: listingInputPaid,
      photography_requested: data.photography_requested,
      listing_input_fee: 50.0,
      pre_listing_token: preListingToken,
      just_listed_token: justListedToken,
      compliance_status: 'not_submitted',
      cda_status: 'pending_compliance',
    })
    .select()
    .single()

  if (transactionError) {
    console.error('Error creating transaction:', transactionError)
    return null
  }

  // Step 2: Insert agent into transaction_internal_agents
  if (agentId) {
    const { error: agentError } = await supabase.from('transaction_internal_agents').insert({
      transaction_id: transaction.id,
      agent_id: agentId,
      agent_role: data.transaction_type === 'lease' ? 'listing_agent' : 'listing_agent',
      payment_status: 'pending',
    })

    if (agentError) {
      console.error('Error adding agent to transaction:', agentError)
    }
  }

  // Step 3: Insert client into transaction_contacts
  if (data.client_names || data.client_phone || data.client_email) {
    const contactType = data.transaction_type === 'lease' ? 'landlord' : 'seller'

    const { error: contactError } = await supabase.from('transaction_contacts').insert({
      transaction_id: transaction.id,
      contact_type: contactType,
      name: data.client_names || null,
      phone: data.client_phone || null,
      email: data.client_email || null,
    })

    if (contactError) {
      console.error('Error adding contact to transaction:', contactError)
    }
  }

  return transaction
}

export async function getListingById(id: string): Promise<Listing | null> {
  const supabase = createClient()

  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single()

  if (error) {
    console.error('Error fetching transaction:', error)
    return null
  }

  return data
}

export async function getAgentListings(agentId: string): Promise<Listing[]> {
  const supabase = createClient()

  // Get transaction IDs where this agent is involved
  const { data: agentTransactions, error: agentError } = await supabase
    .from('transaction_internal_agents')
    .select('transaction_id')
    .eq('agent_id', agentId)

  if (agentError || !agentTransactions?.length) {
    return []
  }

  const transactionIds = agentTransactions.map(t => t.transaction_id)

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .in('id', transactionIds)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching agent transactions:', error)
    return []
  }

  return data || []
}

export async function getAllListings(): Promise<Listing[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all transactions:', error)
    return []
  }

  return data || []
}

export async function updateListing(id: string, updates: Partial<Listing>): Promise<boolean> {
  const supabase = createClient()

  const cleanUpdates: any = {}
  const allowedColumns = [
    'property_address',
    'transaction_type',
    'mls_type',
    'mls_link',
    'listing_date',
    'lead_source',
    'status',
    'listing_website_url',
    'dotloop_file_created',
    'photography_requested',
    'listing_input_requested',
    'compliance_status',
    'cda_status',
    'funding_status',
  ]

  Object.keys(updates).forEach(key => {
    if (updates[key as keyof Listing] !== undefined && allowedColumns.includes(key)) {
      cleanUpdates[key] = updates[key as keyof Listing]
    }
  })

  const { error } = await supabase
    .from('transactions')
    .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('Error updating transaction:', error)
    return false
  }

  return true
}

export async function updateListingStatus(id: string, status: Listing['status']): Promise<boolean> {
  return updateListing(id, { status })
}
