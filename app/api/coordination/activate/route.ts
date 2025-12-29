import { NextRequest, NextResponse } from 'next/server'
import { createCoordination } from '@/lib/db/coordination'
import { getListingById, updateListing } from '@/lib/db/listings'
import { getServiceConfig } from '@/lib/db/service-config'
import { createListingFolder } from '@/lib/microsoft-graph'
import { sendWelcomeEmail } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const body = await request.json()
    const {
      listing_id,
      seller_name,
      seller_email,
      listing_website_url,
      agent_id,
      payment_method,
      custom_service_fee,
    } = body
    
    // Allow broker_listing if custom_service_fee is 0, otherwise require client_direct or agent_pays
    if (!payment_method) {
      return NextResponse.json(
        { error: 'Payment method is required' },
        { status: 400 }
      )
    }
    
    // If custom_service_fee is 0, allow broker_listing; otherwise require standard payment methods
    if (custom_service_fee === 0) {
      if (!['client_direct', 'agent_pays', 'broker_listing'].includes(payment_method)) {
        return NextResponse.json(
          { error: 'Invalid payment method for broker listing' },
          { status: 400 }
        )
      }
    } else {
      if (!['client_direct', 'agent_pays'].includes(payment_method)) {
        return NextResponse.json(
          { error: 'Valid payment method is required' },
          { status: 400 }
        )
      }
    }
    
    const listing = await getListingById(listing_id)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }
    
    const serviceConfig = await getServiceConfig('listing_coordination')
    const serviceFee = custom_service_fee !== undefined ? custom_service_fee : (serviceConfig?.price || 250.00)
    
    let paymentDueDate = null
    // Only set payment due date for agent_pays (not broker_listing)
    if (payment_method === 'agent_pays') {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 60)
      paymentDueDate = dueDate.toISOString().split('T')[0]
    }
    
    const { sharingUrl } = await createListingFolder(listing.property_address, listing_id)
    
    const coordination = await createCoordination({
      listing_id,
      agent_id,
      seller_name,
      seller_email,
      service_fee: serviceFee,
      start_date: new Date().toISOString().split('T')[0],
      payment_method,
      payment_due_date: paymentDueDate,
    })
    
    if (!coordination) {
      return NextResponse.json(
        { error: 'Failed to create coordination' },
        { status: 500 }
      )
    }
    
    await supabase
      .from('listing_coordination')
      .update({ onedrive_folder_url: sharingUrl })
      .eq('id', coordination.id)
    
    if (listing_website_url) {
      await updateListing(listing_id, { listing_website_url })
    }
    
    const { data: agentData } = await supabase
      .from('users')
      .select('*')
      .eq('id', agent_id)
      .single()
    
    if (agentData) {
      const result = await sendWelcomeEmail(
        coordination,
        listing,
        {
          name: agentData.preferred_first_name && agentData.preferred_last_name
            ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
            : `${agentData.first_name} ${agentData.last_name}`,
          email: agentData.email,
          phone: agentData.business_phone || agentData.personal_phone || '',
        }
      )
      
      if (result.success) {
        await supabase
          .from('listing_coordination')
          .update({
            welcome_email_sent: true,
            welcome_email_sent_at: new Date().toISOString(),
            last_email_sent_at: new Date().toISOString(),
            total_emails_sent: 1,
          })
          .eq('id', coordination.id)

        // Log email to history
        await supabase
          .from('coordination_email_history')
          .insert({
            coordination_id: coordination.id,
            email_type: 'welcome',
            recipient_email: coordination.seller_email,
            recipient_name: coordination.seller_name,
            subject: `Collective Realty Co. - Welcome to Weekly Listing Coordination - ${listing.property_address}`,
            resend_email_id: result.emailId || null,
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
      } else {
        // Log failed email
        await supabase
          .from('coordination_email_history')
          .insert({
            coordination_id: coordination.id,
            email_type: 'welcome',
            recipient_email: coordination.seller_email,
            recipient_name: coordination.seller_name,
            subject: `Collective Realty Co. - Welcome to Weekly Listing Coordination - ${listing.property_address}`,
            status: 'failed',
            error_message: result.error || 'Unknown error',
            sent_at: new Date().toISOString(),
          })
      }
    }
    
    return NextResponse.json({
      success: true,
      coordination,
    })
    
  } catch (error: any) {
    console.error('Error activating coordination:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to activate coordination' },
      { status: 500 }
    )
  }
}

