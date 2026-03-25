import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = await createClient()

    // Get landlord
    const { data: landlord, error: fetchError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email, payload_activation_id, bank_status')
      .eq('id', id)
      .single()

    if (fetchError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
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
        'intent[entity_type]': 'individual',
        'send_to[0][name]': `${landlord.first_name} ${landlord.last_name}`,
        'send_to[0][email]': landlord.email,
      }),
    })

    // 204 = success, Payload sent email directly (no body)
    // 200/201 = success with body
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      console.error('Payload activation creation failed:', errorData)
      return NextResponse.json(
        { error: errorData.message || 'Failed to create bank activation' },
        { status: 500 }
      )
    }

    // Parse body only if there is one
    let activationId = null
    let activationUrl = null
    
    if (res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      activationId = data.id
      activationUrl = data.url
    }

    // Update landlord with activation ID and status
    await supabase
      .from('landlords')
      .update({
        payload_activation_id: activationId,
        bank_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', landlord.id)

    console.log(`Bank activation email sent to ${landlord.email} by Payload`)

    return NextResponse.json({
      success: true,
      message: 'Bank activation email sent to landlord',
      activation_id: activationId,
      activation_url: activationUrl, // Will be null when Payload sends email directly
    })
  } catch (error: any) {
    console.error('Error creating bank activation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}