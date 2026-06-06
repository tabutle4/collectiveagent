import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST - Handle payment_activation:status webhook from Payload
// Trigger format: { trigger: 'payment_activation:status', triggered_on: { id, object, value } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { trigger, triggered_on } = body

    console.log('PM landlord activation webhook received:', trigger, triggered_on?.id, triggered_on?.value)

    if (trigger !== 'payment_activation:status' || !triggered_on?.id) {
      return NextResponse.json({ received: true })
    }

    const activationId = triggered_on.id
    const status = triggered_on.value // 'requested', 'submitted', 'accepted', 'declined'

    // Find landlord by activation ID
    const { data: landlord } = await supabaseAdmin
      .from('landlords')
      .select('id, email, w9_status, status')
      .eq('payload_activation_id', activationId)
      .single()

    if (!landlord) {
      console.log('No landlord found for activation:', activationId)
      return NextResponse.json({ received: true })
    }

    if (status === 'accepted') {
      // Fetch the full activation to get payment_method_id
      const res = await fetch(`https://api.payload.com/payment_activations/${activationId}`, {
        headers: {
          Authorization: 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64'),
        },
      })
      const activation = res.ok ? await res.json() : null
      const paymentMethodId = activation?.payment_method_id || null

      await supabaseAdmin
        .from('landlords')
        .update({
          payload_payment_method_id: paymentMethodId,
          bank_status: 'connected',
          bank_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', landlord.id)

      console.log('Landlord bank connected:', landlord.email)

      // Activate landlord if W-9 also complete
      if (landlord.w9_status === 'completed' && landlord.status === 'onboarding') {
        await supabaseAdmin
          .from('landlords')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', landlord.id)
        console.log('Landlord activated:', landlord.email)
      }
    }

    if (status === 'declined') {
      await supabaseAdmin
        .from('landlords')
        .update({ bank_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', landlord.id)
      console.log('Landlord bank activation declined:', landlord.email)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('PM landlord activation webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
