import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { graphClient } from '@/lib/microsoft-graph'
import { extractCheckWithClaude, sniffMediaType } from '@/lib/check-extract'

export const dynamic = 'force-dynamic'

// Inbound email webhook — receives check photos emailed from phone.
// Address format: txncheck+{checkId}@coachingbrokeragetools.com
// After uploading to OneDrive, runs AI extraction and writes extracted fields to the check record.

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

    // Only handle txncheck+ addresses — ignore everything else
    const match = toStr.match(/txncheck\+([a-f0-9-]+)@/i)
    if (!match) return NextResponse.json({ skipped: true })

    const checkId = match[1]

    // Verify check exists
    const { data: check, error: checkError } = await supabase
      .from('checks_received')
      .select('id, property_address, check_number')
      .eq('id', checkId)
      .single()

    if (checkError || !check) {
      console.error('Check not found for inbound email:', checkId)
      return NextResponse.json({ error: 'Check not found' }, { status: 404 })
    }

    // Attachment metadata is in the webhook payload's data.attachments array.
    const attList: any[] = emailData.attachments || []
    if (!attList.length) {
      return NextResponse.json({ error: 'No attachments found' }, { status: 400 })
    }

    // Take the first image attachment
    const imageAtt = attList.find((a: any) => (a.content_type || '').startsWith('image/'))
    if (!imageAtt) {
      return NextResponse.json({ error: 'No image attachment found' }, { status: 400 })
    }

    // Webhook payload has attachment metadata but no download_url — fetch by ID.
    if (!imageAtt.download_url) {
      const attRes = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}/attachments/${imageAtt.id}`,
        { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
      )
      const attData = await attRes.json()
      if (!attRes.ok || !attData?.download_url) {
        console.error('Resend attachment fetch failed:', attRes.status, JSON.stringify(attData).substring(0, 200))
        return NextResponse.json({ error: 'No download URL for attachment' }, { status: 400 })
      }
      imageAtt.download_url = attData.download_url
    }

    // Download the actual file content
    const dlRes = await fetch(imageAtt.download_url)
    if (!dlRes.ok) throw new Error(`Failed to download attachment: ${dlRes.status}`)
    const fileBuffer = Buffer.from(await dlRes.arrayBuffer())

    // Sniff true media type from magic bytes
    const bytes = new Uint8Array(fileBuffer)
    const realMediaType = sniffMediaType(bytes, imageAtt.content_type || 'image/jpeg')
    const ext = realMediaType.includes('png') ? 'png' : 'jpg'

    // Build OneDrive path
    const checkLabel = check.check_number ? `Check-${check.check_number}` : 'Check'
    const sanitizedAddress = (check.property_address || 'Unknown')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60)
    const folderPath = `Commission Checks/${sanitizedAddress}`
    const fileName = `${checkLabel}_${checkId.substring(0, 8)}.${ext}`

    // Upload to OneDrive
    const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)

    // Build update payload — always save the image URL
    const updateFields: Record<string, any> = { check_image_url: fileUrl }

    // Run AI extraction if Anthropic key is configured — best-effort, never blocks save
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const fileBase64 = fileBuffer.toString('base64')
        const extracted = await extractCheckWithClaude(fileBase64, realMediaType)

        if (extracted.check_amount != null) updateFields.check_amount = extracted.check_amount
        if (extracted.check_from)          updateFields.check_from = extracted.check_from
        if (extracted.check_number)        updateFields.check_number = extracted.check_number
        if (extracted.check_date)          updateFields.check_date = extracted.check_date
        if (extracted.payment_method)      updateFields.payment_method = extracted.payment_method

        // cleared_date drives the DB trigger that sets status; also derive received/deposited
        if (extracted.cleared_date) {
          updateFields.cleared_date = extracted.cleared_date
          const clearD = new Date(extracted.cleared_date + 'T12:00:00')
          clearD.setDate(clearD.getDate() - 1)
          const dayBefore = clearD.toISOString().split('T')[0]
          updateFields.received_date = dayBefore
          updateFields.deposited_date = dayBefore
        }

        if (extracted.notes) {
          updateFields.notes = extracted.notes
        }

        console.log(`Check AI extraction complete for ${checkId}: confidence=${extracted.confidence}`)
      } catch (aiErr: any) {
        console.error('Check AI extraction failed (non-fatal):', aiErr.message)
      }
    }

    // Write everything to the check record
    const { error: updateError } = await supabase
      .from('checks_received')
      .update(updateFields)
      .eq('id', checkId)

    if (updateError) throw new Error('Failed to update check record')

    console.log(`Check photo + AI data saved for ${checkId}: ${fileUrl}`)
    return NextResponse.json({ success: true, file_url: fileUrl })
  } catch (error: any) {
    console.error('Check email-inbound error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
