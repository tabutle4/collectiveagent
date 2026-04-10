import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateAgreementPDF } from '@/lib/documents/generate-pdf'
import { getICAContent } from '@/lib/documents/ica-content'
import { getReferralICAContent } from '@/lib/documents/referral-ica-content'
import { getReferralSettings } from '@/lib/documents/settings-helpers'
import {
  getCommissionPlanContent,
  getCommissionPlanKey,
} from '@/lib/documents/commission-plan-content'
import { getPolicyAcknowledgmentContent } from '@/lib/documents/policy-acknowledgment-content'
import { createAgentFolder, uploadAgentDocument } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout, emailButton } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { token, documentType, signatureDataUrl } = await request.json()

    if (!token || !documentType || !signatureDataUrl) {
      return NextResponse.json(
        { error: 'token, documentType, and signatureDataUrl are required' },
        { status: 400 }
      )
    }

    if (!['ica', 'commission_plan', 'policy_manual'].includes(documentType)) {
      return NextResponse.json({ error: 'Invalid documentType' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, email, commission_plan, mls_choice, onedrive_folder_url, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip'
      )
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'
    const agentName = `${prospect.first_name} ${prospect.last_name}`
    const today = new Date()
    const effectiveDate = `${String(today.getMonth() + 1).padStart(2, '0')} / ${String(today.getDate()).padStart(2, '0')} / ${today.getFullYear()}`

    const mailingParts = [
      prospect.shipping_address_line1,
      prospect.shipping_address_line2,
      prospect.shipping_city,
      prospect.shipping_state,
      prospect.shipping_zip,
    ]
      .filter(Boolean)
      .join(', ')

    // Create OneDrive folder if it doesn't exist yet
    let folderPath = prospect.onedrive_folder_url
    if (!folderPath || !folderPath.includes('Agent Documents')) {
      const { folderPath: newFolderPath, sharingUrl } = await createAgentFolder(
        prospect.first_name,
        prospect.last_name,
        prospect.id
      )
      folderPath = newFolderPath

      await supabaseAdmin
        .from('users')
        .update({ onedrive_folder_url: sharingUrl })
        .eq('id', prospect.id)
    }

    // Generate PDF content
    let pdfContent: any
    let fileName: string

    if (documentType === 'ica') {
      if (isReferralAgent) {
        const referralSettings = await getReferralSettings()
        pdfContent = getReferralICAContent({
          agentFirstName: prospect.first_name,
          agentLastName: prospect.last_name,
          effectiveDate,
          mailingAddress: mailingParts,
          email: prospect.email,
        }, referralSettings)
      } else {
        pdfContent = getICAContent({
          agentFirstName: prospect.first_name,
          agentLastName: prospect.last_name,
          effectiveDate,
          mailingAddress: mailingParts,
          email: prospect.email,
        })
      }
      fileName = `ICA_${prospect.first_name}_${prospect.last_name}_${today.toISOString().split('T')[0]}.pdf`
    } else if (documentType === 'commission_plan') {
      const planKey = getCommissionPlanKey(prospect.commission_plan || '')
      pdfContent = getCommissionPlanContent({
        agentName,
        effectiveDate,
        plan: planKey,
      })
      fileName = `Commission_Plan_Agreement_${prospect.first_name}_${prospect.last_name}_${today.toISOString().split('T')[0]}.pdf`
    } else {
      pdfContent = getPolicyAcknowledgmentContent({ agentName, effectiveDate })
      fileName = `Policy_Acknowledgment_${prospect.first_name}_${prospect.last_name}_${today.toISOString().split('T')[0]}.pdf`
    }

    // Generate PDF with signature
    const pdfBytes = await generateAgreementPDF({
      title: pdfContent.title,
      sections: pdfContent.sections,
      agentName,
      agentSignatureDataUrl: signatureDataUrl,
      effectiveDate,
      showAgencySignature: documentType !== 'policy_manual',
    })

    // Upload to OneDrive
    const { fileUrl } = await uploadAgentDocument(folderPath, fileName, Buffer.from(pdfBytes))

    const updateFields: Record<string, any> = {}
    if (documentType === 'ica') {
      updateFields.independent_contractor_agreement_signed = true
      updateFields.ica_signed_at = today.toISOString()
      updateFields.ica_document_url = fileUrl
    } else if (documentType === 'commission_plan') {
      updateFields.commission_plan_agreement_signed = true
      updateFields.commission_plan_agreement_signed_at = today.toISOString()
      updateFields.commission_plan_agreement_url = fileUrl
    }
    // policy_manual: tracked in onboarding_sessions only (policy_ack_document_url + step_5_completed_at)

    if (Object.keys(updateFields).length > 0) {
      await supabaseAdmin.from('users').update(updateFields).eq('id', prospect.id)
    }

    // Advance the onboarding session step
    const nextStep = documentType === 'ica' ? 4 : documentType === 'commission_plan' ? 5 : 6
    const completedField =
      documentType === 'ica'
        ? 'step_3_completed_at'
        : documentType === 'commission_plan'
          ? 'step_4_completed_at'
          : 'step_5_completed_at'

    const sessionUpdate: Record<string, any> = {
      user_id: prospect.id,
      current_step: nextStep,
      [completedField]: today.toISOString(),
      updated_at: today.toISOString(),
    }
    if (documentType === 'policy_manual') {
      sessionUpdate.policy_ack_document_url = fileUrl
    }
    // Save agent signature on first signing (ICA) for broker review page
    if (documentType === 'ica') {
      sessionUpdate.agent_signature_url = signatureDataUrl
    }

    await supabaseAdmin.from('onboarding_sessions').upsert(sessionUpdate, { onConflict: 'user_id' })

    // Send email to broker after commission plan is signed (standard agents)
    // OR after ICA is signed (referral agents, since they skip commission plan)
    if (documentType === 'commission_plan' || (documentType === 'ica' && isReferralAgent)) {
      const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${prospect.id}`

      // Look up broker by role so this stays correct if email ever changes
      const { data: broker } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('role', 'broker')
        .single()
      const brokerEmail = broker?.email ?? 'office@collectiverealtyco.com'

      const emailSubject = isReferralAgent
        ? `Action Required: Co-sign Referral Agent Agreement for ${agentName}`
        : `Action Required: Review & Co-sign Agreements for ${agentName}`

      const emailBody = isReferralAgent
        ? `<p style="margin:0 0 16px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong> has signed their Referral Agent Independent Contractor Agreement. Please review and co-sign.</p>`
        : `<p style="margin:0 0 16px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong> has signed both their Independent Contractor Agreement and Commission Plan Agreement. Please review and co-sign both documents.</p>`

      const emailPreheader = isReferralAgent
        ? `${agentName} needs your co-signature on their referral agreement`
        : `${agentName} needs your co-signature on both agreements`

      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: brokerEmail,
        replyTo: 'tarab@collectiverealtyco.com',
        subject: emailSubject,
        html: getEmailLayout(
          `${emailBody}
          ${emailButton('Review & Sign', signingUrl)}
          <p style="font-size:12px;color:#888;margin:16px 0 0;">Or copy this link: ${signingUrl}</p>`,
          { title: emailSubject, preheader: emailPreheader }
        ),
      }).catch((e: unknown) => console.error('Failed to send broker signing email:', e))
    }

    // Notify office when policy manual is signed
    if (documentType === 'policy_manual') {
      const w9StepNumber = isReferralAgent ? 5 : 6
      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: 'office@collectiverealtyco.com',
        subject: `Policy Manual Signed for ${agentName}${isReferralAgent ? ' (Referral)' : ''}`,
        html: getEmailLayout(
          `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong>${isReferralAgent ? ' (Referral Agent)' : ''} has signed and acknowledged the Policy Manual.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#555;">They are now on Step ${w9StepNumber} (W-9). Please send their W-9 request via Track1099.</p>
          <p style="margin:0;font-size:12px;color:#888;">Agent email: ${prospect.email}</p>`,
          { title: 'Policy Manual Signed', preheader: `${agentName} acknowledged the policy manual` }
        ),
      }).catch((e: unknown) => console.error('Failed to send policy manual notification:', e))
    }

    return NextResponse.json({ success: true, fileUrl })
  } catch (error: any) {
    console.error('Sign document error:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate document' }, { status: 500 })
  }
}