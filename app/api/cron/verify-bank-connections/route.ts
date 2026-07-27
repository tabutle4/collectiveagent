import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// GET /api/cron/verify-bank-connections
//
// The app's bank_connected flag is set once by the Payload webhook when an
// agent completes their bank activation, and nothing ever re-checks it.
// Payload sends no webhook when a payment method later disappears (customer
// deleted, method removed in the dashboard), so the app can claim an agent
// is connected when Payload disagrees - discovered when a duplicate customer
// cleanup deleted a bank connection while the billing page kept showing
// "connected". This cron closes that gap: verify every connected agent's
// payment method against the live Payload API daily, self-heal the flags on
// any that are gone, and alert the office so a dead connection is found by
// email, not by a bounced payout.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: agents } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, payload_payment_method_id')
      .eq('bank_connected', true)
      .eq('status', 'active')

    const lost: { name: string; email: string; reason: string }[] = []
    const unverifiable: { name: string; email: string }[] = []
    let verified = 0

    for (const agent of agents || []) {
      const name = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
      const email = agent.office_email || agent.email || ''

      // Connected before payload_payment_method_id existed: nothing to check
      // against. Report so the office can re-link at their own pace, but do
      // NOT flip the flag - the connection may be fine.
      if (!agent.payload_payment_method_id) {
        unverifiable.push({ name, email })
        continue
      }

      let gone = false
      let reason = ''
      try {
        const res = await fetch(
          `https://api.payload.com/payment_methods/${agent.payload_payment_method_id}`,
          { headers: { Authorization: plAuth() } }
        )
        if (res.status === 404) {
          gone = true
          reason = 'payment method no longer exists in Payload'
        } else if (res.ok) {
          // Per Payload's PaymentMethod reference, status is read-only with
          // exactly three values: active, inactive, declining. Only inactive
          // means the method is not available for use; declining means it is
          // still connected but experiencing processing issues, so it is
          // counted verified here (flagging it would reset a live connection).
          const pm = await res.json().catch(() => null)
          const status = String(pm?.status || '').toLowerCase()
          if (status === 'inactive') {
            gone = true
            reason = 'payment method status is inactive in Payload'
          } else {
            verified++
          }
        } else {
          // Payload error (5xx, auth): do not flip flags on a flaky response.
          console.error('verify-bank-connections: Payload lookup failed', res.status, 'for', email)
        }
      } catch (err) {
        console.error('verify-bank-connections: Payload call threw for', email, err)
      }

      if (gone) {
        await supabaseAdmin
          .from('users')
          .update({
            bank_connected: false,
            bank_connected_at: null,
            payload_activation_id: null,
            payload_payment_method_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id)
        lost.push({ name, email, reason })
      }
    }

    // Direction 2: agents the app thinks are NOT connected, but who have a
    // linked Payload account. If Payload shows an active bank account on
    // their customer, the app's flag is stale in the optimistic direction -
    // the flag is only ever set by the webhook on activations the app
    // created, so agents who connected before that flow existed (or whose
    // completion webhook was missed) show as unconnected forever. Fix the
    // flag and store the payment method id so direction 1 can verify it
    // from now on. Filtering by attribute equality on list endpoints is the
    // API's standard pattern (same as the invoice queries used elsewhere);
    // results are re-filtered here defensively in case a filter is ignored.
    const recovered: { name: string; email: string }[] = []
    const { data: unconnected } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, payload_payee_id')
      .eq('status', 'active')
      .not('payload_payee_id', 'is', null)
      .or('bank_connected.is.null,bank_connected.eq.false')

    for (const agent of unconnected || []) {
      const name = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
      const email = agent.office_email || agent.email || ''
      try {
        const res = await fetch(
          `https://api.payload.com/payment_methods?customer_id=${agent.payload_payee_id}&type=bank_account&status=active&limit=10`,
          { headers: { Authorization: plAuth() } }
        )
        if (!res.ok) continue
        const data = await res.json().catch(() => null)
        const methods = (data?.values || []).filter(
          (pm: any) =>
            String(pm?.type || '') === 'bank_account' &&
            String(pm?.status || '').toLowerCase() === 'active'
        )
        if (methods.length > 0) {
          await supabaseAdmin
            .from('users')
            .update({
              bank_connected: true,
              bank_connected_at: new Date().toISOString(),
              payload_payment_method_id: methods[0].id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', agent.id)
          recovered.push({ name, email })
        }
      } catch (err) {
        console.error('verify-bank-connections: reverse sweep threw for', email, err)
      }
    }

    // Alert the office when a connection was lost. Internal ops alert:
    // Resend + getEmailLayout, per the app's email system rules.
    if (lost.length > 0) {
      const rows = lost
        .map(l => `<tr><td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${l.name}</td><td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${l.email}</td><td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">${l.reason}</td></tr>`)
        .join('')
      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: 'office@collectiverealtyco.com',
          subject: `Bank connection lost for ${lost.length} agent${lost.length === 1 ? '' : 's'}`,
          html: getEmailLayout(
            `<p>The daily Payload verification found ${lost.length} agent${lost.length === 1 ? '' : 's'} whose bank connection no longer exists in Payload. Their status has been reset to not connected.</p>
             <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
               <tr><th style="text-align: left; padding: 6px 12px;">Agent</th><th style="text-align: left; padding: 6px 12px;">Email</th><th style="text-align: left; padding: 6px 12px;">Reason</th></tr>
               ${rows}
             </table>
             <p>To restore payouts by direct deposit, open each agent's profile and use <strong>Send Bank Activation</strong>. They will receive the standard connect email.</p>`,
            {
              title: 'Bank Connections Need Attention',
              subtitle: 'Daily Payload Verification',
              preheader: `${lost.length} agent bank connection${lost.length === 1 ? '' : 's'} no longer valid in Payload.`,
            }
          ),
        })
      } catch (emailErr) {
        console.error('verify-bank-connections: alert email failed', emailErr)
      }
    }

    return NextResponse.json({
      checked: (agents || []).length,
      verified,
      lost: lost.length,
      recovered: recovered.length,
      unverifiable: unverifiable.length,
      lost_agents: lost,
      recovered_agents: recovered,
      unverifiable_agents: unverifiable,
    })
  } catch (error: any) {
    console.error('verify-bank-connections error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
