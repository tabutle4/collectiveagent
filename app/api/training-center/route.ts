import { NextRequest, NextResponse } from 'next/server'

const SITE_ID = 'collectiverealtyco.sharepoint.com,89c05771-473e-4e65-a787-5a2b6e69775d,4351b2fa-6143-497c-89c5-c62185e28791'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const VIDEOS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5HhDhOCHtNrRZpFFzbL3M8m'
const DOCUMENTS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5EPy6Dyk4Y7SqWCeUeROfqY'
const AGENT_RESOURCES_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5FQj3gFKBeBS5JwuInEa4jG'

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
    next: { revalidate: 300 },
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

    // Get video library folders
    const videoRootData = await graphGet(
      token,
      `/drives/${VIDEOS_DRIVE_ID}/root/children?$select=id,name,webUrl,folder&$orderby=name asc`
    )
    const videoLibraryFolders = (videoRootData?.value || [])
      .filter((item: any) => item.folder)
      .map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        webUrl: folder.webUrl,
        childCount: folder.folder?.childCount || 0,
      }))

    // Get recent recordings from Videos drive
    const recentVideos: any[] = []
    for (const folder of videoLibraryFolders.slice(0, 12)) {
      const folderContents = await graphGet(
        token,
        `/drives/${VIDEOS_DRIVE_ID}/items/${folder.id}/children?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,size&$orderby=lastModifiedDateTime desc&$top=3`
      )
      const videos = (folderContents?.value || [])
        .filter((item: any) => item.file)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime,
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
          thumbnail: null,
          folder: folder.name,
          size: item.size,
        }))
      recentVideos.push(...videos)
    }

    // Sort and take top 6
    const top6 = recentVideos
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 6)

    // Fetch thumbnails for top 6 recordings in parallel
    const recentRecordings = await Promise.all(
      top6.map(async (video) => {
        try {
          const thumbData = await graphGet(
            token,
            `/drives/${VIDEOS_DRIVE_ID}/items/${video.id}/thumbnails`
          )
          const thumbnail = thumbData?.value?.[0]?.medium?.url || thumbData?.value?.[0]?.large?.url || null
          return { ...video, thumbnail }
        } catch {
          return video
        }
      })
    )

    // Get recently uploaded resources from Documents + Agent Resources drives
    const [docsData, agentResData] = await Promise.all([
      graphGet(
        token,
        `/drives/${DOCUMENTS_DRIVE_ID}/root/search(q='*')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$orderby=lastModifiedDateTime desc&$top=30`
      ),
      graphGet(
        token,
        `/drives/${AGENT_RESOURCES_DRIVE_ID}/root/search(q='*')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$orderby=lastModifiedDateTime desc&$top=30`
      ),
    ])

    const allResources = [
      ...(docsData?.value || []),
      ...(agentResData?.value || []),
    ]

    const recentResources = allResources
      .filter((item: any) =>
        item.file &&
        !item.name?.startsWith('~') &&
        !item.name?.endsWith('.mp4') &&
        !item.name?.endsWith('.mov')
      )
      .sort((a: any, b: any) =>
        new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime()
      )
      .slice(0, 8)
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
        category: item.parentReference?.name || 'General',
      }))

    return NextResponse.json({
      recentRecordings,
      recentResources,
      videoLibraryFolders,
    })
  } catch (error: any) {
    console.error('Training center API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}