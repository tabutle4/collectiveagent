import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { updateListing } from '@/lib/db/listings'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_listings')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { listing_id, updates } = body

    if (!listing_id || !updates) {
      return NextResponse.json({ error: 'Listing ID and updates are required' }, { status: 400 })
    }

    // If agent_name is being updated, find the agent and update transaction_internal_agents
    if (updates.agent_name) {
      const agentNameParts = updates.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()

        let newAgentId = null

        // Try preferred name first - use is_licensed_agent instead of roles array
        const { data: agentsByPreferred, error: preferredError } = await supabase
          .from('users')
          .select('id, preferred_first_name, preferred_last_name')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .eq('is_licensed_agent', true)
          .limit(1)

        if (!preferredError && agentsByPreferred && agentsByPreferred.length > 0) {
          newAgentId = agentsByPreferred[0].id
        } else {
          // Try legal name
          const { data: agentsByLegal, error: legalError } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .eq('is_licensed_agent', true)
            .limit(1)

          if (!legalError && agentsByLegal && agentsByLegal.length > 0) {
            newAgentId = agentsByLegal[0].id
          }
        }

        // Update the agent in transaction_internal_agents
        if (newAgentId) {
          // Find existing listing_agent record for this transaction
          const { data: existingAgent } = await supabase
            .from('transaction_internal_agents')
            .select('id')
            .eq('transaction_id', listing_id)
            .eq('agent_role', 'listing_agent')
            .single()

          if (existingAgent) {
            await supabase
              .from('transaction_internal_agents')
              .update({ agent_id: newAgentId })
              .eq('id', existingAgent.id)
          } else {
            // New listing_agent row: stamp the full canonical field set so it
            // is a real commission-bearing TIA (not a stub), matching the
            // listing create route and app/api/transactions/route.ts. The plan
            // is read with the admin client because the agent can differ from
            // the caller and RLS on users would block a session-scoped read.
            const { data: listingTxn } = await supabase
              .from('transactions')
              .select('transaction_type')
              .eq('id', listing_id)
              .single()
            const isLease = listingTxn?.transaction_type === 'lease'
            const { data: newAgentUser } = await supabaseAdmin
              .from('users')
              .select('commission_plan, lease_commission_plan')
              .eq('id', newAgentId)
              .single()
            const listingCommissionPlan = isLease
              ? (newAgentUser?.lease_commission_plan || newAgentUser?.commission_plan || '')
              : (newAgentUser?.commission_plan || '')
            await supabase.from('transaction_internal_agents').insert({
              transaction_id: listing_id,
              agent_id: newAgentId,
              agent_role: 'listing_agent',
              side: isLease ? 'landlord' : 'seller',
              commission_plan: listingCommissionPlan,
              counts_toward_progress: !isLease,
              units: 1,
              funding_source: 'crc',
              payment_status: 'pending',
              uses_canonical_math: true,
            })
          }
        }
      }

      // Remove agent_name and agent_id from updates since they don't exist on transactions table
      delete updates.agent_name
      delete updates.agent_id
    }

    // Handle client info updates - move to transaction_contacts
    if (updates.client_names || updates.client_phone || updates.client_email) {
      // Get transaction type to determine contact type
      const { data: transaction } = await supabase
        .from('transactions')
        .select('transaction_type')
        .eq('id', listing_id)
        .single()

      const contactType = transaction?.transaction_type === 'lease' ? 'landlord' : 'seller'

      // Check if contact exists
      // .limit(1) on an array, not .single(). PostgREST errors a .single() that
      // matches zero OR more than one row, the error was destructured away, and
      // the code then fell through to the INSERT - so a deal that already had
      // two rows of this type gained a third on every save. Oldest row wins so
      // the choice is stable, and a failed lookup writes nothing at all.
      const { data: existingRows, error: lookupError } = await supabase
        .from('transaction_contacts')
        .select('id')
        .eq('transaction_id', listing_id)
        .eq('contact_type', contactType)
        .order('created_at', { ascending: true })
        .limit(2)
      const existingContact = lookupError ? null : existingRows?.[0]
      // Several rows of this type means several people, and this route has one
      // client field. Writing it into the oldest row flattens them, and with
      // the projection trigger live the value written is itself the joined
      // list, so the column would recompute with a name in it twice.
      const tooManyToWrite = !lookupError && (existingRows?.length ?? 0) > 1

      if (lookupError) {
        console.error('Contact lookup failed, not writing:', lookupError.message)
      } else if (tooManyToWrite) {
        console.warn(`Skipping ${contactType} contact write: deal has ${existingRows?.length} rows of this type.`)
      } else if (existingContact) {
        await supabase
          .from('transaction_contacts')
          .update({
            name: updates.client_names || null,
            phone: updates.client_phone || null,
            email: updates.client_email || null,
          })
          .eq('id', existingContact.id)
      } else {
        await supabase.from('transaction_contacts').insert({
          transaction_id: listing_id,
          contact_type: contactType,
          name: updates.client_names || null,
          phone: updates.client_phone || null,
          email: updates.client_email || null,
        })
      }

      // Remove from updates since they don't exist on transactions table
      delete updates.client_names
      delete updates.client_phone
      delete updates.client_email
    }

    // Check if transaction exists first
    const { data: existingTransaction, error: checkError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', listing_id)
      .single()

    if (checkError || !existingTransaction) {
      console.error('Transaction not found:', checkError)
      return NextResponse.json(
        { error: `Transaction not found: ${checkError?.message || 'Transaction does not exist'}` },
        { status: 404 }
      )
    }

    // Only call updateListing if there are still updates for the transactions table
    if (Object.keys(updates).length > 0) {
      const success = await updateListing(listing_id, updates)

      if (!success) {
        return NextResponse.json({ error: 'Failed to update transaction.' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Listing updated successfully',
    })
  } catch (error: any) {
    console.error('Error updating listing:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update listing' },
      { status: 500 }
    )
  }
}
