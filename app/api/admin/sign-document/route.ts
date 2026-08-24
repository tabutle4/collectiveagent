import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { generateAgreementPDF, AuditTrailEntry } from '@/lib/documents/generate-pdf'
import { getICAContent, extractICAOverridesFromUser } from '@/lib/documents/ica-content'
import { getReferralICAContent } from '@/lib/documents/referral-ica-content'
import { getReferralSettings } from '@/lib/documents/settings-helpers'
import { getCommissionPlanContent, getCommissionPlanKey, extractOverridesFromUser } from '@/lib/documents/commission-plan-content'
import { syncPayloadCustomerEmail } from '@/lib/payload/syncCustomerEmail'
import { getStandardPlanDefaults } from '@/lib/documents/plan-defaults'
import { uploadAgentDocument, createM365User } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { sendW9TrecReadyEmail } from '@/lib/email'
import fs from 'fs'
import path from 'path'

const resend = new Resend(process.env.RESEND_API_KEY)

const plAuth = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Cancel active Payload billing schedules for a customer
async function cancelPayloadSubscription(payloadCustomerId: string): Promise<boolean> {
  try {
    const schedRes = await fetch(
      `https://api.payload.com/billing_schedules/?customer_id=${payloadCustomerId}&limit=10`,
      { headers: { Authorization: plAuth() } }
    )
    if (!schedRes.ok) return false
    const schedData = await schedRes.json()
    const schedules = schedData.values || []
    for (const schedule of schedules) {
      if (schedule.status === 'active') {
        await fetch(`https://api.payload.com/billing_schedules/${schedule.id}`, {
          method: 'DELETE',
          headers: { Authorization: plAuth() },
        })
      }
    }
    return true
  } catch {
    return false
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  // Extract request info for audit trail
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                    request.headers.get('x-real-ip') || 
                    'Unknown'
  const userAgent = request.headers.get('user-agent') || 'Unknown'

  try {
    const { userId, documentType, signBoth } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const { data: agent, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, email, commission_plan, mls_choice, location, license_number, personal_phone, onedrive_folder_url, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, ica_signed_at, commission_plan_agreement_signed_at, status, payload_payee_id, qualifying_transaction_target, waive_coaching_fee, cap_amount_override, post_cap_split_override'
      )
      .eq('id', userId)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isReferralAgent = agent.mls_choice === 'Referral Collective (No MLS)'

    // signBoth signs ICA + commission plan (standard) or just ICA (referral)
    // documentType still supported for backwards compatibility
    let docsToSign: string[]
    if (signBoth) {
      docsToSign = isReferralAgent ? ['ica'] : ['ica', 'commission_plan']
    } else {
      if (!['ica', 'commission_plan'].includes(documentType)) {
        return NextResponse.json({ error: 'Invalid documentType' }, { status: 400 })
      }
      docsToSign = [documentType]
    }

    // Fetch agent signature from onboarding session
    const { data: onboardingSession } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('agent_signature_url')
      .eq('user_id', userId)
      .single()

    const agentName = `${agent.first_name} ${agent.last_name}`
    const today = new Date()

    const mailingParts = [
      agent.shipping_address_line1,
      agent.shipping_address_line2,
      agent.shipping_city,
      agent.shipping_state,
      agent.shipping_zip,
    ].filter(Boolean).join(', ')

    // Load broker signature from public folder
    let brokerSignatureImageBytes: Uint8Array | undefined
    try {
      const sigPath = path.join(process.cwd(), 'public', 'courtney-signature.png')
      brokerSignatureImageBytes = new Uint8Array(fs.readFileSync(sigPath))
    } catch {
      console.error('Could not load courtney-signature.png')
    }

    const fileUrls: Record<string, string> = {}

    for (const docType of docsToSign) {
      const signedAt = docType === 'ica'
        ? agent.ica_signed_at
        : agent.commission_plan_agreement_signed_at
      const sigDate = signedAt ? new Date(signedAt) : today
      const effectiveDate = `${String(sigDate.getMonth() + 1).padStart(2, '0')} / ${String(sigDate.getDate()).padStart(2, '0')} / ${sigDate.getFullYear()}`

      // Fetch existing signing events for this document
      const { data: existingEvents } = await supabaseAdmin
        .from('document_signing_events')
        .select('signer_type, signer_name, signed_at, ip_address, user_agent')
        .eq('user_id', userId)
        .eq('document_type', docType)
        .eq('document_subtype', 'onboarding')
        .order('signed_at', { ascending: true })

      // Build audit trail: existing agent events + this broker event
      const auditTrail: AuditTrailEntry[] = (existingEvents || []).map(e => ({
        signerType: e.signer_type as 'agent' | 'broker',
        signerName: e.signer_name || 'Unknown',
        signedAt: e.signed_at,
        ipAddress: e.ip_address || undefined,
        userAgent: e.user_agent || undefined,
      }))

      // Add broker's signing event
      auditTrail.push({
        signerType: 'broker',
        signerName: 'Courtney Okanlomo',
        signedAt: today.toISOString(),
        ipAddress,
        userAgent,
      })

      let pdfContent: any
      let fileName: string

      // Read firm-wide plan defaults once per request.
      const standardDefaults = await getStandardPlanDefaults(supabaseAdmin)

      if (docType === 'ica') {
        if (isReferralAgent) {
          const referralSettings = await getReferralSettings()
          pdfContent = getReferralICAContent({
            agentFirstName: agent.first_name,
            agentLastName: agent.last_name,
            effectiveDate,
            mailingAddress: mailingParts,
            email: agent.email,
          }, referralSettings)
          fileName = `Referral_ICA_${agent.first_name}_${agent.last_name}_${today.toISOString().split('T')[0]}.pdf`
        } else {
          pdfContent = getICAContent({
            agentFirstName: agent.first_name,
            agentLastName: agent.last_name,
            effectiveDate,
            mailingAddress: mailingParts,
            email: agent.email,
            standardDefaults,
            overrides: extractICAOverridesFromUser(agent),
          })
          fileName = `ICA_${agent.first_name}_${agent.last_name}_${today.toISOString().split('T')[0]}.pdf`
        }
      } else {
        const planKey = getCommissionPlanKey(agent.commission_plan || '')
        pdfContent = getCommissionPlanContent({
          agentName,
          effectiveDate,
          plan: planKey,
          standardDefaults,
          overrides: extractOverridesFromUser(agent),
        })
        fileName = `Commission_Plan_Agreement_${agent.first_name}_${agent.last_name}_${today.toISOString().split('T')[0]}.pdf`
      }

      const pdfBytes = await generateAgreementPDF({
        title: pdfContent.title,
        sections: pdfContent.sections,
        agentName,
        effectiveDate,
        agentSignatureDataUrl: onboardingSession?.agent_signature_url ?? undefined,
        brokerSignatureImageBytes,
        showAgencySignature: true,
        auditTrail,
      })

      const sanitizedName = agentName.replace(/[/\\?%*:|"<>]/g, '-')
      const folderPath = `Agent Documents/${sanitizedName}-${agent.id}`
      const { fileUrl } = await uploadAgentDocument(folderPath, fileName, Buffer.from(pdfBytes))
      fileUrls[docType] = fileUrl

      // Record broker signing event
      await supabaseAdmin.from('document_signing_events').insert({
        user_id: userId,
        signer_id: auth.user.id,
        signer_type: 'broker',
        signer_name: 'Courtney Okanlomo',
        document_type: docType,
        document_subtype: 'onboarding',
        pdf_url: fileUrl,
        ip_address: ipAddress,
        user_agent: userAgent,
        is_final_version: true,
      })
    }

    // Persist document URLs and broker sign timestamp
    const updateFields: Record<string, any> = { broker_signed_at: today.toISOString() }
    if (fileUrls.ica) updateFields.ica_document_url = fileUrls.ica
    if (fileUrls.commission_plan) updateFields.commission_plan_agreement_url = fileUrls.commission_plan
    await supabaseAdmin.from('users').update(updateFields).eq('id', agent.id)

    // Check if docs are now fully co-signed - flip prospect to active
    // Referral agents: only need ICA signed
    // Standard agents: need both ICA + commission plan signed
    const { data: freshAgent } = await supabaseAdmin
      .from('users')
      .select('ica_document_url, commission_plan_agreement_url, ica_signed_at, commission_plan_agreement_signed_at, status')
      .eq('id', agent.id)
      .single()

    const icaDone = !!(freshAgent?.ica_signed_at && (fileUrls.ica || freshAgent?.ica_document_url))
    const commDone = !!(freshAgent?.commission_plan_agreement_signed_at && (fileUrls.commission_plan || freshAgent?.commission_plan_agreement_url))

    // Referral agents only need ICA, standard agents need both
    const allDocsDone = isReferralAgent ? icaDone : (icaDone && commDone)

    if (allDocsDone && freshAgent?.status === 'prospect') {
      const agentType = isReferralAgent ? 'referral' : 'agent'
      
      // For referral agents converting from CRC: cancel Payload subscription
      if (isReferralAgent && agent.payload_payee_id) {
        await cancelPayloadSubscription(agent.payload_payee_id)
      }
      
      // Get referral settings for dynamic fee in checklist email
      const referralFee = isReferralAgent ? (await getReferralSettings()).referral_annual_fee : 0

      // Derive office (canonical 'Houston' | 'DFW') from location/mls_choice.
      // DFW only when clearly DFW; everything else (incl. Houston-ish and 'Both') -> Houston.
      const loc = (agent.location || '').toLowerCase()
      const mls = agent.mls_choice || ''
      const officeValue =
        loc.includes('dfw') ||
        loc.includes('dallas') ||
        mls.includes('NTREIS') ||
        mls.includes('MetroTex')
          ? 'DFW'
          : 'Houston'

      // Generate a temporary password meeting M365 complexity requirements:
      // must contain uppercase, lowercase, digit, and special character (min 8 chars)
      const randChar = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
      const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
      const lower = 'abcdefghjkmnpqrstuvwxyz'
      const digits = '23456789'
      const special = '!@#$'
      const pool = upper + lower + digits + special
      const middle = Array.from({ length: 4 }, () => randChar(pool)).join('')
      const tempPassword = randChar(upper) + randChar(lower) + randChar(digits) + randChar(special) + middle

      // Create M365 user account and capture office email
      let officeEmail = ''
      let m365Error = ''
      try {
        const m365 = await createM365User({
          firstName: agent.first_name,
          lastName: agent.last_name,
          tempPassword,
          personalPhone: (agent as any).personal_phone || null,
          officeLocation: officeValue,
          mlsChoice: agent.mls_choice,
        })
        officeEmail = m365.officeEmail
        if (m365.stepErrors.length > 0) {
          m365Error = m365.stepErrors.join(' | ')
        }
      } catch (err: any) {
        // Non-fatal: log the error, continue activation, note in email
        m365Error = err.message || 'Unknown error'
        console.error('M365 user creation failed:', m365Error)
      }

      const activationUpdate: Record<string, any> = {
        status: 'active',
        is_active: true,
        is_licensed_agent: true,
        role: agentType,
        join_date: today.toISOString().split('T')[0],
        office: officeValue,
        ...(officeEmail && {
          email: officeEmail,
          office_email: officeEmail,
          personal_email: agent.email,
        }),
        // Referral agents don't pay monthly fees
        ...(isReferralAgent && {
          monthly_fee_waived: true,
          commission_plan: null,
          commission_plan_agreement_signed: false,
          commission_plan_agreement_signed_at: null,
          commission_plan_agreement_url: null,
        }),
      }

      await supabaseAdmin.from('users').update(activationUpdate).eq('id', agent.id)

      // The agent's email just changed from personal to office. Their Payload
      // billing customer (created at onboarding payment with the personal
      // email) should follow so it carries a current address.
      //
      // It does NOT prevent Payload creating a second customer at the next
      // bank activation. Payload creates one as a matter of course and lets
      // the person type any email on it, whether or not the addresses match,
      // so an earlier version of this comment saying the sync stopped
      // duplicates was wrong. See lib/payload/syncCustomerEmail.ts.
      if (officeEmail) {
        await syncPayloadCustomerEmail(agent.payload_payee_id, officeEmail)
      }

      // Send agent the W-9 / TREC lookout email (standard agents only)
      if (!isReferralAgent) {
        try {
          await sendW9TrecReadyEmail({
            preferred_first_name: agent.first_name,
            first_name: agent.first_name,
            email: agent.email,
          })
        } catch (err) {
          console.error('Failed to send W-9/TREC ready email:', err)
        }
      }

      // Different checklist for referral vs standard agents

      const checklistHtml = isReferralAgent
        ? `<p style="margin:0 0 16px;font-size:14px;color:#555;">Courtney has co-signed the Referral Agent ICA for <strong style="color:#1a1a1a;">${agentName}</strong>. Please complete the following.</p>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Agent Info</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Personal email: <strong style="color:#1a1a1a;">${agent.email}</strong></p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Verify First</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;TREC sponsorship invitation has been accepted</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;W-9 completed (agent completes in onboarding portal)</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Annual membership payment received ($${referralFee})</p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Create Accounts</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Outlook - create mailbox with referral@ prefix</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Add to Referral Collective distribution group</p>
          </div>

          <p style="margin:0 0 14px;font-size:14px;color:#555;">This is a <strong style="color:#C5A278;">Referral Agent</strong> - they do not need Dotloop, transactions platform, or full MLS access.</p>`
        : `<p style="margin:0 0 16px;font-size:14px;color:#555;">Courtney has co-signed all agreements for <strong style="color:#1a1a1a;">${agentName}</strong>. Complete these steps in order.</p>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Agent Info</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Name: <strong style="color:#1a1a1a;">${agentName}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Personal email: <strong style="color:#1a1a1a;">${agent.email}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Office email: <strong style="color:#1a1a1a;">${officeEmail || 'see M365 note below'}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">License: <strong style="color:#1a1a1a;">${agent.license_number || 'not on file'}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Temp password: <code style="background:#f0f0f0;padding:2px 6px;font-size:12px;">${tempPassword}</code></p>
            ${m365Error ? `<p style="margin:0;font-size:13px;color:#A32D2D;">M365 issue: ${m365Error}</p>` : ''}
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Step 1 &mdash; Do Right Now</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Assign M365 Business Basic license (M365 admin &gt; Users &gt; ${officeEmail || agentName} &gt; Licenses and apps)</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Grant Tara full mailbox access (Exchange admin &gt; Mailboxes &gt; ${officeEmail || agentName} &gt; Manage mailbox delegation)</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Send temp password to agent</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Create Dotloop account</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Submit TREC sponsorship invitation (license: ${agent.license_number || 'not on file'})</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Create transactions platform account</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Verify license expiration in the app</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Configure team and revenue share settings if applicable</p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Step 2 &mdash; After TREC and W-9 Are Confirmed</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Run New Agent Automated Onboarding Emails in Power Automate</p>
          </div>`

      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: 'office@collectiverealtyco.com',
        subject: `Action Required: ${isReferralAgent ? 'Set Up Referral Agent' : 'Create Accounts for'} ${agentName}`,
        html: getEmailLayout(
          checklistHtml,
          { title: (isReferralAgent ? 'Set Up Referral Agent: ' : 'Create Accounts for ') + agentName, preheader: `Action required - set up accounts for ${agentName}` }
        ),
      }).catch((e: unknown) => console.error('Failed to send activation notification:', e))
    }

    return NextResponse.json({ success: true, fileUrls, activated: allDocsDone })
  } catch (error: any) {
    console.error('Admin sign-document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}