import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { getEmailLayout, emailSignature } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)
const BROKER_ID = '7d99cfe9-db1e-42db-aa2a-7a42a68765f6'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

const today = new Date().toISOString().split('T')[0]

function isOverdue(inv: any): boolean {
  if (Number(inv.amount_due ?? 0) <= 0) return false
  const d = inv?.due_date
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return true
  return d.slice(0, 10) < today
}

async function getOverdueCount(payeeId: string, descriptionFilter: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${payeeId}&limit=50`,
      { headers: { Authorization: authHeader() } }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const invoices: any[] = data.values || []
    const monthly = invoices.filter((inv: any) =>
      typeof inv?.description === 'string' &&
      inv.description.toLowerCase().includes(descriptionFilter)
    )
    return monthly.filter(isOverdue).length
  } catch {
    return 0
  }
}

function buildAgentEmail(firstName: string, passcode: string, zoomLink: string): string {
  const content = `
    <p class="email-greeting">Hi ${firstName},</p>
    <p style="font-size:14px;color:#555555;margin:0 0 16px;">Your Zoom passcode for coaching access is below. This passcode is valid for the current month only. A new passcode will be sent at the start of each month.</p>
    <div class="email-section">
      <h3>Your passcode</h3>
      <p style="font-size:28px;font-weight:700;letter-spacing:0.15em;color:#1A1A1A;text-align:center;padding:12px 0 4px;">${passcode}</p>
    </div>
    <div class="email-section">
      <h3>How to join</h3>
      <p>Zoom link: <a href="https://${zoomLink}" style="color:#C5A278;">${zoomLink}</a></p>
      <p>Enter your passcode when prompted.</p>
    </div>
    <p style="font-size:13px;color:#888888;margin:16px 0 0;">To continue receiving monthly access, your brokerage account must be in good financial standing. Agents with unpaid fees from prior months will not receive next month's passcode.</p>
    ${emailSignature('Courtney Okanlomo', 'Broker | Owner | Coach', 'info@collectiverealtyco.com')}
  `
  return getEmailLayout(content, {
    title: 'Coaching Access',
    preheader: 'Your Zoom passcode for this month',
  })
}

function buildClientEmail(firstName: string, passcode: string, clientZoomLink: string, settings: any): string {
  const brandName = settings?.coaching_brokerage_name || 'The Coaching Brokerage'
  const brandEmail = settings?.coaching_brokerage_email || 'info@coachingbrokerage.com'
  const brandAddress = settings?.coaching_brokerage_address || '2300 Valley View Ln, Ste 518, Irving, TX 75062'
  const brandWebsite = settings?.coaching_brokerage_website || 'coachingbrokerage.com'

  const accentColor = '#1A1A1A'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your Zoom passcode for this month</span>
  <style>
    body, p, h1, h2, h3, h4 { margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #555555; background-color: #F9F9F9; }
    .email-section { background-color: #F9F9F9; border-left: 3px solid ${accentColor}; padding: 14px 18px; margin: 16px 0; }
    .email-section h3 { font-size: 11px; font-weight: 600; color: #1A1A1A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .email-section p { font-size: 13px; color: #555555; margin: 0 0 6px; }
    .email-section p:last-child { margin: 0; }
    a { color: ${accentColor}; }
  </style>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#555555;margin:0;padding:0;background-color:#F9F9F9;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#ffffff;padding:20px;text-align:center;border-radius:8px 8px 0 0;border-bottom:3px solid ${accentColor};border:1px solid #E5E5E5;border-bottom:3px solid ${accentColor};">
      <h1 style="margin:0;font-size:16px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#1A1A1A;">Coaching Access</h1>
    </div>
    <div style="background:#ffffff;padding:30px 24px;border:1px solid #E5E5E5;border-top:none;">
      <p style="font-size:14px;color:#1A1A1A;margin:0 0 16px;">Hi ${firstName},</p>
      <p style="font-size:14px;color:#555555;margin:0 0 16px;">Your Zoom passcode for this month's coaching sessions is below. This passcode is valid for the current month only.</p>
      <div class="email-section">
        <h3>Your passcode</h3>
        <p style="font-size:28px;font-weight:700;letter-spacing:0.15em;color:#1A1A1A;text-align:center;padding:12px 0 4px;">${passcode}</p>
      </div>
      <div class="email-section">
        <h3>How to join</h3>
        <p>Zoom link: <a href="https://${clientZoomLink}">${clientZoomLink}</a></p>
        <p>Enter your passcode when prompted.</p>
      </div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E5E5;font-size:12px;color:#888888;line-height:1.7;">
        Best regards,<br>
        <strong style="color:#1A1A1A;">Courtney Okanlomo</strong><br>
        Broker | Owner | Coach<br>
        ${brandName}<br>
        <a href="mailto:${brandEmail}" style="color:${accentColor};">${brandEmail}</a>
      </div>
    </div>
    <div style="padding:14px 24px;border:1px solid #E5E5E5;border-top:none;border-radius:0 0 8px 8px;background:#ffffff;text-align:center;">
      <p style="margin:0;font-size:11px;color:#888888;">${brandName} | ${brandAddress}</p>
      <p style="margin:4px 0 0;font-size:11px;color:#888888;"><a href="https://${brandWebsite}" style="color:${accentColor};text-decoration:none;">${brandWebsite}</a></p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_agents')
  if (auth.error) return auth.error

  const { passcode } = await req.json()
  if (!passcode?.trim()) return NextResponse.json({ error: 'Passcode required' }, { status: 400 })

  // Get settings
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('coaching_zoom_link, coaching_client_zoom_link, coaching_brokerage_name, coaching_brokerage_email, coaching_brokerage_address, coaching_brokerage_website')
    .single()

  const zoomLink = settings?.coaching_zoom_link || 'visit.collectiverealtyco.com/training'
  const clientZoomLink = settings?.coaching_client_zoom_link || 'convert.coachingbrokerage.com/zoom'

  // Get eligible agents
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, email, payload_payee_id, is_coaching_client, is_licensed_agent, is_active')
    .eq('is_active', true)
    .neq('id', BROKER_ID)

  if (!users) return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })

  const licensedAgents = users.filter(u => u.is_licensed_agent === true && !u.is_coaching_client)
  const coachingClients = users.filter(u => u.is_coaching_client === true)

  // Determine eligible agents (overdue_count === 0)
  const eligibleAgents: typeof licensedAgents = []
  await Promise.all(licensedAgents.map(async u => {
    const overdue = u.payload_payee_id
      ? await getOverdueCount(u.payload_payee_id, 'monthly brokerage fee')
      : 0
    if (overdue === 0) eligibleAgents.push(u)
  }))

  // Determine eligible coaching clients
  const eligibleClients: typeof coachingClients = []
  await Promise.all(coachingClients.map(async u => {
    const overdue = u.payload_payee_id
      ? await getOverdueCount(u.payload_payee_id, 'monthly')
      : 0
    if (overdue === 0) eligibleClients.push(u)
  }))

  const errors: string[] = []
  let sent = 0

  // Send agent emails
  await Promise.all(eligibleAgents.map(async u => {
    try {
      await resend.emails.send({
        from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
        to: u.email,
        replyTo: 'info@collectiverealtyco.com',
        subject: `Your Coaching Passcode for ${new Date().toLocaleString('default', { month: 'long' })}`,
        html: buildAgentEmail(u.first_name, passcode, zoomLink),
        bcc: 'office@collectiverealtyco.com',
      })
      sent++
    } catch (e: any) {
      errors.push(`${u.email}: ${e.message}`)
    }
  }))

  // Send coaching client emails
  await Promise.all(eligibleClients.map(async u => {
    try {
      await resend.emails.send({
        from: 'The Coaching Brokerage <notifications@coachingbrokeragetools.com>',
        to: u.email,
        replyTo: settings?.coaching_brokerage_email || 'info@coachingbrokerage.com',
        subject: `Your Coaching Passcode for ${new Date().toLocaleString('default', { month: 'long' })}`,
        html: buildClientEmail(u.first_name, passcode, clientZoomLink, settings),
      })
      sent++
    } catch (e: any) {
      errors.push(`${u.email}: ${e.message}`)
    }
  }))

  return NextResponse.json({
    ok: true,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  })
}
