import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListingById } from '@/lib/db/listings'
import { getCoordinationById, updateCoordination } from '@/lib/db/coordination'
import { sendWelcomeEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { coordination_id } = await request.json()

    if (!coordination_id) {
      return NextResponse.json(
        { error: 'Coordination ID is required' },
        { status: 400 }
      )
    }

    const coordination = await getCoordinationById(coordination_id)
    if (!coordination) {
      return NextResponse.json(
        { error: 'Coordination not found' },
        { status: 404 }
      )
    }

    const listing = await getListingById(coordination.listing_id)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    // Get agent information
    let agentName = listing.agent_name || 'Unknown Agent'
    let agentEmail = ''
    let agentPhone = ''

    if (coordination.agent_id) {
      const { data: agentData } = await supabase
        .from('users')
        .select('preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone')
        .eq('id', coordination.agent_id)
        .single()

      if (agentData) {
        agentName = agentData.preferred_first_name && agentData.preferred_last_name
          ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
          : `${agentData.first_name} ${agentData.last_name}`
        agentEmail = agentData.email || ''
        agentPhone = agentData.business_phone || agentData.personal_phone || ''
      }
    } else if (listing.agent_name) {
      // Try to find agent by name - use is_licensed_agent instead of roles array
      const agentNameParts = listing.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()

        // Try preferred name first
        const { data: agentsByPreferred } = await supabase
          .from('users')
          .select('preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .eq('is_licensed_agent', true)
          .limit(1)

        let agentData = null
        if (agentsByPreferred && agentsByPreferred.length > 0) {
          agentData = agentsByPreferred[0]
        } else {
          // Try legal name
          const { data: agentsByLegal } = await supabase
            .from('users')
            .select('preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .eq('is_licensed_agent', true)
            .limit(1)

          if (agentsByLegal && agentsByLegal.length > 0) {
            agentData = agentsByLegal[0]
          }
        }

        if (agentData) {
          agentEmail = agentData.email || ''
          agentPhone = agentData.business_phone || agentData.personal_phone || ''
        }
      }
    }

    const emailResult = await sendWelcomeEmail(
      coordination,
      listing,
      {
        name: agentName,
        email: agentEmail,
        phone: agentPhone,
      }
    )

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    // Update coordination to mark welcome email as sent
    await updateCoordination(coordination_id, {
      welcome_email_sent: true,
      welcome_email_sent_at: new Date().toISOString(),
      last_email_sent_at: new Date().toISOString(),
      total_emails_sent: (coordination.total_emails_sent || 0) + 1,
    })

    // Log email to history
    await supabase
      .from('coordination_email_history')
      .insert({
        coordination_id,
        email_type: 'welcome',
        recipient_email: coordination.seller_email,
        recipient_name: coordination.seller_name,
        subject: `Collective Realty Co. - Welcome to Weekly Listing Coordination - ${listing.property_address}`,
        resend_email_id: emailResult.emailId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully',
      emailId: emailResult.emailId,
    })
  } catch (error: any) {
    console.error('Error sending welcome email:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send welcome email' },
      { status: 500 }
    )
  }
}
