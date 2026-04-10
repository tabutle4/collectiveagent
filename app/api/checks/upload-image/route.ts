import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Get Graph access token using client credentials (same auth your calendar route uses)
async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Graph token')
  return data.access_token
}

// Upload a file to OneDrive using Graph API
// path example: "Checks/Unlinked Checks/check-123-2026-03-19.jpg"
// or: "Transactions/123 Main St/Checks/check-123-2026-03-19.jpg"
async function uploadToOneDrive(
  token: string,
  folderPath: string, // relative path within the root folder e.g. "Transactions/123 Main St/Checks"
  filename: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  // Uses the OneDrive user account - same pattern as listing coordination
  const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER! // your M365 email
  const rootFolder = process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'

  const fullPath = `${rootFolder}/${folderPath}/${filename}`.replace(/\/+/g, '/') // normalize double slashes

  // Upload via the user's OneDrive - simple PUT for files under 4MB
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

  // Return the webUrl - this is the clickable OneDrive link
  return driveItem.webUrl
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const checkId = formData.get('check_id') as string | null
    const transactionFolderPath = formData.get('transaction_folder_path') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = new Date().toISOString().slice(0, 10) // 2026-03-19
    const filename = `check-${checkId || 'new'}-${timestamp}.${ext}`

    // Determine OneDrive folder:
    // - If linked to a transaction with an existing OneDrive folder → upload there
    // - Otherwise → upload to "Checks/Unlinked Checks"
    let folderPath: string
    if (transactionFolderPath) {
      // Strip the root folder prefix if present, keep the relative path
      // e.g. "Collective Agent/Transactions/123 Main St" → "Transactions/123 Main St/Checks"
      const cleanPath = transactionFolderPath
        .replace(new RegExp(`^${process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'}/`), '')
        .replace(/\/+$/, '')
      folderPath = `${cleanPath}/Checks`
    } else {
      folderPath = 'Checks/Unlinked Checks'
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const token = await getGraphToken()
    const fileUrl = await uploadToOneDrive(token, folderPath, filename, fileBuffer, file.type)

    // Save URL to the check record if check_id provided
    if (checkId) {
      await supabase.from('checks_received').update({ check_image_url: fileUrl }).eq('id', checkId)
    }

    return NextResponse.json({ url: fileUrl, filename, folder: folderPath })
  } catch (err: any) {
    console.error('Check image upload error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
