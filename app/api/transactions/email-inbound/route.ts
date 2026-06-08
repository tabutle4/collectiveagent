import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Resend inbound email webhook
// Agents email documents to: txndoc+{transactionId}@coachingbrokeragetools.com
// The email body and any file links are stored as a transaction_document record.
// Leah sees the email content in the Documents tab and can approve/reject.

export async function POST(request: NextRequest) {
  // Validate shared secret to prevent spoofed inbound email payloads.
  // The secret is appended to the webhook URL in Resend: ?secret=RESEND_INBOUND_SECRET
  const expectedSecret = process.env.RESEND_INBOUND_SECRET
  if (expectedSecret) {
    const { searchParams } = new URL(request.url)
    const providedSecret = searchParams.get('secret')
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const body = await request.json()

    // Resend wraps inbound data under a "data" key
    const emailData = body.data || body
    const { from, to, subject, text, html, attachments } = emailData

    // Parse the to: address to extract transaction ID
    // Format: txndoc+{transactionId}@coachingbrokeragetools.com
    const toAddress = Array.isArray(to) ? to[0] : to
    const toStr = typeof toAddress === 'string' ? toAddress : toAddress?.address || ''
    const match = toStr.match(/txndoc\+([a-f0-9-]+)@/i)

    if (!match) {
      console.log('No transaction ID in to address:', toStr)
      return NextResponse.json({ success: false, error: 'Invalid recipient' }, { status: 400 })
    }

    const transactionId = match[1]

    // Verify the transaction exists
    const { data: txn } = await supabase
      .from('transactions')
      .select('id, property_address')
      .eq('id', transactionId)
      .single()

    if (!txn) {
      console.error('Transaction not found for inbound email:', transactionId)
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
    }

    // Parse sender
    const fromStr = typeof from === 'string' ? from : from?.address || ''
    const fromName = typeof from === 'string'
      ? fromStr.split('@')[0]
      : from?.name || fromStr.split('@')[0] || 'Unknown'

    // Try to match the sender to a user in the system
    const senderEmail = fromStr.replace(/.*<(.+)>/, '$1').trim() || fromStr
    const { data: senderUser } = await supabase
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
      .or(`email.eq.${senderEmail},office_email.eq.${senderEmail}`)
      .maybeSingle()

    // Clean up quoted reply content from the body
    let cleanText = text || ''
    const replyMarkers = [
      /On .+ wrote:/i,
      /From:.+\n/i,
      /-----Original Message-----/i,
      /_{5,}/,
    ]
    for (const marker of replyMarkers) {
      const idx = cleanText.search(marker)
      if (idx > 50) cleanText = cleanText.substring(0, idx)
    }
    cleanText = cleanText
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('>'))
      .join('\n')
      .trim()

    // Build a document name from the subject or sender
    const subjectClean = (subject || '').replace(/^(fwd?|re):\s*/i, '').trim()
    const docName = subjectClean || `Email from ${fromName}`

    // Build the file_url as a data URI representation of the email body
    // This gives Leah something to "open" that shows the email content
    // The content is stored in compliance_notes for AI summary / Leah review
    const emailSummary = [
      `From: ${fromStr}`,
      `Subject: ${subject || '(no subject)'}`,
      '',
      cleanText || '(no body)',
    ].join('\n')

    // Check for any URLs in the email body that look like Dotloop/ZipForms share links
    const urlMatches = (text || '').match(/https?:\/\/[^\s<>"]+/g) || []
    const docLinks = urlMatches.filter((url: string) =>
      url.includes('dotloop') ||
      url.includes('zipforms') ||
      url.includes('ziplogix') ||
      url.includes('drive.google') ||
      url.includes('sharepoint') ||
      url.includes('onedrive') ||
      url.includes('dropbox') ||
      url.includes('docusign')
    )

    // Store each linked document as a separate record
    const docsToCreate: any[] = []

    if (docLinks.length > 0) {
      for (const link of docLinks) {
        const linkHost = new URL(link).hostname.replace('www.', '')
        docsToCreate.push({
          transaction_id: transactionId,
          uploaded_by: senderUser?.id || null,
          file_name: `${docName} (${linkHost})`,
          file_url: link,
          file_type: 'link/external',
          compliance_status: 'pending',
          compliance_notes: `Shared via email from ${fromStr}\n\n${cleanText}`.substring(0, 2000),
          version: 1,
        })
      }
    }

    // Always create one record for the email itself
    docsToCreate.push({
      transaction_id: transactionId,
      uploaded_by: senderUser?.id || null,
      file_name: docName || `Email from ${fromName}`,
      file_url: `mailto:${senderEmail}`,
      file_type: 'message/email',
      compliance_status: 'pending',
      compliance_notes: emailSummary.substring(0, 2000),
      version: 1,
    })

    // Insert all document records
    const { error: insertError } = await supabase
      .from('transaction_documents')
      .insert(docsToCreate)

    if (insertError) {
      console.error('Failed to save inbound email documents:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
    }

    console.log(`Saved ${docsToCreate.length} doc(s) from inbound email for transaction ${transactionId}`)
    return NextResponse.json({ success: true, docs_created: docsToCreate.length })
  } catch (error) {
    console.error('Transaction email-inbound webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
