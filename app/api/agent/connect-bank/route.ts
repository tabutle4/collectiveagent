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
    // Only one optional flag is read off the body; the agent still cannot
    // target anyone but themselves.
    const body = await request.json().catch(() => ({} as any))

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, bank_connected, payload_activation_id, payload_payee_id')
      .eq('id', agentId)
      .single()

    if (fetchError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // A connected agent may replace the bank on file, but only deliberately:
    // this sends Payload's activation email, so an accidental second click
    // must not fire one. The fees page asks for confirmation and then sends
    // replace: true.
    const replace = body?.replace === true
    if (agent.bank_connected && !replace) {
      return NextResponse.json(
        {
          error:
            'A bank account is already connected. Use Change bank account if you need to replace it.',
          alreadyConnected: true,
        },
        { status: 400 }
      )
    }

    // An activation is already outstanding for this agent, so do not create a
    // second one. The webhook matches the agent by payload_activation_id, and
    // creating another activation overwrites it - which orphans the first
    // email, because completing that older link would then never mark the
    // agent connected. The admin twin
    // (/api/admin/agents/[id]/send-bank-activation) has always refused this
    // for the same reason; the agent route did not, and the Change bank
    // account flow made it reachable twice in a row.
    //
    // Deliberately scoped to agents with no live connection. A connected agent
    // still carries the activation id from the time they first connected, so
    // testing that column alone would block every legitimate first replace.
    //
    // 409 rather than 200: the fees page treats any non-2xx as a failure and
    // shows `error`, which is right here because nothing was sent. A 200 would
    // make it announce an activation email that does not exist.
    if (agent.payload_activation_id && !agent.bank_connected) {
      return NextResponse.json(
        {
          error:
            'A bank connection request is already waiting in your email. Follow that link to finish connecting, or contact office@collectiverealtyco.com if you cannot find it.',
          pendingActivation: true,
        },
        { status: 409 }
      )
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

    // Refuse to persist a null activation id. The webhook matches the agent by
    // payload_activation_id, so writing null would leave them permanently
    // unmatchable while this route reported success. The admin twin
    // (/api/admin/agents/[id]/send-bank-activation) already guards this; the
    // agent route did not.
    if (!activationId) {
      console.error('Payload returned no activation id for agent', agent.id)
      return NextResponse.json(
        {
          error:
            'The bank connection could not be started. Please contact office@collectiverealtyco.com',
        },
        { status: 502 }
      )
    }

    await supabaseAdmin
      .from('users')
      .update({
        payload_activation_id: activationId,
        // Replacing a bank: drop the old connection now so nothing pays the
        // account being replaced while the new activation is outstanding. The
        // webhook sets these again when the agent completes it.
        ...(replace
          ? {
              bank_connected: false,
              payload_payment_method_id: null,
            }
          : {}),
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
