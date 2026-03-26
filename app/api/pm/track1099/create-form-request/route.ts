import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// POST - Create W9 form request via Track1099 (admin route)
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = await createClient()
    const { landlord_id } = await request.json()

    if (!landlord_id) {
      return NextResponse.json({ error: 'Landlord ID is required' }, { status: 400 })
    }

    // Get landlord
    const { data: landlord, error: fetchError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email, track1099_form_request_id')
      .eq('id', landlord_id)
      .single()

    if (fetchError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    // Check if Track1099 API key is configured
    const track1099ApiKey = process.env.TRACK1099_API_KEY
    if (!track1099ApiKey) {
      return NextResponse.json(
        { error: 'Track1099 API key not configured' },
        { status: 500 }
      )
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
        { error: data.message || 'Failed to create W9 request' },
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
      form_request_id: data.id,
      form_url: data.url,
    })
  } catch (error: any) {
    console.error('Error creating W9 form request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}