import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST - Handle landlord bank activation webhook from Payload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    console.log('PM landlord activation webhook received:', type, data?.id)

    const supabase = createClient()

    // Bank account activation accepted
    if (type === 'payment_activation.accepted' && data?.id) {
      // Find landlord by activation ID
      const { data: landlord } = await supabase
        .from('landlords')
        .select('id, email')
        .eq('payload_activation_id', data.id)
        .single()

      if (!landlord) {
        console.log('No landlord found for activation:', data.id)
        return NextResponse.json({ received: true })
      }

      // Update landlord with payment method and connected status
      await supabase
        .from('landlords')
        .update({
          payload_payment_method_id: data.payment_method_id,
          bank_status: 'connected',
          bank_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', landlord.id)

      console.log('Landlord bank connected:', landlord.email)

      // Check if landlord can be activated (W9 + bank both complete)
      const { data: updatedLandlord } = await supabase
        .from('landlords')
        .select('w9_status, bank_status, status')
        .eq('id', landlord.id)
        .single()

      if (
        updatedLandlord &&
        updatedLandlord.w9_status === 'completed' &&
        updatedLandlord.bank_status === 'connected' &&
        updatedLandlord.status === 'onboarding'
      ) {
        // Activate landlord
        await supabase
          .from('landlords')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', landlord.id)

        console.log('Landlord activated:', landlord.email)
      }
    }

    // Bank account activation failed/declined
    if (type === 'payment_activation.declined' && data?.id) {
      const { data: landlord } = await supabase
        .from('landlords')
        .select('id, email')
        .eq('payload_activation_id', data.id)
        .single()

      if (landlord) {
        await supabase
          .from('landlords')
          .update({
            bank_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', landlord.id)

        console.log('Landlord bank activation failed:', landlord.email)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('PM landlord activation webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
