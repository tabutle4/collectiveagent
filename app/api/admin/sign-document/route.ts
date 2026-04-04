import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { generateAgreementPDF } from '@/lib/documents/generate-pdf'
import { getICAContent } from '@/lib/documents/ica-content'
import { getCommissionPlanContent, getCommissionPlanKey } from '@/lib/documents/commission-plan-content'
import { uploadAgentDocument } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import fs from 'fs'
import path from 'path'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const { userId, documentType, signBoth } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // signBoth signs ICA + commission plan in one call
    // documentType still supported for backwards compatibility
    const docsToSign: string[] = signBoth
      ? ['ica', 'commission_plan']
      : [documentType]

    if (!signBoth && !['ica', 'commission_plan'].includes(documentType)) {
      return NextResponse.json({ error: 'Invalid documentType' }, { status: 400 })
    }

    const { data: agent, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, email, commission_plan, onedrive_folder_url, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, ica_signed_at, commission_plan_agreement_signed_at, status'
      )
      .eq('id', userId)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

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
        pdfContent = getICAContent({
          agentFirstName: agent.first_name,
          agentLastName: agent.last_name,
          effectiveDate,
          mailingAddress: mailingParts,
          email: agent.email,
        })
        fileName = `ICA_${agent.first_name}_${agent.last_name}_${today.toISOString().split('T')[0]}.pdf`
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

    // Check if both docs are now fully co-signed — flip prospect to active
    const { data: freshAgent } = await supabaseAdmin
      .from('users')
      .select('ica_document_url, commission_plan_agreement_url, ica_signed_at, commission_plan_agreement_signed_at, status')
      .eq('id', agent.id)
      .single()

    const icaDone = !!(freshAgent?.ica_signed_at && (fileUrls.ica || freshAgent?.ica_document_url))
    const commDone = !!(freshAgent?.commission_plan_agreement_signed_at && (fileUrls.commission_plan || freshAgent?.commission_plan_agreement_url))

    if (icaDone && commDone && freshAgent?.status === 'prospect') {
      await supabaseAdmin.from('users').update({ status: 'active', is_active: true }).eq('id', agent.id)

      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: 'office@collectiverealtyco.com',
        subject: `All Agreements Co-signed for ${agentName}`,
        html: getEmailLayout(
          `<p style="margin:0 0 14px;font-size:14px;color:#555;">Both agreements have been co-signed for <strong style="color:#1a1a1a;">${agentName}</strong>. The agent is now active in the system.</p>
          <p style="margin:0 0 14px;font-size:14px;color:#555;">Head to the admin onboarding page to complete their setup.</p>
          <p style="margin:0;font-size:12px;color:#888;">Agent email: ${agent.email}</p>`,
          { title: 'All Agreements Signed', preheader: `${agentName} is now active` }
        ),
      }).catch((e: unknown) => console.error('Failed to send activation notification:', e))
    }

    return NextResponse.json({ success: true, fileUrls, activated: icaDone && commDone })
  } catch (error: any) {
    console.error('Admin sign-document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}