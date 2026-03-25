import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { pmRepairSubmittedEmail } from '@/lib/email/pm-layout'

const resend = new Resend(process.env.RESEND_API_KEY)

// Validate PM session
async function validatePMSession(request: NextRequest) {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('pm_session')?.value

  if (!sessionToken) {
    return { error: 'Not authenticated', status: 401 }
  }

  const supabase = createClient()
  const { data: session, error } = await supabase
    .from('pm_sessions')
    .select('*')
    .eq('session_token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !session) {
    return { error: 'Invalid or expired session', status: 401 }
  }

  // Update last accessed
  await supabase
    .from('pm_sessions')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('session_token', sessionToken)

  return { session }
}

// GET - List repair requests for tenant
export async function GET(request: NextRequest) {
  const auth = await validatePMSession(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { session } = auth
  if (session.user_type !== 'tenant') {
    return NextResponse.json({ error: 'Tenant access only' }, { status: 403 })
  }

  const supabase = createClient()

  const { data: repairs, error } = await supabase
    .from('repair_requests')
    .select(`
      id,
      category,
      urgency,
      title,
      description,
      status,
      messages,
      created_at,
      updated_at,
      completed_at,
      managed_properties (
        property_address,
        unit,
        city,
        state
      )
    `)
    .eq('tenant_id', session.user_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching repairs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ repairs: repairs || [] })
}

// POST - Create new repair request
export async function POST(request: NextRequest) {
  const auth = await validatePMSession(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { session } = auth
  if (session.user_type !== 'tenant') {
    return NextResponse.json({ error: 'Tenant access only' }, { status: 403 })
  }

  try {
    const supabase = createClient()
    const body = await request.json()

    const { category, urgency, title, description, property_id, landlord_id, lease_id } = body

    if (!category || !title) {
      return NextResponse.json({ error: 'Category and title are required' }, { status: 400 })
    }

    // Get tenant info for initial message
    const { data: tenant } = await supabase
      .from('tenants')
      .select('first_name, last_name')
      .eq('id', session.user_id)
      .single()

    const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}` : 'Tenant'

    // Create initial message from the description
    const initialMessages = description ? [{
      id: crypto.randomUUID(),
      sender_type: 'tenant',
      sender_name: tenantName,
      message: description,
      created_at: new Date().toISOString()
    }] : []

    const { data: repair, error } = await supabase
      .from('repair_requests')
      .insert({
        property_id,
        tenant_id: session.user_id,
        landlord_id,
        lease_id,
        created_by_type: 'tenant',
        category,
        urgency: urgency || 'routine',
        title,
        description,
        messages: initialMessages,
        status: 'submitted',
        payment_status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating repair:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get property details and PM notification email for email
    const [propertyResult, settingsResult] = await Promise.all([
      supabase
        .from('managed_properties')
        .select('property_address, unit, city, state')
        .eq('id', property_id)
        .single(),
      supabase
        .from('company_settings')
        .select('pm_notification_email')
        .single()
    ])

    const property = propertyResult.data
    const pmNotificationEmail = settingsResult.data?.pm_notification_email || 'office@collectiverealtyco.com'

    const propertyAddress = property 
      ? `${property.property_address}${property.unit ? ` ${property.unit}` : ''}, ${property.city}, ${property.state}`
      : 'Unknown property'

    // Send notification email to PM team
    try {
      await resend.emails.send({
        from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
        to: 'pm@coachingbrokeragetools.com',
        cc: pmNotificationEmail,
        replyTo: `repair+${repair.id}@coachingbrokeragetools.com`,
        subject: `New Repair Request: ${title} - ${propertyAddress}`,
        html: pmRepairSubmittedEmail(tenantName, propertyAddress, title, description || '', urgency || 'routine', repair.id)
      })
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ repair, success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
