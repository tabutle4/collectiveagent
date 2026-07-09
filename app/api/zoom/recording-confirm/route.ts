import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout, emailButton, emailSignature } from '@/lib/email/layout'

export const maxDuration = 300

const resend = new Resend(process.env.RESEND_API_KEY)
const ONEDRIVE_USER = process.env.MICROSOFT_ONEDRIVE_USER!
const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'

async function getZoomAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    if (!res.ok) return null
    const { access_token } = await res.json()
    return access_token || null
  } catch { return null }
}

async function deleteZoomRecording(meetingId: string, zoomToken: string): Promise<void> {
  try {
    const encoded = encodeURIComponent(meetingId)
    const encodedMeetingId = (meetingId.startsWith('/') || meetingId.includes('//'))
      ? encodeURIComponent(encoded) : encoded
    await fetch(`https://api.zoom.us/v2/meetings/${encodedMeetingId}/recordings`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${zoomToken}` },
    })
  } catch (e) {
    console.error('Failed to delete Zoom recording:', e)
  }
}

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

  const drivesRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!drivesRes.ok) throw new Error(`Failed to get SharePoint drives: ${await drivesRes.text()}`)
  const drivesData = await drivesRes.json()
  const drives = drivesData.value || []

  const videosDrive = drives.find((d: any) =>
    d.name === 'Videos' || d.webUrl?.toLowerCase().includes('/videos')
  )

  if (videosDrive) {
    cachedDriveId = videosDrive.id
  } else {
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!driveRes.ok) throw new Error(`Failed to get SharePoint drive: ${await driveRes.text()}`)
    const drive = await driveRes.json()
    cachedDriveId = drive.id
  }

  return { siteId: site.id, driveId: cachedDriveId! }
}

// Download from OneDrive and stream upload to SharePoint in chunks
async function moveToSharePoint(
  token: string,
  driveId: string,
  oneDriveItemId: string,
  folderPath: string,
  fileName: string
): Promise<{ webUrl: string; itemId: string }> {
  // Get OneDrive download URL
  const itemRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${oneDriveItemId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!itemRes.ok) throw new Error(`Failed to get OneDrive item: ${await itemRes.text()}`)
  const item = await itemRes.json()
  const fileSize = item.size || 0
  const downloadUrl = item['@microsoft.graph.downloadUrl']
  if (!downloadUrl) throw new Error('No download URL on OneDrive item')

  // Create SharePoint upload session
  const itemPath = `${folderPath}/${fileName}`
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
  if (!sessionRes.ok) throw new Error(`Failed to create SharePoint upload session: ${await sessionRes.text()}`)
  const { uploadUrl } = await sessionRes.json()

  // Stream from OneDrive to SharePoint in 10MB chunks
  const chunkSize = 10 * 1024 * 1024
  let offset = 0
  let webUrl = ''
  let itemId = ''

  while (offset < fileSize) {
    const end = Math.min(offset + chunkSize - 1, fileSize - 1)
    const chunkDownload = await fetch(downloadUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
    })
    if (!chunkDownload.ok && chunkDownload.status !== 206) {
      throw new Error(`OneDrive chunk download failed: ${chunkDownload.status}`)
    }
    const chunk = Buffer.from(await chunkDownload.arrayBuffer())

    const chunkUpload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end}/${fileSize}`,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
    })

    if (chunkUpload.status === 200 || chunkUpload.status === 201) {
      const result = await chunkUpload.json()
      webUrl = result.webUrl || ''
      itemId = result.id || ''
    } else if (chunkUpload.status !== 202) {
      throw new Error(`SharePoint chunk upload failed: ${chunkUpload.status} ${await chunkUpload.text()}`)
    }

    offset = end + 1
  }

  return { webUrl, itemId }
}

// Verify file exists in SharePoint by checking its webUrl path
async function verifySharePointFile(token: string, driveId: string, folderPath: string, fileName: string): Promise<boolean> {
  try {
    const itemPath = `${folderPath}/${fileName}`
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${itemPath}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return res.ok
  } catch {
    return false
  }
}

// Verify the file's stream reference is actually resolvable (not just that it exists).
// Newly API-uploaded SharePoint files sometimes have a broken stream/preview reference
// until a rename forces SharePoint to re-register it. We check the downloadUrl resolves.
async function verifyStreamResolves(token: string, driveId: string, itemId: string): Promise<boolean> {
  try {
    if (!itemId) return false
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    const dl = data['@microsoft.graph.downloadUrl']
    if (!dl) return false
    // Confirm the pre-authenticated URL actually serves content
    const head = await fetch(dl, { method: 'GET', headers: { Range: 'bytes=0-1' } })
    return head.ok || head.status === 206
  } catch {
    return false
  }
}

// Force SharePoint to re-register a file's stream reference by renaming it and back.
// Returns the (possibly unchanged) final name.
async function renameAndBack(token: string, driveId: string, itemId: string, finalName: string): Promise<void> {
  const tempName = `_healing_${Date.now()}_${finalName}`
  const patch = async (name: string) =>
    fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  await patch(tempName)
  await patch(finalName)
}

// Delete file from OneDrive
async function deleteFromOneDrive(token: string, itemId: string): Promise<void> {
  try {
    await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${itemId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    )
  } catch (e) {
    console.error('Failed to delete OneDrive file:', e)
  }
}

function toStreamUrl(webUrl: string): string {
  try {
    const url = new URL(webUrl)
    const decoded = decodeURIComponent(url.pathname)
    const streamId = encodeURIComponent(decoded)
    return `https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/_layouts/15/stream.aspx?id=${streamId}`
  } catch {
    return webUrl
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { jobId, finalTitle, folder, description = '', sendAgentEmail = true } = await req.json()

  if (!jobId || !finalTitle || !folder) {
    return NextResponse.json({ error: 'jobId, finalTitle, and folder are required' }, { status: 400 })
  }

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
    const token = await getGraphToken()
    const { driveId } = await getSiteDriveId(token)
    const fileName = `${finalTitle}.mp4`

    let rawUrl = ''
    let sharePointItemId = ''

    if (job.onedrive_item_id) {
      // Upload from OneDrive to SharePoint
      const moveResult = await moveToSharePoint(token, driveId, job.onedrive_item_id, folder, fileName)
      rawUrl = moveResult.webUrl
      sharePointItemId = moveResult.itemId

      // Verify file is in SharePoint before deleting from OneDrive
      const verified = await verifySharePointFile(token, driveId, folder, fileName)
      if (!verified) throw new Error('SharePoint file verification failed after upload')

      // Delete from OneDrive
      await deleteFromOneDrive(token, job.onedrive_item_id)

    } else {
      // Fallback: stream from Zoom to SharePoint in chunks (no full-file buffering)
      const headRes = await fetch(`${job.mp4_download_url}?access_token=${job.zoom_token}`, { method: 'HEAD' })
      if (!headRes.ok) throw new Error(`Failed to reach Zoom file: ${headRes.status}`)
      const fileSize = Number(headRes.headers.get('content-length') || 0)
      if (!fileSize) throw new Error('Could not determine Zoom file size')

      const itemPath = `${folder}/${fileName}`
      const sessionRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${itemPath}:/createUploadSession`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } }),
        }
      )
      if (!sessionRes.ok) throw new Error(`Failed to create upload session: ${await sessionRes.text()}`)
      const { uploadUrl } = await sessionRes.json()

      const chunkSize = 10 * 1024 * 1024
      let offset = 0
      while (offset < fileSize) {
        const end = Math.min(offset + chunkSize - 1, fileSize - 1)
        const chunkDownload = await fetch(`${job.mp4_download_url}?access_token=${job.zoom_token}`, {
          headers: { Range: `bytes=${offset}-${end}` },
        })
        if (!chunkDownload.ok && chunkDownload.status !== 206) {
          throw new Error(`Zoom chunk download failed: ${chunkDownload.status}`)
        }
        const chunk = Buffer.from(await chunkDownload.arrayBuffer())

        const chunkRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${offset}-${end}/${fileSize}`,
            'Content-Length': String(chunk.length),
          },
          body: chunk,
        })
        if (chunkRes.status === 200 || chunkRes.status === 201) {
          const result = await chunkRes.json()
          rawUrl = result.webUrl || ''
          sharePointItemId = result.id || ''
        } else if (chunkRes.status !== 202) {
          throw new Error(`SharePoint chunk upload failed: ${chunkRes.status} ${await chunkRes.text()}`)
        }
        offset = end + 1
      }
    }

    const webUrl = toStreamUrl(rawUrl)

    // Read fresh zoom_summary from DB (stored by recording-summary route on page load)
    const { data: freshJob } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('zoom_summary')
      .eq('id', jobId)
      .single()

    // Build description: use what user sent, or build from title + summary
    let finalDescription = description?.trim() || ''
    if (!finalDescription) {
      const storedSummary = freshJob?.zoom_summary?.trim() || ''
      finalDescription = storedSummary ? `${finalTitle}\n\n${storedSummary}` : finalTitle
    }

    // Delete from Zoom now that transcript/summary are safely stored in DB
    if (job.meeting_id) {
      const zoomToken = await getZoomAccessToken()
      if (zoomToken) await deleteZoomRecording(job.meeting_id, zoomToken)
    }

    // Set description on the SharePoint file if provided
    if (finalDescription && rawUrl) {
      try {
        const graphToken2 = await getGraphToken()
        // Get site and Videos drive
        const site2Res = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}`,
          { headers: { Authorization: `Bearer ${graphToken2}` } }
        )
        if (site2Res.ok) {
          const site2 = await site2Res.json()
          const drives2Res = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${site2.id}/drives`,
            { headers: { Authorization: `Bearer ${graphToken2}` } }
          )
          if (drives2Res.ok) {
            const drives2Data = await drives2Res.json()
            const videosDrive2 = (drives2Data.value || []).find((d: any) => d.name === 'Videos')
            if (videosDrive2) {
              const encodedPath = encodeURIComponent(folder) + '/' + encodeURIComponent(finalTitle + '.mp4')
              await fetch(
                `https://graph.microsoft.com/v1.0/drives/${videosDrive2.id}/root:/${encodedPath}`,
                {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${graphToken2}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ description: finalDescription }),
                }
              )
            }
          }
        }
      } catch (e) {
        console.error('Failed to set SharePoint description:', e)
      }
    }

    // Verify the stream link actually resolves. Newly uploaded SharePoint files
    // sometimes have a broken stream reference until a rename forces re-registration.
    let linkReady = await verifyStreamResolves(token, driveId, sharePointItemId)
    if (!linkReady && sharePointItemId) {
      // Self-heal: rename the file and back to force SharePoint to re-register it.
      try {
        await renameAndBack(token, driveId, sharePointItemId, `${finalTitle}.mp4`)
        linkReady = await verifyStreamResolves(token, driveId, sharePointItemId)
      } catch (e) {
        console.error('rename-and-back heal failed:', e)
      }
    }

    // Mark as uploaded. If the link still isn't ready, flag it so the cron retries
    // and holds the agent email until it resolves.
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({
        status: 'uploaded',
        sharepoint_url: webUrl,
        uploaded_at: new Date().toISOString(),
        onedrive_url: null,
        onedrive_item_id: null,
        sharepoint_item_id: sharePointItemId || null,
        link_verify_pending: linkReady ? false : true,
        link_verify_attempts: 0,
      })
      .eq('id', jobId)

    // If the link isn't ready, hold the agent email — the cron will send it once
    // the link resolves (or notify admin if it never does).
    if (!linkReady) {
      return NextResponse.json({ ok: true, webUrl, linkPending: true })
    }

    // Email agents
    const emailHtml = getEmailLayout(
      `<p class="email-greeting">Hi Team,</p>
      <p style="margin-bottom:16px;">A new training recording is now available in the Training Center.</p>
      <div class="email-section">
        <h3>Recording Details</h3>
        <p><strong>${finalTitle}</strong></p>
        <p style="margin-top:8px;font-size:13px;color:#888;">SharePoint - ${folder}</p>
      </div>
      ${emailButton('Watch the Recording', webUrl || 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter')}
      <p style="font-size:13px;color:#888;text-align:center;margin-top:8px;">The transcript will be available in SharePoint shortly after you open the video.</p>
      ${emailSignature('Collective Realty Co.', 'Training and Coaching Team')}`,
      {
        title: 'New Training Recording Available',
        preheader: finalTitle,
      }
    )

    if (sendAgentEmail) await resend.emails.send({
      from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
      to: 'agents@collectiverealtyco.com',
      subject: `New Recording: ${finalTitle}`,
      html: emailHtml,
    })

    return NextResponse.json({ ok: true, webUrl })

  } catch (err: any) {
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({ status: 'error', error_message: err.message })
      .eq('id', jobId)

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


