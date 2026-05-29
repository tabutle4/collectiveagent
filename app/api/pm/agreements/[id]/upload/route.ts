import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { graphClient } from '@/lib/microsoft-graph'

// Upload (or replace) the PM agreement PDF. Mirrors the lease upload pattern:
// MS Graph PUT to a deterministic path overwrites, and the new URL is written
// onto pm_agreements.agreement_pdf_url which the admin landlord page reads.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id: agreementId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    // Server-side PDF guard. Column is named agreement_pdf_url and the
    // OneDrive file is stored as "PM Agreement.pdf", so non-PDF content here
    // would silently mislabel the file. Accept either a proper application/pdf
    // MIME or a .pdf extension (since some browsers send octet-stream).
    const looksLikePdf =
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name)
    if (!looksLikePdf) {
      return NextResponse.json(
        { error: 'PM agreement must be a PDF file' },
        { status: 400 }
      )
    }

    const { data: agreement, error: fetchErr } = await supabaseAdmin
      .from('pm_agreements')
      .select(`
        id,
        landlords:landlord_id ( id, first_name, last_name )
      `)
      .eq('id', agreementId)
      .single()

    if (fetchErr || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    const landlord: any = Array.isArray(agreement.landlords)
      ? agreement.landlords[0]
      : agreement.landlords

    if (!landlord) {
      return NextResponse.json({ error: 'Agreement is missing landlord link' }, { status: 400 })
    }

    const safeLandlord = `${landlord.first_name} ${landlord.last_name}`.replace(/[/\\?%*:|"<>]/g, '-')
    const folderPath = `PM Documents/Landlords/${safeLandlord}-${landlord.id}`

    await graphClient.createFolder(folderPath)

    // Constant filename so re-upload replaces the existing PDF in place.
    const fileName = 'PM Agreement.pdf'
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)

    const { error: updateErr } = await supabaseAdmin
      .from('pm_agreements')
      .update({ agreement_pdf_url: fileUrl, updated_at: new Date().toISOString() })
      .eq('id', agreementId)

    if (updateErr) {
      console.error('PM agreement URL update failed after Graph upload:', updateErr)
      return NextResponse.json({ error: 'File uploaded but DB update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, file_url: fileUrl, file_name: file.name })
  } catch (err: any) {
    console.error('PM agreement upload error:', err)
    return NextResponse.json({ error: err.message || 'Failed to upload PM agreement' }, { status: 500 })
  }
}
