import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email/send'
import { pmStatementReadyEmail } from '@/lib/email/pm-layout'

// POST /api/pm/statements/[id]/send
//
// Emails the landlord a notification that their statement is ready,
// with a link to the portal view of the statement. Uses the existing
// PM email layout (matches all other PM emails). Office is BCC'd per
// the PM module convention.
//
// Body: { } (no body needed - statement id is in URL)
//
// Side effect: updates statement.sent_at + sent_to_email on success.
//
// Resend sender: uses the verified @coachingbrokeragetools.com sending
// domain (same as other transactional emails). Reply-to is
// pm@collectiverealtyco.com so landlord responses land in the right inbox.

const FROM_PM = 'CRC Property Management <pm@coachingbrokeragetools.com>'
const REPLY_TO_PM = 'pm@collectiverealtyco.com'
const BCC_OFFICE = 'office@collectiverealtyco.com'

const monthName = (m: number | null): string =>
  m ? new Date(2000, m - 1).toLocaleString('default', { month: 'long' }) : ''

const periodLabel = (s: any): string => {
  if (s.period_type === 'annual') return `${s.period_year}`
  return `${monthName(s.period_month)} ${s.period_year}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id } = await params

    // Load statement + landlord + property
    const { data: statement, error: stErr } = await supabaseAdmin
      .from('pm_statements')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, unit)
      `)
      .eq('id', id)
      .single()

    if (stErr || !statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    }

    const landlord = statement.landlords
    const property = statement.managed_properties

    if (!landlord?.email) {
      return NextResponse.json({ error: 'Landlord has no email on file' }, { status: 400 })
    }

    const period = periodLabel(statement)
    const propertyAddr = property
      ? `${property.property_address}${property.unit ? ` ${property.unit}` : ''}`
      : 'your property'

    // Generate a permanent access token for this statement so the landlord
    // can view it without needing an active portal session.
    const crypto = await import('crypto')
    const accessToken = crypto.randomBytes(32).toString('hex')

    await supabaseAdmin
      .from('pm_statements')
      .update({ access_token: accessToken, updated_at: new Date().toISOString() })
      .eq('id', id)

    // Statement URL includes token so landlord can view without login
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'
    const statementUrl = `${baseUrl}/pm/statement/${statement.id}?token=${accessToken}`

    const html = pmStatementReadyEmail(
      landlord.first_name || 'there',
      propertyAddr,
      period,
      Number(statement.total_net_disbursed || 0),
      statementUrl
    )

    const result = await sendEmail({
      to: landlord.email,
      from: FROM_PM,
      replyTo: REPLY_TO_PM,
      bcc: BCC_OFFICE,
      subject: `Your ${period} Property Management Statement`,
      html,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 })
    }

    // Stamp sent_at + sent_to_email
    const { error: updErr } = await supabaseAdmin
      .from('pm_statements')
      .update({
        sent_at: new Date().toISOString(),
        sent_to_email: landlord.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) {
      // Email already went out so don't fail the request, just log
      console.error('Statement sent but failed to stamp sent_at:', updErr)
    }

    return NextResponse.json({
      success: true,
      emailId: result.emailId,
      sentTo: landlord.email,
    })
  } catch (err: any) {
    console.error('Statement send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
