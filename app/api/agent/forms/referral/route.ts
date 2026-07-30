import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ADMIN_ROLES, COMPANY, RoleName } from '@/lib/constants'
import { createAgentFolder, uploadAgentDocument } from '@/lib/microsoft-graph'
import { getEmailLayout } from '@/lib/email/layout'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <notifications@coachingbrokeragetools.com>'

const REFERRAL_TYPE_LABELS: Record<string, string> = {
  sale: 'Sale',
  lease: 'Lease',
  apartment: 'Apartment',
}

// POST /api/agent/forms/referral
// Logs a Referral Collective referral submitted by the signed-in agent and,
// when a referral agreement is attached, files it in the agent's OneDrive
// folder. requireAuth (not requirePermission) because every authenticated
// agent may submit their own referral, the same way they submit their own
// transaction forms.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  // Referral Collective agents, plus staff so the office can submit or test on
  // their behalf. Matches the middleware guard on /agent/referrals so the page
  // and the route agree. ADMIN_ROLES is the same list middleware uses.
  const role = (auth.user.role || '').toLowerCase()
  if (role !== 'referral' && !ADMIN_ROLES.includes(role as RoleName)) {
    return NextResponse.json(
      { error: 'This form is for Referral Collective agents only' },
      { status: 403 }
    )
  }

  const now = new Date().toISOString()

  try {
    const form = await request.formData()

    const closing_side = String(form.get('closing_side') || '').trim()
    const closing_brokerage = String(form.get('closing_brokerage') || '').trim()
    const closing_contact_name = String(form.get('closing_contact_name') || '').trim()
    const closing_contact_email = String(form.get('closing_contact_email') || '').trim()
    const lead_name = String(form.get('lead_name') || '').trim()
    const lead_email = String(form.get('lead_email') || '').trim()
    const lead_phone = String(form.get('lead_phone') || '').trim()
    const referral_type = String(form.get('referral_type') || '').trim()
    const fee_terms = String(form.get('fee_terms') || '').trim()
    const notes = String(form.get('notes') || '').trim()
    const agreementFile = form.get('agreement') as File | null

    // ── Validation ───────────────────────────────────────────────────────────
    if (!lead_name) {
      return NextResponse.json({ error: 'Lead name is required' }, { status: 400 })
    }
    if (closing_side !== 'crc' && closing_side !== 'external') {
      return NextResponse.json({ error: 'Please choose who is closing this deal' }, { status: 400 })
    }
    if (closing_side === 'external' && !closing_brokerage) {
      return NextResponse.json(
        { error: 'Closing brokerage is required when an outside brokerage is closing' },
        { status: 400 }
      )
    }
    if (referral_type && !REFERRAL_TYPE_LABELS[referral_type]) {
      return NextResponse.json({ error: 'Invalid referral type' }, { status: 400 })
    }

    // ── Referrer comes from the session, never from the request body ─────────
    const { data: referrer, error: referrerErr } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, email, onedrive_folder_url')
      .eq('id', auth.user.id)
      .single()

    if (referrerErr || !referrer) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const referrerName = `${referrer.preferred_first_name || referrer.first_name} ${referrer.last_name}`.trim()

    // ── Log the submission ───────────────────────────────────────────────────
    // The row is written BEFORE the upload. If the upload then fails, the
    // referral still exists with a null agreement URL, which the office can
    // chase. The reverse order would leave a file in OneDrive with no record.
    const { data: submission, error: insertErr } = await supabaseAdmin
      .from('referral_submissions')
      .insert({
        branch: 'rc',
        referrer_user_id: referrer.id,
        referrer_name: referrerName,
        referrer_email: referrer.email,
        closing_side,
        closing_brokerage: closing_side === 'external' ? closing_brokerage || null : null,
        closing_contact_name: closing_side === 'external' ? closing_contact_name || null : null,
        closing_contact_email: closing_side === 'external' ? closing_contact_email || null : null,
        lead_name,
        lead_email: lead_email || null,
        lead_phone: lead_phone || null,
        referral_type: referral_type || null,
        fee_terms: fee_terms || null,
        notes: notes || null,
        status: 'pending',
        updated_at: now,
      })
      .select('id')
      .single()

    if (insertErr || !submission) {
      console.error('referral_submissions insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save referral' }, { status: 500 })
    }

    // ── Optional referral agreement upload ───────────────────────────────────
    // Filed in the agent's existing OneDrive folder, the same place their
    // signed agreements live. A failed upload does not lose the referral.
    let agreementUrl: string | null = null
    let agreementFileName: string | null = null
    let uploadError = ''

    if (agreementFile && agreementFile.size > 0) {
      try {
        // createAgentFolder is the single source of truth for the folder path.
        // Rebuilding it here by hand drifts (it strips '#', a hand-rolled copy
        // may not), so reuse what it returns and only rebuild when the folder
        // already exists.
        let folderPath: string
        if (!referrer.onedrive_folder_url) {
          const created = await createAgentFolder(
            referrer.first_name,
            referrer.last_name,
            referrer.id
          )
          folderPath = created.folderPath
          await supabaseAdmin
            .from('users')
            .update({ onedrive_folder_url: created.sharingUrl })
            .eq('id', referrer.id)
        } else {
          // Same formula and same character class as createAgentFolder.
          const sanitizedName = `${referrer.first_name} ${referrer.last_name}`.replace(
            /[/\\?%*:|"<>#]/g,
            '-'
          )
          folderPath = `Agent Documents/${sanitizedName}-${referrer.id}`
        }

        const safeLead = lead_name.replace(/[/\\?%*:|"<>#]/g, '-')
        const extension = agreementFile.name.includes('.')
          ? agreementFile.name.slice(agreementFile.name.lastIndexOf('.'))
          : ''
        const storedName = `Referral Agreement - ${safeLead} - ${now.slice(0, 10)}${extension}`

        const fileBuffer = Buffer.from(await agreementFile.arrayBuffer())
        const { fileUrl } = await uploadAgentDocument(folderPath, storedName, fileBuffer)
        agreementUrl = fileUrl
        agreementFileName = storedName

        await supabaseAdmin
          .from('referral_submissions')
          .update({
            agreement_document_url: agreementUrl,
            agreement_file_name: agreementFileName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', submission.id)
      } catch (err: any) {
        uploadError = err?.message || 'Upload failed'
        console.error('Referral agreement upload failed:', uploadError)
      }
    }

    // ── Notify the office ────────────────────────────────────────────────────
    // Resend, because office@collectiverealtyco.com is an internal CRC mailbox
    // with the Resend sending domain allowlisted.
    try {
      const row = (label: string, value: string) =>
        value
          ? `<p style="margin:0 0 6px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${label}:</strong> ${value}</p>`
          : ''

      const content = `
        <p style="margin:0 0 16px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${referrerName}</strong> submitted a Referral Collective referral.</p>
        <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
          ${row('Lead', lead_name)}
          ${row('Lead Email', lead_email)}
          ${row('Lead Phone', lead_phone)}
          ${row('Type', REFERRAL_TYPE_LABELS[referral_type] || '')}
        </div>
        <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
          ${row('Closing Side', closing_side === 'crc' ? 'Collective Realty Co. agent' : 'Outside brokerage')}
          ${row('Closing Brokerage', closing_brokerage)}
          ${row('Broker Contact', closing_contact_name)}
          ${row('Broker Contact Email', closing_contact_email)}
          ${row('Fee Terms', fee_terms)}
        </div>
        ${notes ? `<div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">${row('Notes', notes)}</div>` : ''}
        <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
          ${
            agreementUrl
              ? `<p style="margin:0;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">Referral Agreement:</strong> <a href="${agreementUrl}" style="color:#1a1a1a;">${agreementFileName}</a></p>`
              : uploadError
                ? `<p style="margin:0;font-size:14px;color:#A32D2D;">Referral agreement upload failed: ${uploadError}</p>`
                : `<p style="margin:0;font-size:14px;color:#555;">No referral agreement attached yet.</p>`
          }
        </div>`

      await resend.emails.send({
        from: FROM_EMAIL,
        to: [COMPANY.EMAIL_OFFICE],
        subject: `New Referral Collective Referral - ${lead_name}`,
        html: getEmailLayout(content, { title: 'New Referral Submitted' }),
      })
    } catch (err) {
      console.error('Failed to notify office of referral:', err)
    }

    return NextResponse.json({
      success: true,
      id: submission.id,
      agreement_uploaded: !!agreementUrl,
      upload_error: uploadError || null,
      message: agreementUrl
        ? 'Your referral was submitted and the agreement was saved to your documents folder.'
        : uploadError
          ? 'Your referral was submitted, but the agreement could not be uploaded. The office will follow up.'
          : 'Your referral was submitted. Send the signed agreement when you have it.',
    })
  } catch (error: any) {
    console.error('Referral submission error:', error)
    return NextResponse.json({ error: error.message || 'Failed to submit referral' }, { status: 500 })
  }
}
