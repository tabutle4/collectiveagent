import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Returns a OneDrive resumable upload session URL.
// The client uploads the file DIRECTLY to that URL — Vercel never receives the file bytes.
// This bypasses Vercel's 4.5MB serverless body limit, allowing contracts and large PDFs.
//
// Flow:
//   1. Client POSTs { filename, file_size, content_type, transaction_id } here
//   2. We create the OneDrive folder if needed, then create an upload session
//   3. We return { upload_url, onedrive_path } to the client
//   4. Client PUTs the file directly to upload_url (Content-Range header for large files)
//   5. OneDrive returns the final item with webUrl
//   6. Client POSTs the webUrl to /api/uploads/complete to save it to the DB

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

async function ensureTransactionFolder(token: string, transactionId: string): Promise<string> {
  const rootFolder = process.env.ONEDRIVE_ROOT_FOLDER || 'Collective Agent'
  const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER!

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

  // Create Documents subfolder (Graph creates parents automatically)
  await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${rootFolder}/${folderPath}:/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Documents',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    }
  )

  // Save sharing URL if not already saved
  if (!txn.onedrive_folder_url) {
    const sharingRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${rootFolder}/${folderPath}:/createLink`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'view', scope: 'organization' }),
      }
    )
    const sharingData = await sharingRes.json()
    const sharingUrl = sharingData.link?.webUrl || null
    if (sharingUrl) {
      await supabase
        .from('transactions')
        .update({ onedrive_folder_url: sharingUrl })
        .eq('id', transactionId)
    }
  }

  return `${rootFolder}/${folderPath}/Documents`
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { filename, file_size, content_type, transaction_id } = body

    if (!filename || !content_type || !transaction_id) {
      return NextResponse.json(
        { error: 'filename, content_type, and transaction_id are required' },
        { status: 400 }
      )
    }

    const token = await getGraphToken()
    const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER!

    const folderPath = await ensureTransactionFolder(token, transaction_id)

    // Sanitize filename
    const safeName = filename.replace(/[/\\?%*:|"<>]/g, '-').trim()
    const fullPath = `${folderPath}/${safeName}`

    // Create an upload session — returns a URL the client can PUT to directly
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${fullPath}:/createUploadSession`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
            name: safeName,
          },
        }),
      }
    )

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({}))
      throw new Error(`Failed to create upload session: ${JSON.stringify(err)}`)
    }

    const session = await sessionRes.json()
    const uploadUrl = session.uploadUrl

    if (!uploadUrl) throw new Error('No upload URL returned from OneDrive')

    return NextResponse.json({
      upload_url: uploadUrl,
      onedrive_path: fullPath,
      filename: safeName,
    })
  } catch (err: any) {
    console.error('create-session error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
