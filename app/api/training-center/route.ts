import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SHAREPOINT_BASE = 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter'

const VIDEOS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5HhDhOCHtNrRZpFFzbL3M8m'
const DOCUMENTS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5EPy6Dyk4Y7SqWCeUeROfqY'
const AGENT_RESOURCES_DRIVE_ID =
  'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5FQj3gFKBeBS5JwuInEa4jG'

// Site ID for the Training Center
const SITE_ID = 'collectiverealtyco.sharepoint.com,893f5771-473e-4e65-a787-6a2b6e69775d,4351b2fa-6143-497c-89c5-c62185e28791'

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
  if (!res.ok) {
    console.error(`Graph GET failed: ${path}`, res.status, await res.text().catch(() => ''))
    return null
  }
  return res.json()
}

// Score result by how well name matches query (higher = more relevant)
function relevanceScore(name: string, query: string): number {
  const n = name.toLowerCase().replace(/\.(mp4|mov|avi|webm|pdf|docx|xlsx|pptx|doc|xls|aspx)$/i, '')
  const q = query.toLowerCase()
  if (n === q) return 100
  if (n.startsWith(q)) return 80
  if (n.includes(q)) return 60
  // Check individual words
  const words = q.split(/\s+/)
  const matchedWords = words.filter(w => n.includes(w))
  return (matchedWords.length / words.length) * 40
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()
    const token = await getAccessToken()

    // --- SEARCH MODE ---
    if (query) {
      const encoded = encodeURIComponent(query)

      // Search drives (videos, documents, resources) in parallel
      // Also fetch all SitePages to filter client-side (most reliable method)
      const [videoResults, docResults, agentResResults, sitePagesData] = await Promise.all([
        graphGet(
          token,
          `/drives/${VIDEOS_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`,
          false
        ),
        graphGet(
          token,
          `/drives/${DOCUMENTS_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`,
          false
        ),
        graphGet(
          token,
          `/drives/${AGENT_RESOURCES_DRIVE_ID}/root/search(q='${encoded}')?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,parentReference&$top=25`,
          false
        ),
        // Fetch SitePages list items - filter client-side
        getSitePages(token, query),
      ])

      // Combine all results into one list, sorted by relevance
      const allResults = [
        // Pages (from SitePages list)
        ...(sitePagesData || []),
        // Videos
        ...(videoResults?.value || [])
          .filter((item: any) => item.file)
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            webUrl: item.webUrl,
            lastModified: item.lastModifiedDateTime,
            lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
            folder: item.parentReference?.name || 'Video',
            category: item.parentReference?.name || 'Video',
            type: 'video' as const,
            score: relevanceScore(item.name, query),
          })),
        // Documents
        ...[...(docResults?.value || []), ...(agentResResults?.value || [])]
          .filter((item: any) => item.file && !item.name?.startsWith('~'))
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            webUrl: item.webUrl,
            lastModified: item.lastModifiedDateTime,
            lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
            folder: item.parentReference?.name || 'General',
            category: item.parentReference?.name || 'General',
            type: 'document' as const,
            score: relevanceScore(item.name, query),
          })),
      ].sort((a, b) => b.score - a.score)

      return NextResponse.json({ searchResults: allResults, query })
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

    // Recent recordings
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

    const recentRecordings = await Promise.all(
      top6.map(async video => {
        try {
          const thumbData = await graphGet(
            token,
            `/drives/${VIDEOS_DRIVE_ID}/items/${video.id}/thumbnails`
          )
          const thumbnail =
            thumbData?.value?.[0]?.medium?.url || thumbData?.value?.[0]?.large?.url || null
          return { ...video, thumbnail }
        } catch {
          return video
        }
      })
    )

    // Recent resources
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
      .filter(
        (item: any) =>
          item.file &&
          !item.name?.startsWith('~') &&
          !item.name?.endsWith('.mp4') &&
          !item.name?.endsWith('.mov')
      )
      .sort(
        (a: any, b: any) =>
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

// Helper to get SitePages and filter by query
async function getSitePages(token: string, query: string): Promise<any[]> {
  const q = query.toLowerCase()
  
  // Try fetching from the SitePages list
  const listNames = ['Site Pages', 'SitePages']
  
  for (const listName of listNames) {
    try {
      const listItems = await graphGet(
        token,
        `/sites/${SITE_ID}/lists/${encodeURIComponent(listName)}/items?$expand=fields($select=Title,FileLeafRef,Modified)&$top=200`,
        false
      )
      
      if (listItems?.value) {
        return listItems.value
          .filter((item: any) => {
            const title = (item.fields?.Title || '').toLowerCase()
            const fileName = (item.fields?.FileLeafRef || '').toLowerCase()
            // Match query and filter out system pages
            return (title.includes(q) || fileName.includes(q)) &&
                   fileName.endsWith('.aspx') &&
                   !fileName.startsWith('_') &&
                   !fileName.includes('template')
          })
          .map((item: any) => ({
            id: item.id,
            name: item.fields?.Title || item.fields?.FileLeafRef?.replace('.aspx', '') || 'Page',
            webUrl: `${SHAREPOINT_BASE}/SitePages/${item.fields?.FileLeafRef}`,
            lastModified: item.fields?.Modified || new Date().toISOString(),
            lastModifiedBy: 'Office Support',
            category: 'Page',
            type: 'page' as const,
            score: relevanceScore(item.fields?.Title || item.fields?.FileLeafRef || '', query) + 10,
          }))
      }
    } catch (err) {
      console.error(`Failed to fetch list "${listName}":`, err)
    }
  }
  
  // Fallback: try getting the site's default drive and look for SitePages folder
  try {
    const driveItems = await graphGet(
      token,
      `/sites/${SITE_ID}/drive/root:/SitePages:/children?$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy&$top=200`,
      false
    )
    
    if (driveItems?.value) {
      return driveItems.value
        .filter((item: any) => {
          const name = (item.name || '').toLowerCase()
          return name.includes(q) &&
                 name.endsWith('.aspx') &&
                 !name.startsWith('_')
        })
        .map((item: any) => ({
          id: item.id,
          name: item.name?.replace('.aspx', '') || 'Page',
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime || new Date().toISOString(),
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
          category: 'Page',
          type: 'page' as const,
          score: relevanceScore(item.name || '', query) + 10,
        }))
    }
  } catch (err) {
    console.error('Failed to fetch SitePages from drive:', err)
  }
  
  return []
}