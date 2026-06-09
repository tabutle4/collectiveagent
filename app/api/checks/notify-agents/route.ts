import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { getEmailLayout, emailSection, emailSignature } from '@/lib/email/layout'

const REPLY_TO = 'transactions@collectiverealtyco.com'

const ROLE_LABELS: Record<string, string> = {
  primary_agent:    'Primary Agent',
  listing_agent:    'Listing Agent',
  co_agent:         'Co-Agent',
  team_lead:        'Team Lead',
  referral_agent:   'Referral Agent',
  momentum_partner: 'Momentum Partner',
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    // Fetch sender's office_email to use as the From UPN
    const { data: senderUser } = await supabase
      .from('users')
      .select('first_name, last_name, preferred_first_name, preferred_last_name, office_email, email')
      .eq('id', auth.user.id)
      .single()

    // Fetch CC email from TC settings (default_reply_to = tcandcompliance@collectiverealtyco.com)
    const { data: tcSettings } = await supabase
      .from('tc_settings')
      .select('default_reply_to')
      .limit(1)
      .maybeSingle()
    const ccEmail: string | undefined = tcSettings?.default_reply_to || undefined

    const fromUpn = senderUser?.office_email || senderUser?.email || 'tarab@collectiverealtyco.com'
    const senderFirst = senderUser?.preferred_first_name || senderUser?.first_name || 'Tara'
    const senderLast  = senderUser?.preferred_last_name  || senderUser?.last_name  || 'Butler'
    const senderName  = `${senderFirst} ${senderLast}`.trim()

    // Fetch sender's saved email signature HTML (stored when they last saved in the signature generator)
    const { data: sigRow } = await supabase
      .from('email_signatures')
      .select('html_content')
      .eq('user_id', auth.user.id)
      .not('html_content', 'is', null)
      .limit(1)
      .maybeSingle()
    const savedSignatureHtml = sigRow?.html_content || null


    const { check_id, intro, next_steps, tia_ids } = await request.json()
    if (!check_id) {
      return NextResponse.json({ error: 'check_id required' }, { status: 400 })
    }

    // Fetch check
    const { data: check, error: checkError } = await supabase
      .from('checks_received')
      .select(`
        id, property_address, check_amount, check_image_url,
        received_date, cleared_date, transaction_id
      `)
      .eq('id', check_id)
      .single()

    if (checkError || !check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 })
    }

    if (!check.transaction_id) {
      return NextResponse.json({ error: 'Check is not linked to a transaction' }, { status: 400 })
    }

    // Fetch transaction address as fallback
    const { data: txn } = await supabase
      .from('transactions')
      .select('property_address')
      .eq('id', check.transaction_id)
      .single()

    // Fetch all TIAs with user data
    const { data: tias, error: tiaError } = await supabase
      .from('transaction_internal_agents')
      .select(`
        id, agent_role, agent_net,
        users!transaction_internal_agents_agent_id_fkey (
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          office_email, email
        )
      `)
      .eq('transaction_id', check.transaction_id)

    if (tiaError) throw tiaError
    if (!tias || tias.length === 0) {
      return NextResponse.json({ error: 'No agents on this transaction' }, { status: 400 })
    }

    const address = check.property_address || txn?.property_address || 'your transaction'
    const clearDate = check.cleared_date ? fmtDate(check.cleared_date) : null

    const results: { agent: string; email: string; status: 'sent' | 'failed'; error?: string }[] = []

    const filteredTias = tia_ids && tia_ids.length > 0
      ? tias.filter((t: any) => tia_ids.includes(t.id))
      : tias

    for (const tia of filteredTias) {
      const u = (tia as any).users
      if (!u) continue

      const agentEmail = u.office_email || u.email
      if (!agentEmail) continue

      const firstName = u.preferred_first_name || u.first_name || 'Agent'
      const fullName  = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim()
      const roleLabel = ROLE_LABELS[(tia as any).agent_role] || (tia as any).agent_role || 'Agent'

      const subject = `Check Received - ${address} - ${fullName}`

      const clearSentence = clearDate
        ? `<p>The check is expected to clear on <strong>${clearDate}</strong>.</p>`
        : ''

      const photoLink = check.check_image_url
        ? `<p style="margin:12px 0;"><a href="${check.check_image_url}" style="color:#C5A278;">View Check Photo</a></p>`
        : ''

      const introText = intro || `A check has been received for ${address}. Your commission is being processed.`
      const nextStepsText = next_steps || 'Commission payments are processed within 10-14 business days from receiving completed compliance and check. This often happens faster, but the guarantee per your agent agreement is 30 days.'

      const body = `
        <p class="email-greeting">Hi ${firstName},</p>
        <p>${introText}</p>
        <p style="font-size:13px;color:#888;margin:4px 0 16px 0;">Your role: <strong>${roleLabel}</strong></p>
        ${clearSentence}
        ${photoLink}
        ${emailSection('What Happens Next', `<p>${nextStepsText}</p>`)}
        <p style="margin:12px 0;"><a href="https://visit.collectiverealtyco.com/compliance" style="color:#C5A278;">View Compliance Process</a></p>
        ${savedSignatureHtml
          ? `<div style="margin-top:24px;">${savedSignatureHtml}</div>`
          : emailSignature(senderName, 'Operations Officer', fromUpn)}
      `

      const html = getEmailLayout(body, {
        title: 'Check Received',
        subtitle: address,
        preheader: `Your check for ${address} is being processed`,
      })

      try {
        await sendMailAs({
          fromUpn: fromUpn,
          to: agentEmail,
          replyTo: REPLY_TO,
          cc: ccEmail,
          subject,
          html,
        })
        results.push({ agent: fullName, email: agentEmail, status: 'sent' })
      } catch (err: any) {
        results.push({ agent: fullName, email: agentEmail, status: 'failed', error: err.message })
      }
    }

    const sent   = results.filter(r => r.status === 'sent').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({ success: true, sent, failed, results })
  } catch (err: any) {
    console.error('Notify agents error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
