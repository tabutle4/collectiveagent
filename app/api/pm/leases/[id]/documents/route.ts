import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { graphClient } from '@/lib/microsoft-graph'

// GET: list all named docs for a lease (used by admin lease detail page).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id: leaseId } = await params

    const { data, error } = await supabaseAdmin
      .from('pm_lease_documents')
      .select('id, document_name, file_url, file_name, uploaded_at, uploaded_by')
      .eq('lease_id', leaseId)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ documents: data || [] })
  } catch (err: any) {
    console.error('List lease documents error:', err)
    return NextResponse.json({ error: err.message || 'Failed to list documents' }, { status: 500 })
  }
}

// POST: upload a named document. Same (lease_id, document_name) overwrites
// both the OneDrive file (PUT to the same path) and the DB row (UPSERT on the
// unique constraint). Typing an existing name = overwrite, by design.
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
    const documentName = (formData.get('document_name') as string || '').trim()

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!documentName) {
      return NextResponse.json({ error: 'document_name is required' }, { status: 400 })
    }

    const { data: lease, error: leaseErr } = await supabaseAdmin
      .from('pm_leases')
      .select(`
        id,
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

    // Same folder as the lease itself, but a different filename derived from
    // the user-typed document name. This keeps the OneDrive directory tidy
    // per lease and means uploading the same name overwrites in place.
    const safeAddress = property.property_address.replace(/[/\\?%*:|"<>]/g, '-')
    const safeTenant = `${tenant.first_name} ${tenant.last_name}`.replace(/[/\\?%*:|"<>]/g, '-')
    const folderPath = `PM Documents/Leases/${safeAddress}-${safeTenant}-${leaseId}`

    // Derive a safe filename. Keep the user-typed document name as the visible
    // base name; append the uploaded file's original extension if present.
    const extMatch = file.name.match(/\.[a-zA-Z0-9]{1,8}$/)
    const ext = extMatch ? extMatch[0] : ''
    const safeDocName = documentName.replace(/[/\\?%*:|"<>]/g, '-')
    const fileName = `${safeDocName}${ext}`

    await graphClient.createFolder(folderPath)
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Before writing, check if an existing doc with this name has a different
    // OneDrive path (e.g., user re-uploads with a different file extension).
    // If so, delete the old file so we don't leave orphans in OneDrive.
    const newOnedrivePath = `${folderPath}/${fileName}`
    const { data: existingDoc } = await supabaseAdmin
      .from('pm_lease_documents')
      .select('onedrive_path')
      .eq('lease_id', leaseId)
      .eq('document_name', documentName)
      .maybeSingle()

    if (existingDoc && existingDoc.onedrive_path && existingDoc.onedrive_path !== newOnedrivePath) {
      try {
        await graphClient.deleteFile(existingDoc.onedrive_path)
      } catch (cleanupErr: any) {
        // Best-effort - don't block the new upload if the old file is already
        // gone or Graph is having a moment. The DB upsert below still proceeds.
        console.warn('Old lease document cleanup failed (continuing):', cleanupErr?.message)
      }
    }

    const { fileUrl } = await graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)

    // Upsert on (lease_id, document_name) unique constraint so typing the same
    // name updates the existing row rather than creating a duplicate.
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from('pm_lease_documents')
      .upsert(
        {
          lease_id: leaseId,
          document_name: documentName,
          file_url: fileUrl,
          file_name: file.name,
          onedrive_path: newOnedrivePath,
          uploaded_by: auth.user.id,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'lease_id,document_name' }
      )
      .select('id, document_name, file_url, file_name, uploaded_at')
      .single()

    if (upsertErr) {
      console.error('Lease document upsert failed:', upsertErr)
      return NextResponse.json({ error: 'File uploaded but DB update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: upserted })
  } catch (err: any) {
    console.error('Lease document upload error:', err)
    return NextResponse.json({ error: err.message || 'Failed to upload document' }, { status: 500 })
  }
}
