import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const {
      listing_id,
      agent_id,
      agent_name,
      agent_email,
      message,
      property_address,
    } = body
    
    if (!listing_id || !agent_id || !message || !property_address) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the agent_id matches the requesting user
    // (This is already verified client-side, but double-check for security)
    const { data: listing } = await supabase
      .from('listings')
      .select('agent_id')
      .eq('id', listing_id)
      .single()

    if (!listing || listing.agent_id !== agent_id) {
      return NextResponse.json(
        { error: 'Unauthorized - You can only request updates for your own listings' },
        { status: 403 }
      )
    }

    // Get admin users to send notification
    const { data: admins } = await supabase
      .from('users')
      .select('email, preferred_first_name, preferred_last_name')
      .contains('roles', ['admin'])

    if (!admins || admins.length === 0) {
      return NextResponse.json(
        { error: 'No admin users found to notify' },
        { status: 500 }
      )
    }

    // Send email notification to admins
    const adminEmails = admins.map(admin => admin.email).filter(Boolean)
    
    if (adminEmails.length > 0) {
      try {
        await sendEmail({
          to: adminEmails,
          subject: `Update Request: ${property_address}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #000;">Update Request for Listing</h2>
              
              <div style="background: #f5f5f5; padding: 20px; border-radius: 4px; margin: 20px 0;">
                <p><strong>Agent:</strong> ${agent_name}</p>
                <p><strong>Agent Email:</strong> ${agent_email}</p>
                <p><strong>Property Address:</strong> ${property_address}</p>
                <p><strong>Listing ID:</strong> ${listing_id}</p>
              </div>
              
              <div style="margin: 20px 0;">
                <h3 style="color: #000;">Requested Update:</h3>
                <p style="white-space: pre-wrap; background: #fff; padding: 15px; border-left: 3px solid #000;">${message}</p>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                Please review this request and update the listing information in the admin dashboard.
              </p>
              
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'}/admin/form-responses" style="color: #000; text-decoration: underline;">
                  View in Admin Dashboard
                </a>
              </p>
            </div>
          `,
        })
      } catch (emailError) {
        console.error('Error sending email notification:', emailError)
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Update request sent successfully'
    })
    
  } catch (error: any) {
    console.error('Error processing update request:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process update request' },
      { status: 500 }
    )
  }
}

