import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { graphClient } from '@/lib/microsoft-graph'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

// Inbound email webhook — receives check photos emailed from phone.
// Address format: txncheck+{checkId}@coachingbrokeragetools.com
// Webhook payload only contains metadata; attachment content is fetched via SDK.

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
    // Each entry has id, content_type, filename, download_url.
    const attList: any[] = emailData.attachments || []

    if (!attList.length) {
      console.log('No attachments in webhook payload for check:', checkId)
      return NextResponse.json({ error: 'No attachments found' }, { status: 400 })
    }

    // Take the first image attachment
    const imageAtt = attList.find((a: any) =>
      (a.content_type || '').startsWith('image/')
    )
    if (!imageAtt) {
      return NextResponse.json({ error: 'No image attachment found' }, { status: 400 })
    }

    // Webhook payload has attachment metadata but no download_url.
    // Fetch it directly by ID from the Resend API.
    if (!imageAtt.download_url) {
      const { data: sdkAtt, error: sdkErr } = await resend.emails.receiving.attachments.get({
        emailId,
        id: imageAtt.id,
      })
      if (sdkErr || !sdkAtt?.download_url) {
        console.error('SDK attachment fetch error:', sdkErr)
        return NextResponse.json({ error: 'No download URL for attachment' }, { status: 400 })
      }
      imageAtt.download_url = sdkAtt.download_url
    }

    // Download the actual file content
    const dlRes = await fetch(imageAtt.download_url)
    if (!dlRes.ok) throw new Error(`Failed to download attachment: ${dlRes.status}`)
    const fileBuffer = Buffer.from(await dlRes.arrayBuffer())

    // Build OneDrive path
    const ext = (imageAtt.content_type || '').includes('png') ? 'png' : 'jpg'
    const checkLabel = check.check_number ? `Check-${check.check_number}` : 'Check'
    const sanitizedAddress = (check.property_address || 'Unknown')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60)
    const folderPath = `Commission Checks/${sanitizedAddress}`
    const fileName = `${checkLabel}_${checkId.substring(0, 8)}.${ext}`

    // Upload to OneDrive
    const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)

    // Save URL to check record
    const { error: updateError } = await supabase
      .from('checks_received')
      .update({ check_image_url: fileUrl })
      .eq('id', checkId)

    if (updateError) throw new Error('Failed to update check_image_url')

    console.log(`Check photo saved for ${checkId}: ${fileUrl}`)
    return NextResponse.json({ success: true, file_url: fileUrl })
  } catch (error: any) {
    console.error('Check email-inbound error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
