import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { graphClient } from '@/lib/microsoft-graph'
import { extractDocWithClaude, sniffMediaType } from '@/lib/doc-extract'

export const dynamic = 'force-dynamic'

// Inbound email webhook for transaction documents.
// Address format: txndoc+{transactionId}@coachingbrokeragetools.com
//
// Handles two cases:
//   1. Image/PDF attachments — uploaded to OneDrive, AI-reviewed, stored as transaction_document
//   2. Dotloop/ZipForms/Drive links in body — stored as link-type transaction_document

function stripReplyQuotes(text: string): string {
  const markers = [
    /On .+ wrote:/i,
    /From:.+\n/i,
    /-----Original Message-----/i,
    /_{5,}/,
  ]
  let clean = text
  for (const marker of markers) {
    const idx = clean.search(marker)
    if (idx > 50) clean = clean.substring(0, idx)
  }
  return clean
    .split('\n')
    .filter((line: string) => !line.trim().startsWith('>'))
    .join('\n')
    .trim()
}

const DOC_LINK_HOSTS = ['dotloop', 'zipforms', 'ziplogix', 'drive.google', 'sharepoint', 'onedrive', 'dropbox', 'docusign']

async function fetchAttachmentDownloadUrl(emailId: string, att: any): Promise<string | null> {
  if (att.download_url) return att.download_url
  // Webhook payload has metadata but no download_url — fetch directly by ID
  const attRes = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments/${att.id}`,
    { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
  )
  const attData = await attRes.json()
  if (!attRes.ok || !attData?.download_url) {
    console.error('Resend attachment fetch failed:', attRes.status, JSON.stringify(attData).substring(0, 200))
    return null
  }
  return attData.download_url
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.RESEND_INBOUND_SECRET
  if (expectedSecret) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('secret') !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const body = await request.json()
    if (body.type !== 'email.received') {
      return NextResponse.json({ skipped: true })
    }

    const emailData = body.data || body
    const emailId: string = emailData.email_id
    const toArr: string[] = Array.isArray(emailData.to) ? emailData.to : [emailData.to ?? '']
    const toStr = toArr.join(',')

    // Only handle txndoc+ addresses
    const match = toStr.match(/txndoc\+([a-f0-9-]+)@/i)
    if (!match) return NextResponse.json({ skipped: true })

    const transactionId = match[1]

    // Verify transaction
    const { data: txn } = await supabase
      .from('transactions')
      .select('id, property_address')
      .eq('id', transactionId)
      .single()

    if (!txn) {
      console.error('Transaction not found:', transactionId)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Fetch email body for link extraction
    // Use Resend API directly (same full-access key)
    let rawText = ''
    try {
      const emailRes = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}`,
        { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
      )
      if (emailRes.ok) {
        const emailContent = await emailRes.json()
        rawText = emailContent?.text || emailContent?.plain_text || ''
      }
    } catch { /* best-effort */ }

    const subject: string = emailData.subject || ''
    const fromRaw: string = emailData.from || ''
    const senderEmail = fromRaw.replace(/.*<(.+)>/, '$1').trim() || fromRaw
    const { data: senderUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${senderEmail},office_email.eq.${senderEmail}`)
      .maybeSingle()

    const cleanText = stripReplyQuotes(rawText)
    const subjectClean = subject.replace(/^(fwd?|re):\s*/i, '').trim()
    const fromName = fromRaw.includes('<') ? fromRaw.split('<')[0].trim() : senderEmail.split('@')[0]

    const docsToCreate: any[] = []

    // 1. Fetch and upload any file attachments (images, PDFs)
    const attList: any[] = emailData.attachments || []

    for (const att of attList) {
      const contentType: string = att.content_type || ''
      const isImage = contentType.startsWith('image/')
      const isPDF = contentType === 'application/pdf'
      if (!isImage && !isPDF) continue

      try {
        const downloadUrl = await fetchAttachmentDownloadUrl(emailId, att)
        if (!downloadUrl) continue

        const dlRes = await fetch(downloadUrl)
        if (!dlRes.ok) continue
        const fileBuffer = Buffer.from(await dlRes.arrayBuffer())

        const bytes = new Uint8Array(fileBuffer)
        const realMediaType = sniffMediaType(bytes, contentType)

        const sanitizedAddress = (txn.property_address || 'Unknown')
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 60)
        const folderPath = `Transaction Documents/${sanitizedAddress}-${transactionId}`
        const safeFileName = (att.filename || `attachment.${isImage ? 'jpg' : 'pdf'}`)
          .replace(/[^a-zA-Z0-9._-]/g, '_')

        const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, safeFileName, fileBuffer)

        // Run AI doc extraction — best-effort, never blocks save
        let aiSummary: string | null = null
        let suggestedSlots: string[] = []
        if (process.env.ANTHROPIC_API_KEY) {
          try {
            const fileBase64 = fileBuffer.toString('base64')
            const result = await extractDocWithClaude(fileBase64, realMediaType, transactionId)
            if (result.summary) {
              aiSummary = JSON.stringify({
                summary: result.summary,
                page_contents: result.page_contents,
                verification_checklist: result.verification_checklist,
                commission_details: result.commission_details,
              })
            }
            suggestedSlots = result.suggested_slots
          } catch (aiErr: any) {
            console.error('Doc AI extraction failed (non-fatal):', aiErr.message)
          }
        }

        docsToCreate.push({
          transaction_id: transactionId,
          uploaded_by: senderUser?.id || null,
          file_name: att.filename || subjectClean || `Email attachment from ${fromName}`,
          file_url: fileUrl,
          file_type: realMediaType,
          compliance_status: 'pending',
          compliance_notes: `Received via email from ${fromRaw}`.substring(0, 2000),
          ai_review: aiSummary,
          version: 1,
          _suggested_slots: suggestedSlots, // temp field for post-insert slot assignment
        })
      } catch (uploadErr: any) {
        console.error('Failed to upload attachment:', att.filename, uploadErr.message)
      }
    }

    // 2. Extract any document share links from the body
    const urlMatches = rawText.match(/https?:\/\/[^\s<>"]+/g) || []
    const docLinks = urlMatches.filter((url: string) =>
      DOC_LINK_HOSTS.some(host => url.includes(host))
    )

    for (const link of docLinks) {
      const linkHost = new URL(link).hostname.replace('www.', '')
      docsToCreate.push({
        transaction_id: transactionId,
        uploaded_by: senderUser?.id || null,
        file_name: `${subjectClean || 'Document'} (${linkHost})`,
        file_url: link,
        file_type: 'link/external',
        compliance_status: 'pending',
        compliance_notes: `Shared via email from ${fromRaw}\n\n${cleanText}`.substring(0, 2000),
        ai_review: null,
        version: 1,
        _suggested_slots: [],
      })
    }

    // 3. If nothing else, store the email itself
    if (docsToCreate.length === 0) {
      const emailSummary = [`From: ${fromRaw}`, `Subject: ${subject}`, '', cleanText || '(no body)'].join('\n')
      docsToCreate.push({
        transaction_id: transactionId,
        uploaded_by: senderUser?.id || null,
        file_name: subjectClean || `Email from ${fromName}`,
        file_url: `mailto:${senderEmail}`,
        file_type: 'message/email',
        compliance_status: 'pending',
        compliance_notes: emailSummary.substring(0, 2000),
        ai_review: null,
        version: 1,
        _suggested_slots: [],
      })
    }

    // Insert docs, stripping the temp field first. Compliance is per side: when the
    // deal has exactly one compliance side, inbound docs belong to it. With two
    // sides the sender is unknown, so the doc stays shared (untagged) for the
    // reviewer to assign.
    let inboundSubmissionId: string | null = null
    const { data: inboundSides } = await supabase
      .from('agent_form_submissions')
      .select('id')
      .eq('transaction_id', transactionId)
      .filter('data->>submission_mode', 'eq', 'compliance')
    if ((inboundSides || []).length === 1) inboundSubmissionId = inboundSides![0].id

    const docsForInsert = docsToCreate.map(({ _suggested_slots, ...rest }) => ({ ...rest, submission_id: inboundSubmissionId }))
    const { data: insertedDocs, error: insertError } = await supabase
      .from('transaction_documents')
      .insert(docsForInsert)
      .select('id')

    if (insertError) {
      console.error('Failed to insert docs:', insertError)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Apply suggested slots to docs that have them (mirrors apply_ai_review action)
    if (insertedDocs) {
      for (let i = 0; i < insertedDocs.length; i++) {
        const slots: string[] = docsToCreate[i]?._suggested_slots || []
        const docId = insertedDocs[i]?.id
        if (!docId || slots.length === 0) continue

        // Update first slot in place
        await supabase
          .from('transaction_documents')
          .update({ required_document_id: slots[0] })
          .eq('id', docId)

        // Extra slots become sibling rows
        if (slots.length > 1) {
          const sourceDoc = docsForInsert[i]
          const siblings = slots.slice(1).map((slotId: string) => ({
            ...sourceDoc,
            required_document_id: slotId,
          }))
          await supabase.from('transaction_documents').insert(siblings)
        }
      }
    }

    console.log(`Saved ${docsToCreate.length} doc(s) for transaction ${transactionId}`)
    return NextResponse.json({ success: true, docs_created: docsToCreate.length })
  } catch (error: any) {
    console.error('Transaction email-inbound error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
