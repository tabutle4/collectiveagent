import { NextRequest, NextResponse } from 'next/server'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SP_BASE = 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter'

const VIDEOS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5HhDhOCHtNrRZpFFzbL3M8m'
const DOCUMENTS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5EPy6Dyk4Y7SqWCeUeROfqY'
const AGENT_RESOURCES_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5FQj3gFKBeBS5JwuInEa4jG'

async function getAccessToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    }
  )
  const data = await res.json()
  return data.access_token
}

async function graphGet(token: string, path: string, cache = true) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: cache ? { revalidate: 300 } : { revalidate: 0 },
  })
  if (!res.ok) return null
  return res.json()
}

async function spGet(token: string, url: string, cache = true) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;odata=verbose',
    },
    next: cache ? { revalidate: 300 } : { revalidate: 0 },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()

    const token = await getAccessToken()

    // --- SEARCH MODE ---
    if (query) {
      const encoded = encodeURIComponent(query)
      const [videoResults, docResults, agentResResults] = await Promise.all([
        graphGet(token, `/drives/${VIDEOS_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`, false),
        graphGet(token, `/drives/${DOCUMENTS_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`, false),
        graphGet(token, `/drives/${AGENT_RESOURCES_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`, false),
      ])

      const videos = (videoResults?.value || [])
        .filter((item: any) => item.file)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime,
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
          folder: item.parentReference?.name || 'Video',
          type: 'video',
        }))

      const docs = [
        ...(docResults?.value || []),
        ...(agentResResults?.value || []),
      ]
        .filter((item: any) => item.file && !item.name?.startsWith('~'))
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime,
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
          category: item.parentReference?.name || 'General',
          type: 'document',
        }))

      return NextResponse.json({ searchResults: { videos, docs }, query })
    }

    // --- DEFAULT MODE ---

    // Video library folders
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

    // Recent recordings - get top 3 from each folder, then sort globally
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

    const top6 = recentVideos
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 6)

    // Fetch thumbnails in parallel
    const recentRecordings = await Promise.all(
      top6.map(async (video) => {
        try {
          const thumbData = await graphGet(token, `/drives/${VIDEOS_DRIVE_ID}/items/${video.id}/thumbnails`)
          const thumbnail = thumbData?.value?.[0]?.medium?.url || thumbData?.value?.[0]?.large?.url || null
          return { ...video, thumbnail }
        } catch {
          return video
        }
      })
    )

    // Recent resources - get folders then fetch files from each in parallel
    const agentResFoldersData = await graphGet(
      token,
      `/drives/${AGENT_RESOURCES_DRIVE_ID}/root/children?$select=id,name,folder&$top=50`
    )
    const agentResFolders = (agentResFoldersData?.value || []).filter((i: any) => i.folder)

    const folderFiles = await Promise.all(
      agentResFolders.map((folder: any) =>
        graphGet(
          token,
          `/drives/${AGENT_RESOURCES_DRIVE_ID}/items/${folder.id}/children?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$orderby=lastModifiedDateTime desc&$top=3`
        )
      )
    )

    const recentResources = folderFiles
      .flatMap((r: any) => r?.value || [])
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

    return NextResponse.json({ recentRecordings, recentResources, videoLibraryFolders })
  } catch (error: any) {
    console.error('Training center API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}