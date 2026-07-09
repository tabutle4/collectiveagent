import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getGraphToken } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { getEmailLayout, emailButton, emailSignature } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)
const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'
const MAX_ATTEMPTS = 6

async function getVideosDriveId(token: string): Promise<string> {
  const siteRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!siteRes.ok) throw new Error(`site: ${await siteRes.text()}`)
  const site = await siteRes.json()
  const drivesRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!drivesRes.ok) throw new Error(`drives: ${await drivesRes.text()}`)
  const drives = (await drivesRes.json()).value || []
  const videos = drives.find((d: any) => d.name === 'Videos' || d.webUrl?.toLowerCase().includes('/videos'))
  if (videos) return videos.id
  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!driveRes.ok) throw new Error(`drive: ${await driveRes.text()}`)
  return (await driveRes.json()).id
}

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
    const head = await fetch(dl, { method: 'GET', headers: { Range: 'bytes=0-1' } })
    return head.ok || head.status === 206
  } catch {
    return false
  }
}

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

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: pending, error } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('id, final_title, final_folder, sharepoint_url, sharepoint_item_id, link_verify_attempts')
      .eq('link_verify_pending', true)
      .eq('status', 'uploaded')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!pending || pending.length === 0) return NextResponse.json({ ok: true, checked: 0, sent: 0 })

    const token = await getGraphToken()
    const driveId = await getVideosDriveId(token)

    const adminEmail = process.env.RECORDING_ADMIN_EMAIL || 'office@collectiverealtyco.com'
    let sent = 0
    let escalated = 0

    for (const job of pending) {
      let ready = await verifyStreamResolves(token, driveId, job.sharepoint_item_id)

      if (!ready && job.sharepoint_item_id) {
        try {
          await renameAndBack(token, driveId, job.sharepoint_item_id, `${job.final_title}.mp4`)
          ready = await verifyStreamResolves(token, driveId, job.sharepoint_item_id)
        } catch (e) {
          console.error('heal failed:', e)
        }
      }

      const attempts = (job.link_verify_attempts || 0) + 1

      if (ready) {
        // Send the agent email now that the link works
        const emailHtml = getEmailLayout(
          `<p class="email-greeting">Hi Team,</p>
          <p style="margin-bottom:16px;">A new training recording is now available in the Training Center.</p>
          <div class="email-section">
            <h3>Recording Details</h3>
            <p><strong>${job.final_title}</strong></p>
            <p style="margin-top:8px;font-size:13px;color:#888;">SharePoint - ${job.final_folder}</p>
          </div>
          ${emailButton('Watch the Recording', job.sharepoint_url || 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter')}
          <p style="font-size:13px;color:#888;text-align:center;margin-top:8px;">The transcript will be available in SharePoint shortly after you open the video.</p>
          ${emailSignature('Collective Realty Co.', 'Training and Coaching Team')}`,
          { title: 'New Training Recording Available', preheader: job.final_title }
        )
        await resend.emails.send({
          from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
          to: 'agents@collectiverealtyco.com',
          subject: `New Recording: ${job.final_title}`,
          html: emailHtml,
        })
        await supabaseAdmin
          .from('zoom_recording_jobs')
          .update({ link_verify_pending: false, link_verify_attempts: attempts })
          .eq('id', job.id)
        sent++
      } else if (attempts >= MAX_ATTEMPTS) {
        // Give up auto-healing; notify admin for manual attention. Stop retrying.
        const adminHtml = getEmailLayout(
          `<p class="email-greeting">Heads up,</p>
          <p>A recording uploaded to SharePoint but its video link would not resolve after ${MAX_ATTEMPTS} automatic attempts. The agent notification was held. Please open the file in SharePoint and rename it (or re-upload) to restore the link, then notify agents manually if needed.</p>
          <div class="email-section">
            <h3>Recording</h3>
            <p><strong>${job.final_title}</strong></p>
            <p style="font-size:13px;color:#888;">SharePoint - ${job.final_folder}</p>
          </div>
          ${emailButton('Open in SharePoint', job.sharepoint_url || 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter')}
          ${emailSignature('Collective Agent', 'Automated Recording System')}`,
          { title: 'Recording link needs attention', preheader: job.final_title }
        )
        await resend.emails.send({
          from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
          to: adminEmail,
          subject: `Action needed: recording link broken - ${job.final_title}`,
          html: adminHtml,
        })
        await supabaseAdmin
          .from('zoom_recording_jobs')
          .update({ link_verify_pending: false, link_verify_attempts: attempts })
          .eq('id', job.id)
        escalated++
      } else {
        // Not ready yet, keep trying next run
        await supabaseAdmin
          .from('zoom_recording_jobs')
          .update({ link_verify_attempts: attempts })
          .eq('id', job.id)
      }
    }

    return NextResponse.json({ ok: true, checked: pending.length, sent, escalated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cron failed' }, { status: 500 })
  }
}
