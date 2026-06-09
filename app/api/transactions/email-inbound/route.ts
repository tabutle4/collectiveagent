import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { graphClient } from '@/lib/microsoft-graph'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

// Inbound email webhook for transaction documents.
// Address format: txndoc+{transactionId}@coachingbrokeragetools.com
//
// Handles two cases:
//   1. Image/PDF attachments — uploaded to OneDrive, stored as transaction_document
//   2. Dotloop/ZipForms/Drive links in body — stored as link-type transaction_document
//
// Webhook payload only contains metadata; body and attachments fetched via SDK.

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

    // Fetch full email content from Resend (body, headers)
    const { data: emailContent } = await resend.emails.receiving.get(emailId)
    const rawText: string = (emailContent as any)?.text || (emailContent as any)?.plain_text || ''
    const subject: string = emailData.subject || ''
    const fromRaw: string = emailData.from || ''

    // Parse sender
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
    // Attachment metadata is in the webhook payload — use it directly.
    const attList: any[] = emailData.attachments || []

    for (const att of attList) {
      const contentType: string = att.content_type || ''
      const isImage = contentType.startsWith('image/')
      const isPDF = contentType === 'application/pdf'
      if (!isImage && !isPDF) continue

      try {
        // Webhook payload has attachment metadata but no download_url — fetch by ID.
        let downloadUrl: string = att.download_url
        if (!downloadUrl) {
          const { data: sdkAtt } = await resend.emails.receiving.attachments.get({ emailId, id: att.id })
          if (!sdkAtt?.download_url) continue
          downloadUrl = sdkAtt.download_url
        }
        const dlRes = await fetch(downloadUrl)
        if (!dlRes.ok) continue
        const fileBuffer = Buffer.from(await dlRes.arrayBuffer())

        const sanitizedAddress = (txn.property_address || 'Unknown')
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 60)
        const folderPath = `Transaction Documents/${sanitizedAddress}-${transactionId}`
        const safeFileName = (att.filename || `attachment.${isImage ? 'jpg' : 'pdf'}`)
          .replace(/[^a-zA-Z0-9._-]/g, '_')

        const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, safeFileName, fileBuffer)

        docsToCreate.push({
          transaction_id: transactionId,
          uploaded_by: senderUser?.id || null,
          file_name: att.filename || subjectClean || `Email attachment from ${fromName}`,
          file_url: fileUrl,
          file_type: contentType,
          compliance_status: 'pending',
          compliance_notes: `Received via email from ${fromRaw}`.substring(0, 2000),
          version: 1,
        })
      } catch (uploadErr: any) {
        console.error('Failed to upload attachment:', att.filename, uploadErr.message)
      }
    }

    // 2. Extract any document share links from the body
    const urlMatches = (rawText).match(/https?:\/\/[^\s<>"]+/g) || []
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
        version: 1,
      })
    }

    // 3. If nothing else, store the email itself as a record
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
        version: 1,
      })
    }

    const { error: insertError } = await supabase
      .from('transaction_documents')
      .insert(docsToCreate)

    if (insertError) {
      console.error('Failed to insert docs:', insertError)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    console.log(`Saved ${docsToCreate.length} doc(s) for transaction ${transactionId}`)
    return NextResponse.json({ success: true, docs_created: docsToCreate.length })
  } catch (error: any) {
    console.error('Transaction email-inbound error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
