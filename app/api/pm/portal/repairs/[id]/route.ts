import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

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

  return { session }
}

// GET - Get single repair with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validatePMSession(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { session } = auth
  const { id } = await params

  const supabase = createClient()

  // Build query based on user type
  let query = supabase
    .from('repair_requests')
    .select(`
      *,
      managed_properties (
        property_address,
        unit,
        city,
        state
      )
    `)
    .eq('id', id)

  // Ensure user can only see their own repairs
  if (session.user_type === 'tenant') {
    query = query.eq('tenant_id', session.user_id)
  } else if (session.user_type === 'landlord') {
    query = query.eq('landlord_id', session.user_id)
  }

  const { data: repair, error } = await query.single()

  if (error || !repair) {
    return NextResponse.json({ error: 'Repair not found' }, { status: 404 })
  }

  return NextResponse.json({ repair })
}

// POST - Add message to repair
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validatePMSession(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { session } = auth
  const { id } = await params

  try {
    const supabase = createClient()
    const body = await request.json()
    const { message } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get the repair and verify ownership
    let query = supabase
      .from('repair_requests')
      .select('id, messages, tenant_id, landlord_id')
      .eq('id', id)

    if (session.user_type === 'tenant') {
      query = query.eq('tenant_id', session.user_id)
    } else if (session.user_type === 'landlord') {
      query = query.eq('landlord_id', session.user_id)
    }

    const { data: repair, error: fetchError } = await query.single()

    if (fetchError || !repair) {
      return NextResponse.json({ error: 'Repair not found' }, { status: 404 })
    }

    // Get sender name
    let senderName = 'User'
    if (session.user_type === 'tenant') {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('first_name, last_name')
        .eq('id', session.user_id)
        .single()
      if (tenant) senderName = `${tenant.first_name} ${tenant.last_name}`
    } else if (session.user_type === 'landlord') {
      const { data: landlord } = await supabase
        .from('landlords')
        .select('first_name, last_name')
        .eq('id', session.user_id)
        .single()
      if (landlord) senderName = `${landlord.first_name} ${landlord.last_name}`
    }

    // Add new message
    const existingMessages = repair.messages || []
    const newMessage = {
      id: crypto.randomUUID(),
      sender_type: session.user_type,
      sender_name: senderName,
      message: message.trim(),
      created_at: new Date().toISOString()
    }

    const { data: updated, error: updateError } = await supabase
      .from('repair_requests')
      .update({
        messages: [...existingMessages, newMessage],
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error adding message:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ repair: updated, message: newMessage, success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}