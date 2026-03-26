import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// POST - Create W9 form request (portal-accessible)
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
      return NextResponse.json({ error: 'Only landlords can request W9' }, { status: 403 })
    }

    const landlordId = session.user_id

    // Get landlord
    const { data: landlord, error: fetchError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email, w9_status, track1099_form_request_id')
      .eq('id', landlordId)
      .single()

    if (fetchError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    // Check if W9 already completed
    if (landlord.w9_status === 'completed') {
      return NextResponse.json({ error: 'W9 already completed' }, { status: 400 })
    }

    // Check if Track1099 API key is configured
    const track1099ApiKey = process.env.TRACK1099_API_KEY
    if (!track1099ApiKey) {
      // Fallback: direct them to contact PM
      return NextResponse.json({ 
        error: 'W9 service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true
      }, { status: 503 })
    }

    // Create form request via Track1099 API
    const res = await fetch('https://api.track1099.com/api/v2/form_requests', {
      method: 'POST',
      headers: {
        'X-Api-Key': track1099ApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        form_type: 'w9',
        reference_id: landlord.id,
        recipient_email: landlord.email,
        recipient_name: `${landlord.first_name} ${landlord.last_name}`,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Track1099 form request failed:', data)
      return NextResponse.json(
        { error: 'Failed to create W9 request. Please try again or contact support.' },
        { status: 500 }
      )
    }

    // Update landlord with form request ID
    await supabase
      .from('landlords')
      .update({
        track1099_reference_id: landlord.id,
        track1099_form_request_id: data.id,
        w9_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    console.log(`W9 form request created for ${landlord.email}: ${data.id}`)

    return NextResponse.json({
      success: true,
      form_url: data.url,
    })
  } catch (error: any) {
    console.error('Error creating W9 form request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}