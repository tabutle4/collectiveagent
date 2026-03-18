import { NextRequest, NextResponse } from 'next/server'

const SITE_ID = 'collectiverealtyco.sharepoint.com,89c05771-473e-4e65-a787-5a2b6e69775d,4351b2fa-6143-497c-89c5-c62185e28791'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID!
  const clientId = process.env.MICROSOFT_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    }
  )
  const data = await res.json()
  return data.access_token
}

async function graphGet(token: string, path: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 }, // cache 5 minutes
  })
  if (!res.ok) {
    console.error(`Graph API error for ${path}:`, res.status, await res.text())
    return null
  }
  return res.json()
}

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken()

    // Get all drives on the site to find the Video Library and Documents library
    const drivesData = await graphGet(token, `/sites/${SITE_ID}/drives`)
    const drives = drivesData?.value || []

    // Find the main document library (usually "Documents" or "Site Assets")
    const docDrive = drives.find((d: any) =>
      d.name === 'Documents' || d.name === 'Site Pages' || d.driveType === 'documentLibrary'
    ) || drives[0]

    // Find the video library - look for one with "Video" in the name
    const videoDrive = drives.find((d: any) =>
      d.name?.toLowerCase().includes('video') ||
      d.name?.toLowerCase().includes('recording')
    ) || docDrive

    let recentRecordings: any[] = []
    let recentResources: any[] = []
    let videoLibraryFolders: any[] = []
    let allDrives = drives.map((d: any) => ({ id: d.id, name: d.name }))

    // Get recent recordings - search across all drives for video files
    if (videoDrive) {
      const recordingsData = await graphGet(
        token,
        `/sites/${SITE_ID}/drives/${videoDrive.id}/root/children`
      )
      const items = recordingsData?.value || []

      // Get folders (categories) for the video library sidebar
      videoLibraryFolders = items
        .filter((item: any) => item.folder)
        .map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          webUrl: folder.webUrl,
          childCount: folder.folder?.childCount || 0,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name))

      // Get recent video files - search inside folders
      const recentVideos: any[] = []
      for (const folder of videoLibraryFolders.slice(0, 10)) {
        const folderContents = await graphGet(
          token,
          `/sites/${SITE_ID}/drives/${videoDrive.id}/items/${folder.id}/children?$orderby=lastModifiedDateTime desc&$top=5`
        )
        const videos = (folderContents?.value || [])
          .filter((item: any) => item.file && (
            item.name?.endsWith('.mp4') ||
            item.name?.endsWith('.mov') ||
            item.name?.endsWith('.avi') ||
            item.video
          ))
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            webUrl: item.webUrl,
            lastModified: item.lastModifiedDateTime,
            lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
            thumbnail: item.thumbnails?.[0]?.medium?.url || null,
            folder: folder.name,
            size: item.size,
          }))
        recentVideos.push(...videos)
      }

      // Sort by most recent and take top 6
      recentRecordings = recentVideos
        .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
        .slice(0, 6)
    }

    // Get recently uploaded resources from Documents library
    if (docDrive) {
      // Search for recently modified non-video files
      const recentData = await graphGet(
        token,
        `/sites/${SITE_ID}/drives/${docDrive.id}/root/search(q='*')?$orderby=lastModifiedDateTime desc&$top=20&$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,folder,parentReference`
      )

      recentResources = (recentData?.value || [])
        .filter((item: any) =>
          item.file &&
          !item.name?.endsWith('.mp4') &&
          !item.name?.endsWith('.mov') &&
          !item.name?.startsWith('~')
        )
        .slice(0, 6)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime,
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
          category: item.parentReference?.name || 'General',
        }))
    }

    return NextResponse.json({
      recentRecordings,
      recentResources,
      videoLibraryFolders,
      drives: allDrives,
    })
  } catch (error: any) {
    console.error('Training center API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}