import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { generateAgreementPDF } from '@/lib/documents/generate-pdf'
import { getICAContent } from '@/lib/documents/ica-content'
import { getReferralICAContent } from '@/lib/documents/referral-ica-content'
import { getReferralSettings } from '@/lib/documents/settings-helpers'
import { getCommissionPlanContent, getCommissionPlanKey } from '@/lib/documents/commission-plan-content'
import { uploadAgentDocument } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
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

  try {
    const { userId, documentType, signBoth } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const { data: agent, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, email, commission_plan, mls_choice, onedrive_folder_url, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, ica_signed_at, commission_plan_agreement_signed_at, status, payload_payee_id'
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

      let pdfContent: any
      let fileName: string

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
          })
          fileName = `ICA_${agent.first_name}_${agent.last_name}_${today.toISOString().split('T')[0]}.pdf`
        }
      } else {
        const planKey = getCommissionPlanKey(agent.commission_plan || '')
        pdfContent = getCommissionPlanContent({ agentName, effectiveDate, plan: planKey })
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
      })

      const sanitizedName = agentName.replace(/[/\\?%*:|"<>]/g, '-')
      const folderPath = `Agent Documents/${sanitizedName}-${agent.id}`
      const { fileUrl } = await uploadAgentDocument(folderPath, fileName, Buffer.from(pdfBytes))
      fileUrls[docType] = fileUrl
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
      
      await supabaseAdmin.from('users').update({
        status: 'active',
        is_active: true,
        is_licensed_agent: true,
        role: agentType,
        join_date: today.toISOString().split('T')[0],
        // Referral agents don't pay monthly fees
        ...(isReferralAgent && { 
          monthly_fee_waived: true,
          // Clear commission plan fields - referral agents have fixed splits
          commission_plan: null,
          commission_plan_agreement_signed: false,
          commission_plan_agreement_signed_at: null,
          commission_plan_agreement_url: null,
        }),
      }).eq('id', agent.id)

      // Different checklist for referral vs standard agents
      const checklistHtml = isReferralAgent
        ? `<p style="margin:0 0 16px;font-size:14px;color:#555;">Courtney has co-signed the Referral Agent ICA for <strong style="color:#1a1a1a;">${agentName}</strong>. Please complete the following.</p>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Verify First</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;TREC sponsorship invitation has been accepted</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;W-9 completed via Track1099</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Annual membership payment received ($${referralFee})</p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Create Accounts</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Outlook - create mailbox with referral@ prefix</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Add to Referral Collective distribution group</p>
          </div>

          <p style="margin:0 0 14px;font-size:14px;color:#555;">This is a <strong style="color:#C5A278;">Referral Agent</strong> - they do not need Dotloop, transactions platform, or full MLS access.</p>
          <p style="margin:0;font-size:12px;color:#888;">Agent personal email: ${agent.email}</p>`
        : `<p style="margin:0 0 16px;font-size:14px;color:#555;">Courtney has co-signed all agreements for <strong style="color:#1a1a1a;">${agentName}</strong>. Please complete the following before sending onboarding emails.</p>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Verify First</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;TREC sponsorship invitation has been accepted</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;W-9 completed via Track1099</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Onboarding payment received</p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Create Accounts</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Outlook - create mailbox, add to groups, set permissions, enable MFA</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Dotloop - create account</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Transactions platform - create account</p>
          </div>

          <div style="margin:0 0 16px;padding:14px 18px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;font-weight:600;">Update Agent Profile in the App</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Set office email (new Outlook address)</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Set division</p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">☐ &nbsp;Verify license expiration date, NRDS ID, and MLS ID</p>
            <p style="margin:0;font-size:14px;color:#555;">☐ &nbsp;Configure team and revenue share settings if applicable</p>
          </div>

          <p style="margin:0 0 14px;font-size:14px;color:#555;">Once all of the above is done, run the <strong style="color:#1a1a1a;">New Agent Automated Onboarding Emails</strong> flow in Power Automate.</p>
          <p style="margin:0;font-size:12px;color:#888;">Agent personal email: ${agent.email}</p>`

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