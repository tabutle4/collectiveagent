import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST - Handle W9 completion webhook from Track1099
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('Track1099 webhook received:', body.event_type, body.reference_id)

    // Optionally verify webhook signature
    // const signature = request.headers.get('x-track1099-signature')
    // if (!verifySignature(body, signature)) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    // }

    const supabase = createClient()

    // W9 form completed
    if (body.event_type === 'form_request.completed') {
      const { reference_id, tin_match_status, signed_at, pdf_url } = body

      if (!reference_id) {
        console.log('No reference_id in webhook')
        return NextResponse.json({ received: true })
      }

      // Find landlord by reference ID (which is landlord.id)
      const { data: landlord } = await supabase
        .from('landlords')
        .select('id, email, bank_status, status')
        .eq('id', reference_id)
        .single()

      if (!landlord) {
        // Try finding by track1099_reference_id
        const { data: landlordByRef } = await supabase
          .from('landlords')
          .select('id, email, bank_status, status')
          .eq('track1099_reference_id', reference_id)
          .single()

        if (!landlordByRef) {
          console.log('No landlord found for reference:', reference_id)
          return NextResponse.json({ received: true })
        }
      }

      const targetLandlord = landlord || (await supabase
        .from('landlords')
        .select('id, email, bank_status, status')
        .eq('track1099_reference_id', reference_id)
        .single()).data

      if (!targetLandlord) {
        return NextResponse.json({ received: true })
      }

      // Update landlord W9 status
      await supabase
        .from('landlords')
        .update({
          w9_status: 'completed',
          w9_tin_match_status: tin_match_status || null,
          w9_signed_at: signed_at || new Date().toISOString(),
          w9_pdf_url: pdf_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetLandlord.id)

      console.log('W9 completed for landlord:', targetLandlord.email)

      // Check if landlord can be activated (W9 + bank both complete)
      if (
        targetLandlord.bank_status === 'connected' &&
        targetLandlord.status === 'onboarding'
      ) {
        await supabase
          .from('landlords')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetLandlord.id)

        console.log('Landlord activated:', targetLandlord.email)
      }
    }

    // W9 form failed
    if (body.event_type === 'form_request.failed') {
      const { reference_id } = body

      if (reference_id) {
        await supabase
          .from('landlords')
          .update({
            w9_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .or(`id.eq.${reference_id},track1099_reference_id.eq.${reference_id}`)

        console.log('W9 failed for reference:', reference_id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Track1099 webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
