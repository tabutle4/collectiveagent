import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { pmAdminMessageEmail, pmTenantReplyEmail } from '@/lib/email/pm-layout'

const resend = new Resend(process.env.RESEND_API_KEY)

// Resend inbound email webhook
// Receives emails sent to repair+{repair_id}@coachingbrokeragetools.com
export async function POST(request: NextRequest) {
  const supabase = createClient()
  
  try {
    const body = await request.json()
    
    // Resend inbound webhook payload structure
    const { from, to, subject, text } = body

    console.log('Received inbound email:', { from, to, subject })

    // Extract repair_id from the "to" address
    // Format: repair+{repair_id}@coachingbrokeragetools.com
    const toAddress = Array.isArray(to) ? to[0] : to
    const match = toAddress?.match(/repair\+([a-f0-9-]+)@/i)
    
    if (!match) {
      console.log('No repair ID found in to address:', toAddress)
      return NextResponse.json({ success: false, error: 'Invalid recipient' }, { status: 400 })
    }

    const repairId = match[1]

    // Fetch the repair request with tenant info
    const { data: repair, error: fetchError } = await supabase
      .from('repair_requests')
      .select('*, tenants(first_name, last_name, email), managed_properties(property_address)')
      .eq('id', repairId)
      .single()

    if (fetchError || !repair) {
      console.error('Repair not found:', repairId)
      return NextResponse.json({ success: false, error: 'Repair not found' }, { status: 404 })
    }

    // Parse sender info
    const fromEmail = typeof from === 'string' ? from : from?.address || ''
    const fromName = typeof from === 'string' ? fromEmail.split('@')[0] : from?.name || 'Unknown'
    
    // Determine sender type - check if sender is the tenant
    let senderType: 'tenant' | 'admin' = 'admin'
    let senderName = fromName
    
    if (repair.tenants?.email && fromEmail.toLowerCase() === repair.tenants.email.toLowerCase()) {
      senderType = 'tenant'
      senderName = `${repair.tenants.first_name} ${repair.tenants.last_name}`
    } else {
      senderName = 'CRC Property Management'
    }
    
    // Clean up the message text - remove quoted reply content
    let cleanText = text || ''
    
    // Remove common reply markers and everything after
    const replyMarkers = [
      /On .+ wrote:/i,
      /From:.+\n/i,
      /-----Original Message-----/i,
      /_{5,}/,
      /^>.+$/gm,
    ]
    
    for (const marker of replyMarkers) {
      const idx = cleanText.search(marker)
      if (idx > 0) {
        cleanText = cleanText.substring(0, idx)
      }
    }
    
    // Remove lines starting with >
    cleanText = cleanText.split('\n').filter((line: string) => !line.trim().startsWith('>')).join('\n')
    cleanText = cleanText.trim()

    if (!cleanText) {
      console.log('Empty message body after cleaning')
      return NextResponse.json({ success: false, error: 'Empty message' }, { status: 400 })
    }

    // Create new message object
    const newMessage = {
      id: crypto.randomUUID(),
      sender_type: senderType,
      sender_name: senderName,
      message: cleanText,
      created_at: new Date().toISOString()
    }

    // Get existing messages and append
    const existingMessages = repair.messages || []
    const updatedMessages = [...existingMessages, newMessage]

    // Update the repair request with new message
    const { error: updateError } = await supabase
      .from('repair_requests')
      .update({ 
        messages: updatedMessages,
        updated_at: new Date().toISOString()
      })
      .eq('id', repairId)

    if (updateError) {
      console.error('Failed to save message:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to save message' }, { status: 500 })
    }

    const propertyAddress = repair.managed_properties?.property_address || 'Property'

    // Send appropriate notification based on sender type
    if (senderType === 'admin' && repair.tenants?.email) {
      // Admin replied via email - notify tenant
      const tenant = repair.tenants
      
      try {
        await resend.emails.send({
          from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
          to: tenant.email,
          replyTo: `repair+${repairId}@coachingbrokeragetools.com`,
          subject: `Re: Repair Request - ${propertyAddress}`,
          html: pmAdminMessageEmail(tenant.first_name, propertyAddress, cleanText)
        })
      } catch (emailErr) {
        console.error('Failed to send tenant notification:', emailErr)
      }
    } else if (senderType === 'tenant') {
      // Tenant replied via email - notify admin
      const { data: settings } = await supabase
        .from('company_settings')
        .select('pm_notification_email')
        .single()
      
      const pmNotificationEmail = settings?.pm_notification_email || 'office@collectiverealtyco.com'
      
      try {
        await resend.emails.send({
          from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
          to: 'pm@coachingbrokeragetools.com',
          cc: pmNotificationEmail,
          replyTo: `repair+${repairId}@coachingbrokeragetools.com`,
          subject: `Tenant Reply: ${repair.title} - ${propertyAddress}`,
          html: pmTenantReplyEmail(senderName, propertyAddress, repair.title, cleanText, repairId)
        })
      } catch (emailErr) {
        console.error('Failed to send admin notification:', emailErr)
      }
    }

    console.log('Message saved successfully:', newMessage.id)
    return NextResponse.json({ success: true, message_id: newMessage.id })

  } catch (error) {
    console.error('Email webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
