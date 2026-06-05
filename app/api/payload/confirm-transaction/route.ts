import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// After the embedded checkout fires its success event, the client sends
// the campaign_token (for onboarding, unauthenticated) and transaction_id.
// We confirm the transaction with Payload and write onboarding_fee_paid directly
// so the broker co-sign page reflects it immediately without waiting for the webhook.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transaction_id, token } = body as { transaction_id: string; token?: string }

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Confirm with Payload
    const res = await fetch(`https://api.payload.com/transactions/${transaction_id}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ status: 'processed' }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload transaction confirm failed:', data)
      return NextResponse.json(
        { error: data.message || 'Failed to confirm transaction' },
        { status: 500 }
      )
    }

    // If a campaign_token was passed (onboarding flow), mark onboarding_fee_paid now.
    // The Payload webhook will also fire and is idempotent -- no harm in both running.
    if (token) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, onboarding_fee_paid')
        .eq('campaign_token', token)
        .single()

      if (user && !user.onboarding_fee_paid) {
        const paidDate = new Date().toISOString().split('T')[0]
        await supabaseAdmin
          .from('users')
          .update({ onboarding_fee_paid: true, onboarding_fee_paid_date: paidDate })
          .eq('id', user.id)
        console.log('Onboarding fee marked paid via confirm-transaction for user:', user.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error confirming transaction:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm transaction' },
      { status: 500 }
    )
  }
}
