import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createListing, updateListing } from '@/lib/db/listings'
import { createCoordination } from '@/lib/db/coordination'
import { getServiceConfig } from '@/lib/db/service-config'
import { createListingFolder } from '@/lib/microsoft-graph'
import { sendWelcomeEmail } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { autoCascadeTransaction } from '@/lib/transactions/cascade'
import { getFormConfig, createFlyerFromForm } from '@/lib/flyers/createFlyerFromForm'
import { getEmailLayout } from '@/lib/email/layout'
import { buildFormAnswersHtml } from '@/lib/form-fields'
import { Resend } from 'resend'
import { normalizeAddressComponents, buildDisplayAddress, validateAddressComponents, normalizePropertyStats } from '@/lib/transactions/utils'
import { checkRequired, requiredFieldsError, JUST_LISTED_RULES, PRE_LISTING_RULES } from '@/lib/forms/requiredFields'
import { normalizeAddressForStorage, addressMatchKey } from '@/lib/transactions/utils'
import { findExactTransactionByAddress, isVisibleToAgent, findDuplicateTransactions } from '@/lib/transactions/dedupe'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

// Helper function to find existing transaction by property address and agent.
// Matches on a normalized address key so slight typing differences still match
// (e.g. "123 Main St." vs "123 main street") and pre-normalization historical
// rows still pair with new normalized submissions.
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

  // Pull this agent's transactions and match on the normalized key in code,
  // since the stored value is display-normalized, not match-key form.
  const { data: candidates, error } = await supabase
    .from('transactions')
    .select('*')
    .in('id', transactionIds)
    .order('created_at', { ascending: false })

  if (error || !candidates?.length) {
    return null
  }

  const targetKey = addressMatchKey(propertyAddress)
  if (!targetKey) return null

  // Cancelled and archived deals are not link targets: linking a new listing to
  // a deal the office already retired would resurrect it on the agent's screen.
  const match = candidates.find(
    (t: any) => isVisibleToAgent(t) && addressMatchKey(t.property_address) === targetKey
  )
  if (match) return match

  // Nothing among this agent's own deals. Before creating one, check the whole
  // brokerage: a deal for this property may already exist under the Payload
  // webhook with no agent row, or under a co-agent, and creating here would
  // make it a duplicate. Exact tier only - this path runs without a person to
  // confirm a looser guess.
  const exact = await findExactTransactionByAddress(propertyAddress)
  if (!exact) return null
  const { data: brokerageMatch } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', exact.id)
    .maybeSingle()
  return brokerageMatch || null
}

// Option B: link a listing to a transaction. Finds an existing transaction for
// this agent+property; if none exists, creates ONE with the right status, links
// it to the listing via legacy_listing_id, and creates the client contact +
// listing-agent rows. Never creates a duplicate. Returns the transaction id or
// null if it could not resolve one. Failures here never block the listing.
async function findOrCreateListingTransaction(
  supabase: any,
  body: any,
  agentId: string | null,
  listing: any,
  formType: string
): Promise<string | null> {
  try {
    if (!agentId || !listing?.id || !listing?.property_address) return null

    // 1. Find an existing transaction for this agent + property.
    const existing = await findExistingTransaction(
      supabase,
      listing.property_address,
      agentId
    )

    if (existing) {
      // Link the existing transaction to this listing (do not duplicate).
      if (!existing.legacy_listing_id) {
        await supabase
          .from('transactions')
          .update({ legacy_listing_id: listing.id, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      await createJustListedFlyer(existing.id, agentId, body, formType)
      return existing.id
    }

    // 2. No transaction yet: create one. Status by form type.
    // Property stats live on the transaction, not the flyer.
    const txnStats = normalizePropertyStats({
      bedrooms: body.bedrooms, bathrooms: body.bathrooms,
      garage: body.garage, sqft: body.sqft,
    })
    const status = formType === 'just-listed' ? 'active' : 'prospect'
    const isLease = listing.transaction_type === 'lease'

    const { data: newTxn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        property_address: listing.property_address,
        street_address: body.street_address || null,
        unit: body.unit || null,
        bedrooms: txnStats.bedrooms,
        bathrooms: txnStats.bathrooms,
        garage: txnStats.garage,
        building_sqft: txnStats.building_sqft,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        status,
        transaction_type: isLease ? 'landlord_v2' : 'seller_v2',
        client_name: body.client_names ? formatNameToTitleCase(String(body.client_names).trim()) : null,
        client_email: body.client_email || null,
        client_phone: body.client_phone || null,
        lead_source: body.lead_source || null,
        mls_link: body.mls_link || null,
        submitted_by: agentId,
        legacy_listing_id: listing.id,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (txnErr || !newTxn) {
      console.error('Option B: failed to create listing transaction:', txnErr)
      return null
    }

    // 3. Listing agent row. Carries the full canonical field set so this is a
    // real commission-bearing TIA, not a stub: uses_canonical_math drives the
    // auto-calc cascade once a commission basis exists, and side / plan / units
    // / counts_toward_progress mirror what app/api/transactions/route.ts stamps.
    // The plan is read with the admin client because the listing agent can
    // differ from the caller and RLS on users would block a session-scoped read
    // (same reason the canonical create route uses supabaseAdmin here).
    const { data: listingAgentUser } = await supabaseAdmin
      .from('users')
      .select('commission_plan, lease_commission_plan')
      .eq('id', agentId)
      .single()
    const listingCommissionPlan = isLease
      ? (listingAgentUser?.lease_commission_plan || listingAgentUser?.commission_plan || '')
      : (listingAgentUser?.commission_plan || '')
    await supabase.from('transaction_internal_agents').insert({
      transaction_id: newTxn.id,
      agent_id: agentId,
      agent_role: 'listing_agent',
      side: isLease ? 'landlord' : 'seller',
      commission_plan: listingCommissionPlan,
      counts_toward_progress: !isLease,
      units: 1,
      funding_source: 'crc',
      payment_status: 'pending',
      uses_canonical_math: true,
      updated_at: new Date().toISOString(),
    })

    // 4. Client contact row (seller for sale, landlord for lease).
    if (body.client_names) {
      await supabase.from('transaction_contacts').insert({
        transaction_id: newTxn.id,
        contact_type: isLease ? 'landlord' : 'seller',
        name: body.client_names || null,
        phone: body.client_phone || null,
        email: body.client_email || null,
      })
    }

    await createJustListedFlyer(newTxn.id, agentId, body, formType)

    // Run the commission cascade so office_net and the TIA money fields
    // populate the same way every other create path does. This is a no-op
    // while the listing has no commission basis yet (autoCascadeTransaction
    // skips rows whose basis resolves to 0), and takes over automatically the
    // moment a side commission or gross is entered on the deal.
    await autoCascadeTransaction(newTxn.id)

    return newTxn.id
  } catch (err) {
    console.error('Option B: findOrCreateListingTransaction error:', err)
    return null
  }
}

// Creates a Just Listed flyer row for the listing's transaction, once. Only
// fires for the just-listed form (not pre-listing). Idempotent: if a
// just_listed flyer already exists for this transaction it does nothing, so
// re-submitting the form never spawns duplicates. Matches the exact insert
// shape used by the compliance and under-contract routes so the flyer process
// is identical across all types. Failures never block the listing.
async function createJustListedFlyer(
  transactionId: string,
  agentId: string | null,
  body: any,
  formType: string
): Promise<void> {
  // Only the just-listed form produces a flyer here. Whether it actually does,
  // and which flyer type, is read from the forms table (triggers_flyer /
  // flyer_type) rather than hardcoded, so the behavior can be changed in the
  // admin UI without a code change.
  if (formType !== 'just-listed') return

  const form = await getFormConfig('just_listed')
  await createFlyerFromForm({
    form,
    transactionId,
    agentId,
    flyerDivision: body.flyer_division || null,
  })
}

const resend = new Resend(process.env.RESEND_API_KEY)
const NOTIFY_FROM = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

// Emails the office when a Pre-Listing or Just Listed form comes in. The
// recipients come from the forms table (notification_emails), the same way the
// under-contract and compliance forms do it. Never throws: a failed notification
// must not fail the submission.
async function sendListingNotifications(emails: string[], subject: string, html: string, identifier: string) {
  for (const email of emails) {
    if (!email?.trim()) continue
    try {
      await resend.emails.send({
        from: NOTIFY_FROM,
        to: [email.trim()],
        subject: `${subject} - ${identifier}`,
        html,
      })
    } catch (err) {
      console.error(`Failed to notify ${email}:`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  // Agents submit their own Just Listed and Pre-Listing forms here, so this is
  // requireAuth, not requirePermission: the agent role does not carry
  // can_manage_listings (that permission gates the admin listing routes:
  // update, delete, search). Identity comes from the session, and submitting
  // on behalf of a different agent is enforced below as staff-only.
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    // Normalize the property address once, up front, so every downstream use
    // (storage, matching, coordination folder, contacts) uses the clean value.
    // Server side required fields. Just Listed is the form with an MLS link;
    // Pre-Listing is the one without. The browser hints are easily bypassed, so
    // this is the gate that holds.
    // An update only touches a few fields, so it is not held to the full list.
    if (body.submission_type !== 'update') {
      const rules = body.mls_link ? JUST_LISTED_RULES : PRE_LISTING_RULES
      const missing = checkRequired(body, rules)
      if (missing.length > 0) {
        return NextResponse.json({ error: requiredFieldsError(missing) }, { status: 400 })
      }
    }

    // Address is now entered as structured parts (street/unit/city/state/zip).
    // Normalize them, reject anything malformed, then GENERATE property_address
    // so the display string can never be a free typed mess again. Older callers
    // that still send only property_address keep working.
    if (body.street_address || body.city || body.zip) {
      const parts = normalizeAddressComponents(body)
      const problems = validateAddressComponents(parts)
      if (problems.length) {
        return NextResponse.json({ error: problems.join('. ') }, { status: 400 })
      }
      body.street_address = parts.street_address
      body.unit = parts.unit || null
      body.city = parts.city
      body.state = parts.state
      body.zip = parts.zip
      body.property_address = buildDisplayAddress(parts)
    } else if (body.property_address) {
      body.property_address = normalizeAddressForStorage(body.property_address)
    }

    // Both the Pre-Listing and Just Listed forms land here, and both create a
    // transaction through findOrCreateListingTransaction below. That helper
    // attaches on an exact address match, which is right and needs no prompt,
    // but it cannot see a near miss: a pre-listing typed "Southbrook Drive"
    // against an existing "Southbrook St" would create a second deal for one
    // property, which is the exact pair that reached production.
    //
    // So: exact matches stay silent and auto-attach. A similar-only match asks
    // the agent, using the same duplicate_check contract the other forms use.
    // Checked here, before createListing, so a declined submission does not
    // leave an orphan listing row behind.
    if (body.submission_type !== 'update' && !body.confirm_new_deal && body.property_address) {
      const listingMatches = await findDuplicateTransactions(body.property_address)
      const exactCount = listingMatches.filter(m => m.confidence === 'exact').length
      // Exactly one exact match is unambiguous, so the helper below attaches to
      // it silently. Anything else needs a person: no exact match but a similar
      // one is a possible typo, and several exact matches means the property
      // has more than one live deal and only the agent knows which is theirs.
      if (exactCount !== 1 && listingMatches.length) {
        return NextResponse.json({ success: false, duplicate_check: true, matches: listingMatches })
      }
    }

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


    // Original authenticated flow
    // Identity comes from the session. The old body.user_id was only safe
    // while this route was staff-only; an agent-callable route must never
    // trust a client-supplied identity.
    const userId = auth.user.id

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

    // Submitting on behalf of a different agent is staff-only, same rule as
    // the compliance and under-contract routes. An agent picking themselves in
    // the selector resolves to their own id and passes.
    if (finalAgentId && finalAgentId !== userId && !isAdmin) {
      return NextResponse.json({ error: 'Not permitted to submit on behalf of another agent' }, { status: 403 })
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

    // Option B: find-or-create the linked transaction for this listing.
    // Derive form type the same way createListing does: an MLS link means the
    // property is already listed (just-listed), otherwise it is a pre-listing.
    const listingFormType = body.mls_link ? 'just-listed' : 'pre-listing'
    const linkedTransactionId = await findOrCreateListingTransaction(
      supabase,
      body,
      finalAgentId,
      listing,
      listingFormType
    )

    // Unified submission record, and the office notification.
    //
    // Both of these used to live inside the old public token path. When those
    // forms were removed they went with it, which silently stopped logging these
    // two forms and stopped notifying the office about them. They belong here,
    // in the authenticated path, where every submission now lands.
    //
    // Neither one is allowed to fail the submission.
    // The form config is loaded here, outside the block, because the flyer
    // link at the bottom of this handler is gated on triggers_flyer too.
    const formConfig = await getFormConfig(
      listingFormType === 'just-listed' ? 'just_listed' : 'pre_listing'
    )
    if (finalAgentId) {

      // Audit trail: every form submission is logged in agent_form_submissions
      // so the office has one place to see them all.
      try {
        await supabase.from('agent_form_submissions').insert({
          form_id: formConfig?.id || null,
          agent_id: finalAgentId,
          submitted_at: new Date().toISOString(),
          status: 'submitted',
          listing_id: listing.id,
          transaction_id: linkedTransactionId,
          data: { ...body, submission_mode: listingFormType },
          updated_at: new Date().toISOString(),
        })
      } catch (subErr) {
        console.error('Error writing submission record:', subErr)
      }

      // Office notification. Recipients come from the forms table, the same way
      // the under-contract and compliance forms do it.
      try {
        const notificationEmails: string[] = formConfig?.notification_emails || []
        if (notificationEmails.length > 0) {
          const isJustListed = listingFormType === 'just-listed'
          const formLabel = isJustListed ? 'Just Listed' : 'Pre-Listing'
          const address = listing.property_address || 'a property'
          const mlsLine = body.mls_link
            ? `<p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">MLS:</strong> ${body.mls_link}</p>`
            : ''
          const coordinationLine = body.coordination_requested
            ? '<p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Listing Coordination:</strong> Requested</p>'
            : ''
          const notifyHtml = getEmailLayout(
            `<p style="margin:0 0 16px;font-size:14px;color:#555555;">A ${formLabel} form has been submitted for <strong style="color:#1a1a1a;">${address}</strong>.</p>
             <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
               <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${listing.agent_name || 'Unknown'}</p>
               <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Client:</strong> ${listing.client_names || 'N/A'}</p>
               <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Type:</strong> ${listing.transaction_type || 'N/A'}</p>
               ${mlsLine}
               ${coordinationLine}
             </div>
             ${buildFormAnswersHtml(body)}`,
            { title: `${formLabel} Form Submitted`, preheader: `${formLabel}: ${address}` }
          )
          await sendListingNotifications(notificationEmails, formLabel, notifyHtml, address)
        }
      } catch (notifyErr) {
        console.error('Error sending listing notification:', notifyErr)
      }
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

    // Whether a flyer link goes back to the agent is decided by the forms
    // table (triggers_flyer), the same switch that decides whether the flyer
    // row is created. Hand the agent a link straight to the flyer tab so they
    // can add the photo and download it.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const flyerUrl =
      listingFormType === 'just-listed' && linkedTransactionId && formConfig?.triggers_flyer
        ? `${appUrl}/agent/flyer/${linkedTransactionId}?type=just_listed`
        : null

    return NextResponse.json({
      success: true,
      listing,
      transaction_id: linkedTransactionId,
      flyer_url: flyerUrl,
      message: flyerUrl
        ? 'Your listing has been submitted. Upload a property photo to finish your Just Listed flyer.'
        : 'Your pre-listing has been submitted. The office will follow up shortly.',
    })
  } catch (error: any) {
    console.error('Error creating listing:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create listing' },
      { status: 500 }
    )
  }
}
