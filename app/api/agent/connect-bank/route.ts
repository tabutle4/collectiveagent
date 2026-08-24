import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'
import { syncPayloadCustomerEmail } from '@/lib/payload/syncCustomerEmail'

export const dynamic = 'force-dynamic'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST - Create Payload bank activation for agent
// Authenticated by agent session. Agent can only connect their own bank.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const agentId = auth.user.id

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, bank_connected, payload_activation_id, payload_payee_id')
      .eq('id', agentId)
      .single()

    if (fetchError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.bank_connected) {
      return NextResponse.json({ error: 'Bank account already connected' }, { status: 400 })
    }

    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json({
        error: 'Payment service not configured. Please contact office@collectiverealtyco.com',
        fallback: true,
      }, { status: 503 })
    }

    // Keep the linked Payload billing customer pointed at the email this
    // activation is sent to, so it carries a current address.
    //
    // This does NOT stop Payload creating a second customer. Payload's bank
    // activation flow creates a new customer as a matter of course and lets
    // the person type any email they like on it: Tara connected her own bank
    // and watched Payload create a separate customer carrying the same email
    // she had entered. So matching the email is not a de-duplication
    // mechanism, and an earlier version of this comment saying it prevented
    // duplicate customers was wrong. users.payload_payout_customer_id is what
    // keeps a bank connection attached to the right customer. See
    // lib/payload/syncCustomerEmail.ts.
    await syncPayloadCustomerEmail(agent.payload_payee_id, agent.email)

    const res = await fetch('https://api.payload.com/payment_activations/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'intent[entity_name]': 'Collective Realty Co.',
        'intent[purpose]': 'Receive commission disbursements',
        'intent[type]': 'bank_account',
        'intent[entity_type]': 'individual',
        'send_to[0][name]': `${agent.first_name} ${agent.last_name}`,
        'send_to[0][email]': agent.email,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      console.error('Payload activation creation failed:', errorData)
      return NextResponse.json(
        { error: 'Failed to create bank activation. Please try again or contact office@collectiverealtyco.com.' },
        { status: 500 }
      )
    }

    let activationId = null
    if (res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      activationId = data.id
    }

    await supabaseAdmin
      .from('users')
      .update({
        payload_activation_id: activationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id)

    console.log(`Bank activation created for agent ${agent.email}`)

    return NextResponse.json({
      success: true,
      message: 'Bank activation email sent to your email address',
    })
  } catch (error: any) {
    console.error('Agent connect-bank error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
