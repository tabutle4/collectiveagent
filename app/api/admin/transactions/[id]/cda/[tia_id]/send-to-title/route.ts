import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { loadCdaData, titleContactEmail } from '@/lib/documents/cdaData'
import { buildCdaPdf, cdaPdfFilename } from '@/lib/documents/buildCdaPdf'

export const dynamic = 'force-dynamic'

const REPLY_TO = 'transactions@collectiverealtyco.com'

function firstNameOf(name: string | null | undefined): string {
  if (!name) return 'there'
  const t = name.trim().split(/\s+/)[0]
  return t || 'there'
}

function defaultSubject(propertyAddr: string): string {
  return `CDA and Wire Request for ${propertyAddr}`
}

function defaultBody(firstName: string): string {
  return [
    `Hello ${firstName},`,
    ``,
    `Please see the attached CDA for the subject referenced property. I have also attached commission wiring instructions for the office commission.`,
    ``,
    `Let us know if anything further is required.`,
    ``,
    `Thank you,`,
  ].join('\n')
}

// Compliance form notification recipients — the list configured in the
// compliance settings, NOT hardcoded. CC'd on every title send.
async function complianceNotificationEmails(): Promise<string[]> {
  const { data: form } = await supabaseAdmin
    .from('forms')
    .select('notification_emails')
    .eq('linked_form_type', 'compliance_cda')
    .maybeSingle()
  return (form?.notification_emails || []).filter(Boolean)
}

// GET — preview context for the "Send to title" screen.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tia_id: string }> }
) {
  const auth = await requirePermission(request, 'can_generate_cda')
  if (auth.error) return auth.error

  try {
    const { id, tia_id } = await params
    const res = await loadCdaData(id, tia_id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    const { model } = res

    const to = titleContactEmail(model.titleContact)
    const cc = await complianceNotificationEmails()

    // Is the firm-wide wiring instructions form uploaded?
    const { data: wiringDoc } = await supabaseAdmin
      .from('company_documents')
      .select('filename')
      .eq('doc_key', 'wiring_instructions')
      .maybeSingle()
    const wiringReady = !!wiringDoc?.filename

    // The person, never the business. Addressing the title_company row's name
    // blindly greets "Hello Stewart," when that field holds Stewart Title.
    const firstName = firstNameOf(model.titleParty.repName)

    return NextResponse.json({
      to,
      title_company: model.titleParty.companyName,
      title_rep_name: model.titleParty.repName,
      cc,
      wiring_ready: wiringReady,
      wiring_filename: wiringDoc?.filename || null,
      cda_approved: model.txn.cda_status === 'approved' || model.txn.cda_status === 'sent',
      property_address: model.propertyAddr,
      default_subject: defaultSubject(model.propertyAddr),
      default_body: defaultBody(firstName),
    })
  } catch (err: any) {
    console.error('send-to-title GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — send the CDA + wiring instructions to the title officer, from the
// logged-in user's mailbox via Graph (so it clears title's spam filters and
// carries their signature), CC the compliance notification list.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tia_id: string }> }
) {
  const auth = await requirePermission(request, 'can_generate_cda')
  if (auth.error) return auth.error

  try {
    const { id, tia_id } = await params
    const body = await request.json().catch(() => ({}))
    const subjectIn: string | undefined = body?.subject
    const bodyIn: string | undefined = body?.body

    const res = await loadCdaData(id, tia_id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    const { model } = res

    // Gate: a CDA must be broker-approved before it goes to title.
    if (model.txn.cda_status !== 'approved' && model.txn.cda_status !== 'sent') {
      return NextResponse.json(
        { error: 'This CDA must be approved before it can be sent to title.' },
        { status: 400 }
      )
    }

    // Recipient — resolved server-side from the deal's Title Company contact.
    const to = titleContactEmail(model.titleContact)
    if (!to) {
      return NextResponse.json(
        { error: 'No Title Company contact with an email on this transaction. Add one under Contacts first.' },
        { status: 400 }
      )
    }
    const cc = await complianceNotificationEmails()

    // Wiring instructions — the firm-wide form, stored as base64 in company_documents.
    const { data: wiringDoc } = await supabaseAdmin
      .from('company_documents')
      .select('content, filename, mime')
      .eq('doc_key', 'wiring_instructions')
      .maybeSingle()
    if (!wiringDoc?.content) {
      return NextResponse.json(
        { error: 'No commission wiring instructions uploaded yet. Upload it in Settings before sending to title.' },
        { status: 400 }
      )
    }

    // Sender mailbox + saved signature (same source as the check-received email).
    const { data: senderUser } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name, preferred_first_name, preferred_last_name, office_email, email')
      .eq('id', auth.user.id)
      .single()
    const fromUpn = senderUser?.office_email || senderUser?.email
    if (!fromUpn) {
      return NextResponse.json({ error: 'Your account has no office email to send from.' }, { status: 400 })
    }
    const { data: sigRow } = await supabaseAdmin
      .from('email_signatures')
      .select('html_content')
      .eq('user_id', auth.user.id)
      .not('html_content', 'is', null)
      .limit(1)
      .maybeSingle()
    const signatureHtml = sigRow?.html_content || null

    // Compose. Subject/body come from the preview (editable); fall back to the
    // template if the client sent nothing.
    // The person, never the business. Addressing the title_company row's name
    // blindly greets "Hello Stewart," when that field holds Stewart Title.
    const firstName = firstNameOf(model.titleParty.repName)
    const subject = (subjectIn && subjectIn.trim()) || defaultSubject(model.propertyAddr)
    const bodyText = (bodyIn && bodyIn.trim()) || defaultBody(firstName)
    const bodyHtml = bodyText
      .split('\n')
      .map(line => line.trim() === '' ? '<div style="height:10px"></div>' : `<div>${escapeHtml(line)}</div>`)
      .join('')
    // The CDA note, in the email as well as on the attached document.
    //
    // Appended HERE, server-side at send time, and deliberately NOT pre-filled
    // into the editable Message box: the box is populated when the page loads,
    // so a note edited afterwards would leave the email carrying the old text
    // while the attached PDF carried the new one. Built from model.notes, the
    // same value buildCdaPdf renders, so the two cannot disagree.
    //
    // Split into one div per line rather than using white-space:pre-wrap. That
    // is the convention bodyHtml above already uses, and Outlook renders mail
    // through the Word engine, which does not support pre-wrap - a multi-line
    // note would collapse into one run for exactly the recipient this email is
    // written for. Escaped with the same helper the body uses.
    const notesHtml = model.notes
      ? `<div style="margin-top:20px;border-left:3px solid #C5A278;padding:8px 14px">`
        + `<div style="font-weight:600;color:#333;margin-bottom:6px;font-size:13px">Note on the CDA</div>`
        + `<div style="font-size:13px;color:#555">`
        + model.notes
            .split('\n')
            .map(line => line.trim() === '' ? '<div style="height:8px"></div>' : `<div>${escapeHtml(line)}</div>`)
            .join('')
        + `</div></div>`
      : ''

    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#333;line-height:1.5">${bodyHtml}${notesHtml}${
      signatureHtml ? `<div style="margin-top:24px">${signatureHtml}</div>` : ''
    }</div>`

    // Build the CDA PDF from the shared model.
    const cdaBytes = await buildCdaPdf(model)

    await sendMailAs({
      fromUpn,
      to,
      cc: cc.length > 0 ? cc : undefined,
      replyTo: REPLY_TO,
      subject,
      html,
      attachments: [
        { filename: cdaPdfFilename(model.propertyAddr), contentType: 'application/pdf', content: cdaBytes },
        {
          filename: wiringDoc.filename || 'Commission Wiring Instructions.pdf',
          contentType: wiringDoc.mime || 'application/pdf',
          content: Buffer.from(String(wiringDoc.content), 'base64'),
        },
      ],
    })

    return NextResponse.json({ success: true, sent_to: to, cc })
  } catch (err: any) {
    console.error('send-to-title POST error:', err)
    return NextResponse.json({ error: err.message || 'Failed to send to title' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
