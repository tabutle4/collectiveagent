import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

export const dynamic = 'force-dynamic'

// Proxy route that fetches a OneDrive file using Graph credentials and
// streams it to the browser. This lets Leah view docs inline without
// leaving the app and without needing the file to pass through Vercel upload limits
// (viewing is streaming out, not in — very different traffic pattern).
//
// Usage: /api/uploads/view?url=<encoded-onedrive-webUrl>


export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const fileUrl = searchParams.get('url')

  if (!fileUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  // Only allow OneDrive / SharePoint URLs
  const decoded = decodeURIComponent(fileUrl)
  if (!decoded.includes('sharepoint.com') && !decoded.includes('onedrive.live.com') && !decoded.includes('1drv.ms')) {
    return new NextResponse('Invalid file URL', { status: 400 })
  }

  try {
    const token = await getGraphToken()
    const oneDriveUser = process.env.MICROSOFT_ONEDRIVE_USER!
    const tenantDomain = process.env.MICROSOFT_TENANT_DOMAIN || oneDriveUser.split('@')[1]

    // Convert the SharePoint webUrl to a Graph API download URL
    // webUrl format: https://{tenant}.sharepoint.com/:b:/r/{site}/Shared%20Documents/{path}
    // We need: https://graph.microsoft.com/v1.0/users/{user}/drive/root:/{path}:/content
    //
    // The most reliable approach: encode the webUrl as a sharing link and use
    // Graph's shares API to get the download URL
    const encodedUrl = Buffer.from(decoded).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const sharesUrl = `https://graph.microsoft.com/v1.0/shares/u!${encodedUrl}/driveItem/content`

    const fileRes = await fetch(sharesUrl, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    })

    if (!fileRes.ok) {
      // Fallback: try direct user drive search by parsing the path
      const urlObj = new URL(decoded)
      // Extract path after /r/ or after the site root
      const pathMatch = urlObj.pathname.match(/\/r\/(.+)$/)
      if (pathMatch) {
        const drivePath = decodeURIComponent(pathMatch[1]).replace(/^sites\/[^/]+\//, '')
        const directUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oneDriveUser)}/drive/root:/${drivePath}:/content`
        const directRes = await fetch(directUrl, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'follow',
        })
        if (!directRes.ok) {
          return new NextResponse('Could not retrieve file from OneDrive', { status: 502 })
        }
        const contentType = directRes.headers.get('content-type') || 'application/octet-stream'
        return new NextResponse(directRes.body, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, max-age=300',
          },
        })
      }
      return new NextResponse('Could not retrieve file from OneDrive', { status: 502 })
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
    return new NextResponse(fileRes.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err: any) {
    console.error('Document view proxy error:', err)
    return new NextResponse('Error retrieving document', { status: 500 })
  }
}
