import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TRAINING_CENTER_PATH = 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter'

// Drive IDs for default view (non-search mode)
const VIDEOS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5HhDhOCHtNrRZpFFzbL3M8m'
const DOCUMENTS_DRIVE_ID = 'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5EPy6Dyk4Y7SqWCeUeROfqY'
const AGENT_RESOURCES_DRIVE_ID =
  'b!cVfAiT5HZU6nh1orbml3XfqyUUNDYXxJicXGIYXih5FQj3gFKBeBS5JwuInEa4jG'

// SharePoint system folders to exclude from search results
const EXCLUDED_CATEGORIES = ['SiteAssets', 'Site Assets', 'Lists', '_catalogs', 'Style Library']

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
    console.error(`Graph GET failed: ${path}`, res.status)
    return null
  }
  return res.json()
}

async function graphPost(token: string, path: string, body: object) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    console.error(`Graph POST failed: ${path}`, res.status)
    return { error: true, status: res.status, message: errorText }
  }

  return res.json()
}

// Extract name from resource, handling pages that only have webUrl
function getResourceName(resource: any): string {
  if (resource.name) return resource.name

  if (resource.webUrl) {
    const lastSegment = resource.webUrl.split('/').pop() || ''
    const pageName = lastSegment.replace(/\.aspx$/i, '').replace(/-/g, ' ')
    if (pageName && pageName !== 'Untitled') return pageName
  }

  return 'Untitled'
}

// Determine result type from URL and file extension
function getResultType(webUrl: string, name: string): 'video' | 'document' | 'page' {
  const lowerName = name.toLowerCase()
  const lowerUrl = webUrl.toLowerCase()

  if (
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.mov') ||
    lowerName.endsWith('.avi') ||
    lowerName.endsWith('.webm')
  ) {
    return 'video'
  }

  if (lowerName.endsWith('.aspx') || lowerUrl.includes('/sitepages/')) {
    return 'page'
  }

  return 'document'
}

// Extract category from the parent reference or URL
function extractCategory(hit: any): string {
  const parentName = hit.resource?.parentReference?.name || ''
  if (parentName) return parentName

  const webUrl = hit.resource?.webUrl || ''
  const urlMatch = webUrl.match(/\/sites\/[^/]+\/([^/]+)/)
  if (urlMatch) {
    return urlMatch[1].replace(/%20/g, ' ')
  }

  return 'General'
}

// Format names for display
function formatDisplayName(name: string): string {
  return name
    .replace(/\.(mp4|mov|avi|webm|pdf|docx|xlsx|pptx|doc|xls|aspx)$/i, '')
    .replace(/[_-]/g, ' ')
}

// Check if result should be excluded (system folders, list forms, etc.)
function shouldExcludeResult(item: any): boolean {
  if (!item) return true
  if (EXCLUDED_CATEGORIES.includes(item.category)) return true
  if (item.webUrl?.includes('DispForm.aspx')) return true
  if (item.webUrl?.includes('/Lists/')) return true
  return false
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()
    const token = await getAccessToken()

    // --- SEARCH MODE: Use Microsoft Search API ---
    if (query) {
      const kqlQuery = `${query} path:"${TRAINING_CENTER_PATH}"`

      const searchBody = {
        requests: [
          {
            entityTypes: ['driveItem', 'listItem'],
            query: { queryString: kqlQuery },
            from: 0,
            size: 50,
            region: 'US',
          },
        ],
      }

      const searchResponse = await graphPost(token, '/search/query', searchBody)

      if (searchResponse?.error) {
        return await fallbackDriveSearch(token, query)
      }

      if (!searchResponse?.value?.[0]?.hitsContainers?.[0]?.hits) {
        return await fallbackDriveSearch(token, query)
      }

      const hits = searchResponse.value[0].hitsContainers[0].hits

      const searchResults = hits
        .map((hit: any) => {
          const resource = hit.resource
          const name = getResourceName(resource)
          const webUrl = resource.webUrl || ''

          if (name.startsWith('~') || name.startsWith('_')) {
            return null
          }

          const type = getResultType(webUrl, name)
          const category = extractCategory(hit)

          return {
            id: hit.hitId,
            name: formatDisplayName(name),
            webUrl,
            lastModified: resource.lastModifiedDateTime || new Date().toISOString(),
            lastModifiedBy: resource.lastModifiedBy?.user?.displayName || 'Office Support',
            type,
            category,
            folder: category,
            score: 100 - (hit.rank || 0),
          }
        })
        .filter((item: any) => !shouldExcludeResult(item))

      return NextResponse.json({ searchResults, query })
    }

    // --- DEFAULT MODE: Recent recordings, resources, and video library folders ---
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

// Fallback to drive-based search if Search API fails
async function fallbackDriveSearch(token: string, query: string) {
  const encoded = encodeURIComponent(query)

  const [videoResults, docResults, agentResResults] = await Promise.all([
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
  ])

  const scoreResult = (name: string, q: string): number => {
    const n = name.toLowerCase().replace(/\.[^.]+$/, '')
    const ql = q.toLowerCase()
    if (n === ql) return 100
    if (n.startsWith(ql)) return 80
    if (n.includes(ql)) return 60
    const words = ql.split(/\s+/)
    const matched = words.filter(w => n.includes(w))
    return (matched.length / words.length) * 40
  }

  const allResults = [
    ...(videoResults?.value || [])
      .filter((item: any) => item.file && !item.name?.startsWith('~'))
      .map((item: any) => ({
        id: item.id,
        name: formatDisplayName(item.name),
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
        folder: item.parentReference?.name || 'Video',
        category: item.parentReference?.name || 'Video',
        type: 'video' as const,
        score: scoreResult(item.name, query),
      })),
    ...(docResults?.value || [])
      .filter((item: any) => item.file && !item.name?.startsWith('~'))
      .map((item: any) => ({
        id: item.id,
        name: formatDisplayName(item.name),
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
        folder: item.parentReference?.name || 'General',
        category: item.parentReference?.name || 'General',
        type: getResultType(item.webUrl, item.name),
        score: scoreResult(item.name, query),
      })),
    ...(agentResResults?.value || [])
      .filter((item: any) => item.file && !item.name?.startsWith('~'))
      .map((item: any) => ({
        id: item.id,
        name: formatDisplayName(item.name),
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        lastModifiedBy: item.lastModifiedBy?.user?.displayName || 'Office Support',
        folder: item.parentReference?.name || 'General',
        category: item.parentReference?.name || 'General',
        type: getResultType(item.webUrl, item.name),
        score: scoreResult(item.name, query),
      })),
  ]
    .filter((item: any) => !shouldExcludeResult(item))
    .sort((a, b) => b.score - a.score)

  return NextResponse.json({ searchResults: allResults, query })
}