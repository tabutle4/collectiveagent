import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { getEmailLayout, emailSection, emailButton } from '@/lib/email/layout'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_listings')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { listing_id, agent_id, agent_name, agent_email, message, property_address } = body

    if (!listing_id || !agent_id || !message || !property_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: agentOnTransaction } = await supabase
      .from('transaction_internal_agents')
      .select('id')
      .eq('transaction_id', listing_id)
      .eq('agent_id', agent_id)
      .single()

    if (!agentOnTransaction) {
      return NextResponse.json(
        { error: 'Unauthorized - You can only request updates for your own listings' },
        { status: 403 }
      )
    }

    // Get admin users (operations and broker roles)
    const { data: admins } = await supabase
      .from('users')
      .select('email, preferred_first_name, preferred_last_name')
      .in('role', ['operations', 'broker'])

    if (!admins || admins.length === 0) {
      return NextResponse.json({ error: 'No admin users found to notify' }, { status: 500 })
    }

    const adminEmails = admins.map(admin => admin.email).filter(Boolean)
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'}/admin/form-responses`

    if (adminEmails.length > 0) {
      try {
        const content = `
          <p class="email-greeting">Update Request</p>
          <p>An agent has requested an update to a listing.</p>
          
          ${emailSection(
            'Listing Details',
            `
            <p><strong>Agent:</strong> ${agent_name}</p>
            <p><strong>Agent Email:</strong> ${agent_email}</p>
            <p><strong>Property:</strong> ${property_address}</p>
            <p><strong>Listing ID:</strong> ${listing_id}</p>
          `
          )}
          
          ${emailSection(
            'Requested Update',
            `
            <p style="white-space: pre-wrap;">${message}</p>
          `
          )}
          
          <p>Please review this request and update the listing information.</p>
          
          ${emailButton('View in Dashboard', dashboardUrl)}
        `

        await sendEmail({
          to: adminEmails,
          subject: `Update Request: ${property_address}`,
          html: getEmailLayout(content, {
            title: 'Listing Update Request',
            subtitle: property_address,
          }),
        })
      } catch (emailError) {
        console.error('Error sending email notification:', emailError)
      }
    }

    return NextResponse.json({ success: true, message: 'Update request sent successfully' })
  } catch (error: any) {
    console.error('Error processing update request:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process update request' },
      { status: 500 }
    )
  }
}
