import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { getGraphToken } from '@/lib/microsoft-graph'

// Create a transaction folder in OneDrive and save the URL to the transaction row.
// Returns the relative folder path (without root prefix) to use for upload.
async function ensureTransactionFolder(
  token: string,
  transactionId: string
): Promise<string> {
  const rootFolder = process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'
  const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER!

  // Load the transaction to get address and existing folder URL
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, property_address, onedrive_folder_url')
    .eq('id', transactionId)
    .single()

  if (!txn) throw new Error('Transaction not found')

  const sanitizedAddress = (txn.property_address || 'Unknown Address')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
  const folderPath = `Transactions/${sanitizedAddress}-${transactionId}`

  // Early exit: folder already created on a previous upload — skip all Graph folder calls
  if (txn.onedrive_folder_url) return folderPath

  // First upload for this transaction: create the Checks subfolder in OneDrive
  await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${rootFolder}/${folderPath}:/children`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Checks',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    }
  )

  // Get a sharing link for the transaction folder root
  const sharingRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${rootFolder}/${folderPath}:/createLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'view', scope: 'organization' }),
    }
  )
  const sharingData = await sharingRes.json()
  const sharingUrl = sharingData.link?.webUrl || null

  // Save to transaction row so future uploads skip folder creation
  if (sharingUrl) {
    await supabase
      .from('transactions')
      .update({ onedrive_folder_url: sharingUrl })
      .eq('id', transactionId)
  }

  return folderPath
}

// Upload a file to OneDrive using Graph API
async function uploadToOneDrive(
  token: string,
  folderPath: string,
  filename: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER!
  const rootFolder = process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'

  const fullPath = `${rootFolder}/${folderPath}/${filename}`.replace(/\/+/g, '/')

  const uploadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${fullPath}:/content`

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: fileBuffer as unknown as BodyInit,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(`OneDrive upload failed: ${uploadRes.status} ${JSON.stringify(err)}`)
  }

  const driveItem = await uploadRes.json()
  return driveItem.webUrl
}

export async function POST(request: NextRequest) {
  // Accept either permission: check image uploads need can_manage_checks,
  // compliance doc uploads need can_review_compliance
  const authChecks = await requirePermission(request, 'can_manage_checks')
  const authDocs = await requirePermission(request, 'can_review_compliance')
  if (authChecks.error && authDocs.error) return authChecks.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const checkId = formData.get('check_id') as string | null
    const transactionId = formData.get('transaction_id') as string | null
    const subfolder = (formData.get('subfolder') as string | null) || 'Checks'
    // transactionFolderPath kept for backward compat but we now prefer transaction_id
    const transactionFolderPath = formData.get('transaction_folder_path') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be an image or PDF' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = new Date().toISOString().slice(0, 10)
    // For compliance doc uploads (no checkId), preserve the filename the client set
    // (e.g. "Sales Contract - 2026-06-08.pdf"). For check uploads, use the check-based name.
    const filename = checkId
      ? `check-${checkId}-${timestamp}.${ext}`
      : (file.name && file.name !== 'blob' ? file.name : `doc-${timestamp}.${ext}`)

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const token = await getGraphToken()

    // Determine OneDrive folder path:
    // 1. If transaction_id provided → ensure folder exists for that transaction
    // 2. If transactionFolderPath provided (legacy) → use it
    // 3. Fallback → Checks/Unlinked Checks
    let folderPath: string
    if (transactionId) {
      const txnRelPath = await ensureTransactionFolder(token, transactionId)
      folderPath = `${txnRelPath}/${subfolder}`
    } else if (transactionFolderPath) {
      const rootFolder = process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'
      const cleanPath = transactionFolderPath
        .replace(new RegExp(`^${rootFolder}/`), '')
        .replace(/\/+$/, '')
      folderPath = `${cleanPath}/${subfolder}`
    } else {
      folderPath = 'Checks/Unlinked Checks'
    }

    const fileUrl = await uploadToOneDrive(token, folderPath, filename, fileBuffer, file.type)

    if (checkId) {
      await supabase.from('checks_received').update({ check_image_url: fileUrl }).eq('id', checkId)
    }

    return NextResponse.json({ url: fileUrl, filename, folder: folderPath })
  } catch (err: any) {
    console.error('Check image upload error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
