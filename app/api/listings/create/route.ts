import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createListing, updateListing } from '@/lib/db/listings'
import { createCoordination } from '@/lib/db/coordination'
import { getServiceConfig } from '@/lib/db/service-config'
import { createListingFolder } from '@/lib/microsoft-graph'
import { sendWelcomeEmail } from '@/lib/email/send'
import { sendFormSubmissionNotification } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { validateFormToken } from '@/lib/magic-links'

// Helper function to find existing transaction by property address and agent
async function findExistingTransaction(
  supabase: any,
  propertyAddress: string,
  agentId: string
): Promise<any | null> {
  // First get transaction IDs for this agent
  const { data: agentTransactions, error: agentError } = await supabase
    .from('transaction_internal_agents')
    .select('transaction_id')
    .eq('agent_id', agentId)

  if (agentError || !agentTransactions?.length) {
    return null
  }

  const transactionIds = agentTransactions.map((t: any) => t.transaction_id)

  const { data: existingTransaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('property_address', propertyAddress)
    .in('id', transactionIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !existingTransaction) {
    return null
  }

  return existingTransaction
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_listings')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    // Get agent_id (either from body.agent_id or look up by agent_name)
    let agentIdForListing: string | null = null
    if (body.agent_id) {
      agentIdForListing = body.agent_id
    } else if (body.agent_name) {
      // Look up agent by name - use is_licensed_agent instead of roles array
      const agentNameParts = body.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()

        const { data: agentsByPreferred } = await supabase
          .from('users')
          .select('id, preferred_first_name, preferred_last_name')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .eq('is_licensed_agent', true)
          .limit(1)

        if (agentsByPreferred && agentsByPreferred.length > 0) {
          agentIdForListing = agentsByPreferred[0].id
        } else {
          const { data: agentsByLegal } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .eq('is_licensed_agent', true)
            .limit(1)

          if (agentsByLegal && agentsByLegal.length > 0) {
            agentIdForListing = agentsByLegal[0].id
          }
        }
      }
    }

    if (!agentIdForListing) {
      return NextResponse.json(
        { error: 'Agent ID is required. Please select an agent from the dropdown.' },
        { status: 400 }
      )
    }

    // Check if this is an update to an existing transaction
    const isUpdate = body.submission_type === 'update'
    let existingListing = null

    if (isUpdate && body.property_address) {
      existingListing = await findExistingTransaction(
        supabase,
        body.property_address,
        agentIdForListing
      )

      if (!existingListing) {
        return NextResponse.json(
          {
            error:
              'No existing transaction found for this property address and agent. Please select "New Submission" instead.',
          },
          { status: 404 }
        )
      }
    }

    // Check if this is a token-based submission (public form, no login required)
    if (body.form_token) {
      // Validate token format
      const validation = validateFormToken(body.form_token)
      if (!validation) {
        return NextResponse.json({ error: 'Invalid form token' }, { status: 401 })
      }

      // Fetch form record to get notification_email
      let formRecord = null
      try {
        const { data: form } = await supabase
          .from('forms')
          .select('id, name, form_type, notification_email')
          .eq('shareable_token', body.form_token)
          .single()

        formRecord = form
      } catch (error) {
        console.error('Error fetching form record:', error)
        // Continue even if form record not found (for legacy tokens)
      }

      // If updating, update existing listing
      if (isUpdate && existingListing) {
        const updateData: any = {
          transaction_type: body.transaction_type,
          mls_type: body.mls_type,
          lead_source: body.lead_source,
          dotloop_file_created: body.dotloop_file_created,
          listing_input_requested: body.listing_input_requested,
          photography_requested: body.photography_requested,
        }

        if (validation.formType === 'pre-listing') {
          updateData.listing_date = body.estimated_launch_date
          updateData.pre_listing_form_completed = true
        } else {
          updateData.mls_link = body.mls_link
          updateData.status = body.status || 'active'
          updateData.just_listed_form_completed = true
        }

        await updateListing(existingListing.id, updateData)

        // Update contact info in transaction_contacts
        if (body.client_names || body.client_phone || body.client_email) {
          const contactType = body.transaction_type === 'lease' ? 'landlord' : 'seller'

          // Check if contact exists
          const { data: existingContact } = await supabase
            .from('transaction_contacts')
            .select('id')
            .eq('transaction_id', existingListing.id)
            .eq('contact_type', contactType)
            .single()

          if (existingContact) {
            await supabase
              .from('transaction_contacts')
              .update({
                name: body.client_names || null,
                phone: body.client_phone || null,
                email: body.client_email || null,
              })
              .eq('id', existingContact.id)
          } else {
            await supabase.from('transaction_contacts').insert({
              transaction_id: existingListing.id,
              contact_type: contactType,
              name: body.client_names || null,
              phone: body.client_phone || null,
              email: body.client_email || null,
            })
          }
        }

        // Send notification email if form has notification_email set
        if (formRecord?.notification_email) {
          try {
            await sendFormSubmissionNotification({
              formName: formRecord.name || `${validation.formType} Form`,
              formType: validation.formType,
              submissionData: {
                ...body,
                listing_id: existingListing.id,
                agent_name: body.agent_name,
                submission_type: 'update',
              },
              responseId: existingListing.id,
              notificationEmail: formRecord.notification_email,
            })
          } catch (emailError) {
            console.error('Error sending form notification email:', emailError)
            // Don't fail the submission if email fails
          }
        }

        return NextResponse.json({
          success: true,
          listing: { ...existingListing, ...updateData },
          message: 'Transaction updated successfully',
        })
      }

      // Create new listing (don't generate tokens since this is already token-based)
      const listing = await createListing(body, agentIdForListing, true)

      if (!listing) {
        return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
      }

      // Send notification email if form has notification_email set
      if (formRecord?.notification_email) {
        try {
          await sendFormSubmissionNotification({
            formName: formRecord.name || `${validation.formType} Form`,
            formType: validation.formType,
            submissionData: {
              ...body,
              listing_id: listing.id,
              agent_name: body.agent_name,
            },
            responseId: listing.id,
            notificationEmail: formRecord.notification_email,
          })
        } catch (emailError) {
          console.error('Error sending form notification email:', emailError)
          // Don't fail the submission if email fails
        }
      }

      // Handle coordination if requested (same logic as authenticated flow)
      if (body.coordination_requested) {
        if (!body.is_broker_listing && !body.coordination_payment_method) {
          return NextResponse.json(
            { error: 'Payment method is required for coordination service' },
            { status: 400 }
          )
        }

        const serviceConfig = await getServiceConfig('listing_coordination')
        const serviceFee = body.is_broker_listing ? 0.0 : serviceConfig?.price || 250.0

        let paymentDueDate = null
        if (!body.is_broker_listing && body.coordination_payment_method === 'agent_pays') {
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + 60)
          paymentDueDate = dueDate.toISOString().split('T')[0]
        }

        const { folderPath, sharingUrl } = await createListingFolder(
          listing.property_address,
          listing.id,
          listing.transaction_type || 'sale'
        )

        if (!agentIdForListing) {
          return NextResponse.json(
            {
              error:
                'Agent ID is required for coordination service. Please ensure the agent name matches an agent in the system.',
            },
            { status: 400 }
          )
        }

        const coordination = await createCoordination({
          listing_id: listing.id,
          agent_id: agentIdForListing,
          seller_name: body.client_names,
          seller_email: body.client_email,
          service_fee: serviceFee,
          start_date: new Date().toISOString().split('T')[0],
          payment_method: body.is_broker_listing
            ? 'broker_listing'
            : body.coordination_payment_method,
          payment_due_date: paymentDueDate,
        })

        if (coordination) {
          await supabase
            .from('listing_coordination')
            .update({
              onedrive_folder_url: sharingUrl,
            })
            .eq('id', coordination.id)

          const { data: agentData } = await supabase
            .from('users')
            .select(
              'preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone'
            )
            .eq('id', agentIdForListing)
            .single()

          if (agentData) {
            const agentInfo = {
              name:
                agentData.preferred_first_name && agentData.preferred_last_name
                  ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
                  : `${agentData.first_name} ${agentData.last_name}`,
              email: agentData.email,
              phone: agentData.business_phone || agentData.personal_phone || '',
            }

            await sendWelcomeEmail(coordination, listing, agentInfo)

            await supabase
              .from('listing_coordination')
              .update({
                welcome_email_sent: true,
                welcome_email_sent_at: new Date().toISOString(),
              })
              .eq('id', coordination.id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        listing,
        message: 'Form submitted successfully',
      })
    }

    // Original authenticated flow
    // Get user_id from request body (sent from client)
    const userId = body.user_id

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 401 })
    }

    const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Allow both agents and admins to create listings
    // Check role column (lowercase values: agent, tc, operations, broker)
    const userRole = (userData.role || '').toLowerCase()
    const isAdmin = ['operations', 'broker', 'tc'].includes(userRole)
    const isAgent = userData.is_licensed_agent === true

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Forbidden - Must be an agent or admin' }, { status: 403 })
    }

    // Get agent_id from body (if using selector) or look up by name
    let agentIdForListingAuth: string | null = null
    if (body.agent_id) {
      agentIdForListingAuth = body.agent_id
    } else if (body.agent_name) {
      // Look up agent by name (fallback for old forms) - use is_licensed_agent
      const agentNameParts = body.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()

        const { data: agentsByPreferred, error: preferredError } = await supabase
          .from('users')
          .select('id, preferred_first_name, preferred_last_name')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .eq('is_licensed_agent', true)
          .limit(1)

        if (!preferredError && agentsByPreferred && agentsByPreferred.length > 0) {
          agentIdForListingAuth = agentsByPreferred[0].id
        } else {
          const { data: agentsByLegal, error: legalError } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .eq('is_licensed_agent', true)
            .limit(1)

          if (!legalError && agentsByLegal && agentsByLegal.length > 0) {
            agentIdForListingAuth = agentsByLegal[0].id
          }
        }
      }
    }

    // Use the found agent ID, or fallback to submitting user only if they're an agent
    let finalAgentId: string | null = null
    if (agentIdForListingAuth) {
      finalAgentId = agentIdForListingAuth
    } else if (isAgent) {
      // Only use submitting user's ID if they're an agent (not an admin)
      finalAgentId = userId
    }

    // Check if this is an update to an existing transaction (authenticated flow)
    const isUpdateAuth = body.submission_type === 'update'
    let existingListingAuth = null

    if (isUpdateAuth && body.property_address && finalAgentId) {
      existingListingAuth = await findExistingTransaction(
        supabase,
        body.property_address,
        finalAgentId
      )

      if (!existingListingAuth) {
        return NextResponse.json(
          {
            error:
              'No existing transaction found for this property address and agent. Please select "New Submission" instead.',
          },
          { status: 404 }
        )
      }

      // Update existing listing
      const updateData: any = {
        transaction_type: body.transaction_type,
        mls_type: body.mls_type,
        lead_source: body.lead_source,
        dotloop_file_created: body.dotloop_file_created,
        listing_input_requested: body.listing_input_requested,
        photography_requested: body.photography_requested,
      }

      if (body.mls_link) {
        // Just Listed form
        updateData.mls_link = body.mls_link
        updateData.status = body.status || 'active'
        updateData.just_listed_form_completed = true
      } else {
        // Pre-listing form
        updateData.listing_date = body.estimated_launch_date
        updateData.pre_listing_form_completed = true
      }

      await updateListing(existingListingAuth.id, updateData)

      // Update contact info in transaction_contacts
      if (body.client_names || body.client_phone || body.client_email) {
        const contactType = body.transaction_type === 'lease' ? 'landlord' : 'seller'

        // Check if contact exists
        const { data: existingContact } = await supabase
          .from('transaction_contacts')
          .select('id')
          .eq('transaction_id', existingListingAuth.id)
          .eq('contact_type', contactType)
          .single()

        if (existingContact) {
          await supabase
            .from('transaction_contacts')
            .update({
              name: body.client_names || null,
              phone: body.client_phone || null,
              email: body.client_email || null,
            })
            .eq('id', existingContact.id)
        } else {
          await supabase.from('transaction_contacts').insert({
            transaction_id: existingListingAuth.id,
            contact_type: contactType,
            name: body.client_names || null,
            phone: body.client_phone || null,
            email: body.client_email || null,
          })
        }
      }

      return NextResponse.json({
        success: true,
        listing: { ...existingListingAuth, ...updateData },
        message: 'Transaction updated successfully',
      })
    }

    const listing = await createListing(body, finalAgentId || '')

    if (!listing) {
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    if (body.coordination_requested) {
      // If broker listing, fee is $0 and payment method is not required
      if (!body.is_broker_listing && !body.coordination_payment_method) {
        return NextResponse.json(
          { error: 'Payment method is required for coordination service' },
          { status: 400 }
        )
      }

      const serviceConfig = await getServiceConfig('listing_coordination')
      // Set fee to $0 for broker listings, otherwise use default
      const serviceFee = body.is_broker_listing ? 0.0 : serviceConfig?.price || 250.0

      let paymentDueDate = null
      // Only set payment due date if not a broker listing and agent is paying
      if (!body.is_broker_listing && body.coordination_payment_method === 'agent_pays') {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 60)
        paymentDueDate = dueDate.toISOString().split('T')[0]
      }

      const { folderPath, sharingUrl } = await createListingFolder(
        listing.property_address,
        listing.id,
        listing.transaction_type || 'sale'
      )

      // Use the listing's agent_id (from the selected agent in the form)
      // Only fallback to submitting user if they're an agent and no agent was found
      const coordinationAgentId = finalAgentId || (isAgent ? userId : null)

      if (!coordinationAgentId) {
        return NextResponse.json(
          {
            error:
              'Agent ID is required for coordination service. Please ensure the agent name matches an agent in the system.',
          },
          { status: 400 }
        )
      }

      const coordination = await createCoordination({
        listing_id: listing.id,
        agent_id: coordinationAgentId,
        seller_name: body.client_names,
        seller_email: body.client_email,
        service_fee: serviceFee,
        start_date: new Date().toISOString().split('T')[0],
        payment_method: body.is_broker_listing
          ? 'broker_listing'
          : body.coordination_payment_method,
        payment_due_date: paymentDueDate,
      })

      if (coordination) {
        await supabase
          .from('listing_coordination')
          .update({
            onedrive_folder_url: sharingUrl,
          })
          .eq('id', coordination.id)

        // Get the actual agent's info for the welcome email (not the submitting user)
        let agentInfo = {
          name:
            userData.preferred_first_name && userData.preferred_last_name
              ? `${userData.preferred_first_name} ${userData.preferred_last_name}`
              : `${userData.first_name} ${userData.last_name}`,
          email: userData.email,
          phone: userData.business_phone || userData.personal_phone || '',
        }

        // If we found an agent, use their info instead
        if (finalAgentId) {
          const { data: actualAgent } = await supabase
            .from('users')
            .select(
              'preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone'
            )
            .eq('id', finalAgentId)
            .single()

          if (actualAgent) {
            agentInfo = {
              name:
                actualAgent.preferred_first_name && actualAgent.preferred_last_name
                  ? `${actualAgent.preferred_first_name} ${actualAgent.preferred_last_name}`
                  : `${actualAgent.first_name} ${actualAgent.last_name}`,
              email: actualAgent.email,
              phone: actualAgent.business_phone || actualAgent.personal_phone || '',
            }
          }
        }

        await sendWelcomeEmail(coordination, listing, agentInfo)

        await supabase
          .from('listing_coordination')
          .update({
            welcome_email_sent: true,
            welcome_email_sent_at: new Date().toISOString(),
          })
          .eq('id', coordination.id)
      }
    }

    return NextResponse.json({
      success: true,
      listing,
      message: 'Listing created successfully',
    })
  } catch (error: any) {
    console.error('Error creating listing:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create listing' },
      { status: 500 }
    )
  }
}
