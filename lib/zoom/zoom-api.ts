// Shared Zoom API access. getZoomAccessToken was defined identically in three
// routes before this; they all import it from here now.

// A meeting UUID must be double encoded when it starts with '/' or contains '//'.
export function encodeMeetingUuid(meetingUuid: string): string {
  const encoded = encodeURIComponent(meetingUuid)
  return (meetingUuid.startsWith('/') || meetingUuid.includes('//'))
    ? encodeURIComponent(encoded)
    : encoded
}

export async function getZoomAccessToken(): Promise<string | null> {
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

export interface ZoomRecordingFiles {
  files: any[]
  shareUrl: string
}

// Reads a meeting's recording files with an account level OAuth token. Zoom
// documents this as the way to reach a recording once the webhook's 24 hour
// download_token has expired.
// https://developers.zoom.us/blog/meeting-api-querying-tips-part4/
export async function fetchMeetingRecordings(
  meetingUuid: string,
  accessToken: string
): Promise<ZoomRecordingFiles | null> {
  try {
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${encodeMeetingUuid(meetingUuid)}/recordings`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return { files: data.recording_files || [], shareUrl: data.share_url || '' }
  } catch {
    return null
  }
}

// Same preference the webhook applies: the speaker view recording when Zoom made
// one, otherwise any MP4.
export function pickMp4Segments(files: any[]): any[] {
  const preferred = files.filter(
    (f: any) => f.file_type === 'MP4' && f.recording_type === 'shared_screen_with_speaker_view'
  )
  return preferred.length > 0 ? preferred : files.filter((f: any) => f.file_type === 'MP4')
}
