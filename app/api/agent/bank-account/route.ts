import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * The agent's own bank account on file, read LIVE from Payload.
 *
 * requireAuth, not requirePermission: this is a self-service route where the
 * agent reads their own record, like the profile routes. The payment method id
 * comes from the session user, never from the body, so there is nothing to
 * target.
 *
 * Exists because the only other place in the app that shows these details is
 * the admin payout preview, which is gated on can_process_payouts and keyed to
 * a transaction row - unusable for an agent looking at their own fees page.
 *
 * Fields are the documented PaymentMethod object
 * (https://docs.payload.com/apis/object-reference/payment-methods/):
 * bank_name, bank_account.account_type, bank_account.account_number, status
 * ("active inactive declining"), type ("card bank_account").
 *
 * account_number is read only to take its last four, and never leaves this
 * function whole. routing_number is not read at all.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('id, bank_connected, bank_connected_at, payload_payment_method_id')
      .eq('id', auth.user.id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (!agent.bank_connected || !agent.payload_payment_method_id) {
      return NextResponse.json({ connected: false })
    }

    if (!process.env.PAYLOAD_SECRET_KEY) {
      // Connected per our own record, but the details cannot be fetched.
      return NextResponse.json({
        connected: true,
        detailsAvailable: false,
        connected_at: agent.bank_connected_at,
      })
    }

    const authHeader =
      'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

    let pm: any = null
    try {
      const res = await fetch(
        `https://api.payload.com/payment_methods/${agent.payload_payment_method_id}`,
        { headers: { Authorization: authHeader } }
      )
      if (res.status === 404) {
        return NextResponse.json({
          connected: true,
          detailsAvailable: false,
          missingAtPayload: true,
          connected_at: agent.bank_connected_at,
        })
      }
      if (!res.ok) {
        return NextResponse.json({
          connected: true,
          detailsAvailable: false,
          connected_at: agent.bank_connected_at,
        })
      }
      pm = await res.json().catch(() => null)
    } catch {
      return NextResponse.json({
        connected: true,
        detailsAvailable: false,
        connected_at: agent.bank_connected_at,
      })
    }

    // Masked on the server. Only the last four ever cross the network.
    const rawAccountNumber = String(pm?.bank_account?.account_number ?? '')
    const last4 = rawAccountNumber ? rawAccountNumber.slice(-4) : null

    return NextResponse.json({
      connected: true,
      detailsAvailable: true,
      connected_at: agent.bank_connected_at,
      bank_name: pm?.bank_name ?? null,
      account_type: pm?.bank_account?.account_type ?? null,
      account_last4: last4,
      account_holder: pm?.account_holder ?? null,
      status: pm?.status ?? null,
    })
  } catch (error: any) {
    console.error('agent bank-account error:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
