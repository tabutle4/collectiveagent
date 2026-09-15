import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * The agent's own autopay setting, read from and written to Payload live.
 *
 * requireAuth, not requirePermission: this is self-service on the agent's own
 * record, the same shape as /api/agent/bank-account. The Payload customer comes
 * from the session user and the payment method is resolved from that customer,
 * so no id is ever accepted from the body and there is nothing to target.
 *
 * Autopay in Payload is two separate things, and the split is deliberate:
 *
 *   - The AGENT decides whether their saved card is the billing default, which
 *     is this route. Payload's `default_payment_method` flag is what makes a
 *     card eligible to be charged without the agent present.
 *     https://docs.payload.com/apis/automatic-payments/
 *
 *   - The BROKERAGE decides which invoices autopay may touch, which is the
 *     `autopay_allowed` flag written at invoice creation. Monthly fees are
 *     eligible; onboarding and custom invoices are not.
 *
 * So turning this on never means "charge me for anything you like".
 *
 * Cards only. A saved bank account would settle over several days, and the
 * late fee cron runs the morning after the due date, so an agent on ACH autopay
 * would collect a late fee on a payment that was already in flight.
 *
 * PaymentMethod fields are the documented object:
 * https://docs.payload.com/apis/object-reference/payment-methods/
 * `default_payment_method` is writable on update; `keep_active` is readonly on
 * update, which is why a card can only be saved at checkout and not here.
 * List filtering by attribute is documented at
 * https://docs.payload.com/apis/api-design/
 */

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

type PayloadMethod = {
  id: string
  type?: string
  status?: string
  keep_active?: boolean
  default_payment_method?: boolean
  // Card details are nested, exactly as bank details are on the bank_account
  // sub-object that /api/agent/bank-account reads. Reading card_brand or
  // card_number at the top level returns undefined every time.
  card?: {
    card_brand?: string
    card_number?: string
    expiry?: string
  }
}

async function listSavedMethods(customerId: string): Promise<PayloadMethod[] | null> {
  const res = await fetch(
    `https://api.payload.com/payment_methods/?customer_id=${encodeURIComponent(customerId)}&limit=50&fields[]=*&fields[]=card`,
    { headers: { Authorization: authHeader() } }
  )
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return (data?.values || []) as PayloadMethod[]
}

// A card the agent chose to save at checkout, still usable. keep_active is only
// absent on older records, so an explicit false is what disqualifies a method
// rather than a missing field.
const isUsableCard = (pm: PayloadMethod) =>
  pm?.type === 'card' &&
  pm?.keep_active !== false &&
  String(pm?.status || 'active').toLowerCase() === 'active'

async function setDefault(methodId: string, value: boolean): Promise<boolean> {
  const res = await fetch(`https://api.payload.com/payment_methods/${methodId}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ default_payment_method: value ? 'true' : 'false' }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    console.error('Payload default_payment_method update failed:', methodId, value, detail)
  }
  return res.ok
}

async function resolveCustomer(userId: string) {
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('id, payload_payee_id')
    .eq('id', userId)
    .single()
  return agent?.payload_payee_id ? String(agent.payload_payee_id) : null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json({ available: false, enabled: false, detailsAvailable: false })
    }

    const customerId = await resolveCustomer(auth.user.id)
    if (!customerId) {
      return NextResponse.json({ available: false, enabled: false })
    }

    const methods = await listSavedMethods(customerId)
    if (methods === null) {
      return NextResponse.json({ available: false, enabled: false, detailsAvailable: false })
    }

    const cards = methods.filter(isUsableCard)
    const active = cards.find((pm) => pm.default_payment_method === true) || cards[0] || null
    // Read across EVERY method, not just cards. Turning autopay off clears the
    // flag on every method the customer has, so if it were computed from cards
    // alone an agent whose saved bank carries the flag would be shown "Off"
    // while Payload was still debiting them, with no control that clears it.
    const enabled = methods.some((pm) => pm.default_payment_method === true)

    // A saved bank account is deliberately not offered for autopay, but the
    // agent should be told that rather than shown an empty card.
    const savedBankOnly =
      cards.length === 0 &&
      methods.some((pm) => pm?.type === 'bank_account' && pm?.keep_active !== false)

    const rawNumber = String(active?.card?.card_number ?? '')

    return NextResponse.json({
      available: cards.length > 0,
      enabled,
      detailsAvailable: true,
      savedBankOnly,
      card_brand: active?.card?.card_brand ?? null,
      card_last4: rawNumber ? rawNumber.slice(-4) : null,
      expiry: active?.card?.expiry ?? null,
    })
  } catch (error: any) {
    console.error('agent autopay GET error:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { enabled } = (await request.json()) as { enabled?: unknown }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
    }

    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Autopay is unavailable right now. Please contact office@collectiverealtyco.com.' },
        { status: 503 }
      )
    }

    const customerId = await resolveCustomer(auth.user.id)
    if (!customerId) {
      return NextResponse.json(
        { error: 'Your billing account is not set up yet. Please contact office@collectiverealtyco.com.' },
        { status: 400 }
      )
    }

    const methods = await listSavedMethods(customerId)
    if (methods === null) {
      return NextResponse.json(
        { error: 'We could not reach our payment provider. Please try again shortly.' },
        { status: 502 }
      )
    }

    if (enabled) {
      const card = methods.find(isUsableCard)
      if (!card) {
        return NextResponse.json(
          {
            error:
              'You do not have a saved card yet. Pay an invoice below and tick "save this payment method" to set one up.',
          },
          { status: 400 }
        )
      }
      const ok = await setDefault(card.id, true)
      if (!ok) {
        return NextResponse.json(
          { error: 'We could not turn autopay on. Please try again shortly.' },
          { status: 502 }
        )
      }
      return NextResponse.json({ success: true, enabled: true })
    }

    // Turning it off clears the flag on every method that carries it, not just
    // the card this page happens to show, so a stale default from an older
    // saved method cannot keep charging the agent.
    const defaults = methods.filter((pm) => pm?.default_payment_method === true)
    const results = await Promise.all(defaults.map((pm) => setDefault(pm.id, false)))
    if (results.some((ok) => !ok)) {
      return NextResponse.json(
        { error: 'We could not turn autopay off. Please contact office@collectiverealtyco.com.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, enabled: false })
  } catch (error: any) {
    console.error('agent autopay PUT error:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
