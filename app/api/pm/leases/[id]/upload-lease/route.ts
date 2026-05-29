import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { graphClient } from '@/lib/microsoft-graph'

// Upload (or replace) the lease PDF for a lease. The MS Graph PUT to a path
// overwrites by default, so re-uploading with the same filename replaces the
// existing file in OneDrive. We mirror that by writing the new URL onto
// pm_leases.lease_pdf_url, which is read by the tenant portal.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id: leaseId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    // Server-side PDF guard. Column is named lease_pdf_url and the OneDrive
    // file is stored as "Lease.pdf", so non-PDF content here would silently
    // mislabel the file. Accept either a proper application/pdf MIME or a
    // .pdf extension (since some browsers send octet-stream).
    const looksLikePdf =
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name)
    if (!looksLikePdf) {
      return NextResponse.json(
        { error: 'Lease must be a PDF file' },
        { status: 400 }
      )
    }

    // Pull the lease so we can name the folder by property + tenant.
    const { data: lease, error: leaseErr } = await supabaseAdmin
      .from('pm_leases')
      .select(`
        id, lease_pdf_url,
        managed_properties:property_id ( id, property_address ),
        tenants:tenant_id ( id, first_name, last_name )
      `)
      .eq('id', leaseId)
      .single()

    if (leaseErr || !lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 })
    }

    const property: any = Array.isArray(lease.managed_properties)
      ? lease.managed_properties[0]
      : lease.managed_properties
    const tenant: any = Array.isArray(lease.tenants)
      ? lease.tenants[0]
      : lease.tenants

    if (!property || !tenant) {
      return NextResponse.json({ error: 'Lease is missing property or tenant link' }, { status: 400 })
    }

    // Deterministic folder per lease so re-uploads land in the same place and
    // the PUT-on-path overwrite behavior of MS Graph cleanly replaces the file.
    const safeAddress = property.property_address.replace(/[/\\?%*:|"<>]/g, '-')
    const safeTenant = `${tenant.first_name} ${tenant.last_name}`.replace(/[/\\?%*:|"<>]/g, '-')
    const folderPath = `PM Documents/Leases/${safeAddress}-${safeTenant}-${leaseId}`

    // Ensure folder exists (idempotent: createFolder no-ops if it does).
    await graphClient.createFolder(folderPath)

    // Always store the lease as "Lease.pdf" so re-upload overwrites.
    const fileName = 'Lease.pdf'
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)

    // Persist the new URL on the lease row.
    const { error: updateErr } = await supabaseAdmin
      .from('pm_leases')
      .update({ lease_pdf_url: fileUrl, updated_at: new Date().toISOString() })
      .eq('id', leaseId)

    if (updateErr) {
      console.error('Lease URL update failed after Graph upload:', updateErr)
      return NextResponse.json({ error: 'File uploaded but DB update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, file_url: fileUrl, file_name: file.name })
  } catch (err: any) {
    console.error('Lease upload error:', err)
    return NextResponse.json({ error: err.message || 'Failed to upload lease' }, { status: 500 })
  }
}
