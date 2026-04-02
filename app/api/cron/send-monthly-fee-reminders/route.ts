import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)
const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
const feesUrl = `${appUrl}/agent/fees`

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const monthName = now.toLocaleString('default', { month: 'long' })
    const year = now.getFullYear()
    const monthlyFeeLabel = `${monthName} ${year} Monthly Brokerage Fee`

    // Get all active, non-waived agents with a Payload ID and email
    const { data: agents, error } = await supabaseAdmin
      .from('users')
      .select('id, preferred_first_name, first_name, office_email, email, payload_payee_id')
      .eq('status', 'active')
      .eq('monthly_fee_waived', false)
      .not('payload_payee_id', 'is', null)

    if (error) throw error
    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'No eligible agents', sent: 0 })
    }

    let sent = 0
    let skipped = 0
    const errors: string[] = []

    // Check each agent for an unpaid monthly fee invoice in parallel
    const checks = await Promise.all(
      agents.map(async agent => {
        try {
          const res = await fetch(
            `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&status=unpaid&limit=20`,
            { headers: { Authorization: plAuth() } }
          )
          if (!res.ok) return { agent, hasUnpaid: false }
          const data = await res.json()
          const hasUnpaid = (data.values || []).some((inv: any) =>
            inv.items?.some(
              (item: any) =>
                item.type === 'Monthly Fee' && inv.description?.includes(monthlyFeeLabel)
            )
          )
          return { agent, hasUnpaid }
        } catch {
          return { agent, hasUnpaid: false }
        }
      })
    )

    // Send reminder emails to agents with unpaid invoices
    for (const { agent, hasUnpaid } of checks) {
      if (!hasUnpaid) {
        skipped++
        continue
      }

      const toEmail = agent.office_email || agent.email
      if (!toEmail) {
        errors.push(`${agent.preferred_first_name || agent.first_name}: no email address`)
        continue
      }

      const firstName = agent.preferred_first_name || agent.first_name || 'Agent'

      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: toEmail,
          subject: `Action Required: ${monthName} Monthly Fee Due Today`,
          html: getEmailLayout(
            `<p>Hi ${firstName},</p>
             <p>Your <strong>${monthName} ${year} monthly brokerage fee of $50</strong> is due today. Please pay now to avoid a <strong>$25 late fee</strong>, which will be applied tomorrow.</p>
             <p style="text-align: center; margin: 24px 0;">
               <a href="${feesUrl}" style="display: inline-block; padding: 12px 28px; background-color: #C5A278; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">Pay Now</a>
             </p>
             <p style="font-size: 13px; color: #888888;">You can view your invoice and pay securely through your agent portal at the link above. Questions? Reply to this email.</p>`,
            {
              title: 'Monthly Fee Due Today',
              subtitle: `${monthName} ${year}`,
              preheader: `Your ${monthName} brokerage fee of $50 is due today. Pay now to avoid a late fee.`,
            }
          ),
        })
        sent++
      } catch (err: any) {
        errors.push(`${firstName}: ${err.message}`)
      }
    }

    console.log(`Monthly fee reminders: ${sent} sent, ${skipped} skipped, ${errors.length} errors`)
    return NextResponse.json({
      success: true,
      sent,
      skipped,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Monthly fee reminder cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}