import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_landlords')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const supabase = createClient()

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
        'sent_to[0][name]': `${landlord.first_name} ${landlord.last_name}`,
        'sent_to[0][email]': landlord.email,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Payload activation creation failed:', data)
      return NextResponse.json(
        { error: data.message || 'Failed to create bank activation' },
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

    // TODO: Send email to landlord with activation URL (data.url)
    // For now, return the URL so admin can share it manually
    console.log(`Bank activation URL for ${landlord.email}: ${data.url}`)

    return NextResponse.json({
      success: true,
      activation_id: data.id,
      activation_url: data.url,
    })
  } catch (error: any) {
    console.error('Error creating bank activation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}