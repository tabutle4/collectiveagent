import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST - Create bank activation (portal-accessible)
// Validates via PM session cookie - landlord can only request for themselves
export async function POST(request: NextRequest) {
  try {
    // Validate PM session
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('pm_session')?.value
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createClient()

    // Verify session
    const { data: session } = await supabase
      .from('pm_sessions')
      .select('user_id, user_type, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    if (session.user_type !== 'landlord') {
      return NextResponse.json({ error: 'Only landlords can connect bank' }, { status: 403 })
    }

    const landlordId = session.user_id

    // Get landlord
    const { data: landlord, error: fetchError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email, bank_status, payload_activation_id')
      .eq('id', landlordId)
      .single()

    if (fetchError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    // Check if bank already connected
    if (landlord.bank_status === 'connected') {
      return NextResponse.json({ error: 'Bank account already connected' }, { status: 400 })
    }

    // Check if Payload is configured
    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json({ 
        error: 'Payment service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true
      }, { status: 503 })
    }

    // Create Payload payout activation
    const res = await fetch('https://api.payload.com/payment_activations/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'intent[entity_name]': 'Collective Realty Co.',
        'intent[purpose]': 'Receive rent disbursements',
        'intent[type]': 'bank_account',
        'send_to[0][name]': `${landlord.first_name} ${landlord.last_name}`,
        'send_to[0][email]': landlord.email,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Payload activation creation failed:', data)
      return NextResponse.json(
        { error: 'Failed to create bank activation. Please try again or contact support.' },
        { status: 500 }
      )
    }

    // Update landlord with activation ID and status
    await supabase
      .from('landlords')
      .update({
        payload_activation_id: data.id,
        bank_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    console.log(`Bank activation created for ${landlord.email}: ${data.url}`)

    return NextResponse.json({
      success: true,
      activation_url: data.url,
    })
  } catch (error: any) {
    console.error('Error creating bank activation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}