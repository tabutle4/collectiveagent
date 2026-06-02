import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'
const VIDEOS_FOLDER = 'Videos'

// Get SharePoint site drive ID (cached in memory per cold start)
let cachedSiteId: string | null = null
let cachedDriveId: string | null = null

async function getSiteDriveId(token: string): Promise<{ siteId: string; driveId: string }> {
  if (cachedSiteId && cachedDriveId) return { siteId: cachedSiteId, driveId: cachedDriveId }

  const siteRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!siteRes.ok) throw new Error(`Failed to get SharePoint site: ${await siteRes.text()}`)
  const site = await siteRes.json()
  cachedSiteId = site.id

  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!driveRes.ok) throw new Error(`Failed to get SharePoint drive: ${await driveRes.text()}`)
  const drive = await driveRes.json()
  cachedDriveId = drive.id

  return { siteId: site.id, driveId: drive.id }
}

// Upload large file to SharePoint via resumable upload session
async function uploadToSharePoint(
  token: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  fileBuffer: Buffer
): Promise<string> {
  const itemPath = `${VIDEOS_FOLDER}/${folderPath}/${fileName}`

  // Create upload session
  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'rename',
          name: fileName,
        },
      }),
    }
  )

  if (!sessionRes.ok) {
    throw new Error(`Failed to create upload session: ${await sessionRes.text()}`)
  }

  const { uploadUrl } = await sessionRes.json()

  // Upload in 5MB chunks
  const chunkSize = 5 * 1024 * 1024
  let offset = 0
  let webUrl = ''

  while (offset < fileBuffer.length) {
    const end = Math.min(offset + chunkSize, fileBuffer.length)
    const chunk = fileBuffer.slice(offset, end)

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end - 1}/${fileBuffer.length}`,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
    })

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const result = await chunkRes.json()
      webUrl = result.webUrl || ''
    } else if (chunkRes.status !== 202) {
      throw new Error(`Upload chunk failed: ${chunkRes.status} ${await chunkRes.text()}`)
    }

    offset = end
  }

  return webUrl
}

export async function POST(req: NextRequest) {
  const authError = await requirePermission(req, 'can_manage_recordings')
  if (authError) return authError

  const { jobId, finalTitle, folder } = await req.json()

  if (!jobId || !finalTitle || !folder) {
    return NextResponse.json({ error: 'jobId, finalTitle, and folder are required' }, { status: 400 })
  }

  // Get the job
  const { data: job, error: fetchError } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'uploaded') {
    return NextResponse.json({ error: 'Already uploaded' }, { status: 409 })
  }

  // Mark as processing
  await supabaseAdmin
    .from('zoom_recording_jobs')
    .update({ status: 'processing', final_title: finalTitle, final_folder: folder })
    .eq('id', jobId)

  try {
    // Download MP4 from Zoom
    const zoomRes = await fetch(
      `${job.mp4_download_url}?access_token=${job.zoom_token}`
    )
    if (!zoomRes.ok) throw new Error(`Failed to download from Zoom: ${zoomRes.status}`)

    const arrayBuffer = await zoomRes.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const fileName = `${finalTitle}.mp4`

    // Upload to SharePoint
    const token = await getGraphToken()
    const { driveId } = await getSiteDriveId(token)
    const webUrl = await uploadToSharePoint(token, driveId, folder, fileName, fileBuffer)

    // Mark as uploaded
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({
        status: 'uploaded',
        sharepoint_url: webUrl,
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ ok: true, webUrl })
  } catch (err: any) {
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({ status: 'error', error_message: err.message })
      .eq('id', jobId)

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
