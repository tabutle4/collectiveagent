import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { syncPayloadCustomerEmail } from '@/lib/payload/syncCustomerEmail'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Branded heads-up email so the agent understands the Payload email.
// kind='new'      -> a fresh activation was just created (link is on its way)
// kind='reminder' -> an activation is already pending (nudge to complete it)
// Returns true if the email was accepted by Resend, false otherwise. Non-fatal.
async function sendHeadsUp(
  kind: 'new' | 'reminder',
  agent: { email: string; preferred_first_name: string | null; first_name: string | null }
): Promise<boolean> {
  const firstName = agent.preferred_first_name || agent.first_name || 'there'
  const feesUrl = `${appUrl}/agent/fees`
  const intro =
    kind === 'reminder'
      ? `<p>This is a reminder that your bank account is not connected yet. You should already have a <strong>secure email from Payload</strong>, our payment processor, with a link to connect your account for commission payouts. Please open that email and complete the steps. If you cannot find it, check your spam folder or reply here and we will resend it.</p>`
      : `<p>To pay your commissions by direct deposit (ACH), we need your bank account on file. You'll receive a <strong>separate email from Payload</strong>, our secure payment processor, with a link to connect your account. That email is legitimate, so please open it and follow the steps to enter your bank details securely.</p>
         <p>You can also connect your bank anytime from the <strong>Fees</strong> page in your agent portal:</p>
         <p style="text-align: center; margin: 24px 0;">
           <a href="${feesUrl}" style="display: inline-block; padding: 12px 28px; background-color: #C5A278; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">Go to My Fees Page</a>
         </p>`
  try {
    await resend.emails.send({
      from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
      to: agent.email,
      subject:
        kind === 'reminder'
          ? 'Reminder: Connect Your Bank Account for Commission Payouts'
          : 'Connect Your Bank Account for Commission Payouts',
      html: getEmailLayout(
        `<p>Hi ${firstName},</p>
         ${intro}
         <p style="font-size: 13px; color: #888888;">Your information is handled securely by Payload and is used only to send your commission payouts. Questions? Reply to this email or contact office@collectiverealtyco.com.</p>`,
        {
          title: 'Connect Your Bank Account',
          subtitle: 'Commission Payouts',
          preheader: "You'll receive a separate email from Payload to securely connect your bank for commission payouts.",
        }
      ),
    })
    return true
  } catch (emailErr: any) {
    console.error('Bank connect heads-up email failed:', emailErr?.message || emailErr)
    return false
  }
}

// POST - Admin creates a Payload bank activation for an agent, then sends the
// agent a branded heads-up email so they understand the separate Payload email
// they are about to receive. Mirrors the agent-initiated /api/agent/connect-bank
// flow and the PM /api/pm/landlords/[id]/send-bank-activation flow.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_process_payouts')
  if (auth.error) return auth.error

  try {
    const { id } = await params

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, email, status, bank_connected, payload_activation_id, payload_payee_id')
      .eq('id', id)
      .single()

    if (fetchError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.bank_connected) {
      return NextResponse.json({ error: 'Bank account already connected' }, { status: 400 })
    }

    // Guard against sending to inactive/terminated users or rows with no email.
    // (is_licensed_agent is intentionally NOT required — onboarding agents may
    // connect their bank before their license flag is set.)
    if (agent.status && agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 400 })
    }
    if (!agent.email) {
      return NextResponse.json({ error: 'Agent has no email address on file' }, { status: 400 })
    }

    // Idempotency guard. If a bank activation is already pending for this agent
    // (payload_activation_id set but not yet connected), do NOT create a second
    // Payload activation. Creating another would overwrite payload_activation_id
    // and orphan the first one — the webhook matches on that id, so completing
    // the older activation would never mark the agent connected. Instead, resend
    // the heads-up email as a reminder. This makes double-clicks, bulk re-runs,
    // and two admins acting at once safe.
    if (agent.payload_activation_id) {
      const emailSent = await sendHeadsUp('reminder', agent)
      return NextResponse.json({
        success: true,
        pending: true,
        message: emailSent
          ? 'A bank request is already pending for this agent. Sent them a reminder to complete it.'
          : 'A bank request is already pending for this agent. The reminder email could not be sent. Please check the agent email address.',
        email_sent: emailSent,
      })
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

    // Create Payload payout activation. Payload emails the agent the secure link.
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
        'send_to[0][name]': `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || 'Agent',
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

    // 204 = success, Payload sent its email directly (no body). 200/201 = body.
    let activationId = null
    if (res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      activationId = data.id
    }

    // Defensive: a 2xx that yields no activation id would write null and later
    // strand the agent (the webhook could not match). Don't persist a null over
    // a (possibly existing) id, and tell the admin rather than reporting success.
    if (!activationId) {
      console.error('Payload activation returned no id; not persisting null for agent', agent.email)
      return NextResponse.json(
        { error: 'Bank activation could not be confirmed with Payload. Please try again or contact office@collectiverealtyco.com.' },
        { status: 502 }
      )
    }

    await supabaseAdmin
      .from('users')
      .update({
        payload_activation_id: activationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id)

    console.log(`Bank activation created for agent ${agent.email} by ${auth.user.email}`)

    // Send the agent a branded heads-up email so the Payload email makes sense.
    // Non-fatal: the activation already succeeded, so an email failure only
    // affects the heads-up, not the ability to connect.
    const emailSent = await sendHeadsUp('new', agent)

    return NextResponse.json({
      success: true,
      message: emailSent
        ? 'Bank activation sent. The agent will receive a link from Payload plus a heads-up email.'
        : 'Bank activation sent via Payload. The heads-up email could not be sent. Please check the agent email address.',
      email_sent: emailSent,
    })
  } catch (error: any) {
    console.error('Admin send-bank-activation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
