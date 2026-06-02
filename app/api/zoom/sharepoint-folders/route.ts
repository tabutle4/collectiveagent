import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'

let cachedFolders: string[] | null = null
let cacheExpiry = 0

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  // Cache for 10 minutes
  if (cachedFolders && Date.now() < cacheExpiry) {
    return NextResponse.json({ folders: cachedFolders })
  }

  try {
    const token = await getGraphToken()

    // Get site
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!siteRes.ok) throw new Error('Failed to get SharePoint site')
    const site = await siteRes.json()

    // Get drive
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!driveRes.ok) throw new Error('Failed to get drive')
    const drive = await driveRes.json()

    // List folders inside Videos
    const foldersRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/root:/Videos:/children?$select=name,folder&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!foldersRes.ok) throw new Error('Failed to list folders')
    const foldersData = await foldersRes.json()

    const folders = (foldersData.value || [])
      .filter((item: any) => item.folder)
      .map((item: any) => item.name)
      .sort()

    cachedFolders = folders
    cacheExpiry = Date.now() + 10 * 60 * 1000

    return NextResponse.json({ folders })
  } catch (err: any) {
    // Return fallback list if Graph fails
    const fallback = [
      'Announcement Recordings', 'Brokermint', 'Builders', 'Business Strategy',
      'Business Taxes', 'Collective Access Division Coaching - Dallas',
      'Collective Access Division Coaching - Houston', 'Commercial', 'Comps',
      'Contracts', 'Convert & Close Coaching', 'Daily Prospecting', 'Document Review',
      'Home Warranty', 'Inspections', 'Insurance', 'Leasing', 'Lender Market Updates',
      'Lending', 'Listings', 'Market Update', 'Marketing',
      'Navigating the Training Center, Compliance, & Onboarding', 'New Agent Coaching Circle',
      'New Construction', 'Prospecting', 'Representing Buyers',
      'Representing Sellers and Landlords', 'Sales Meetings', 'Seasoned Agent Coaching Circle',
      'Title Company Guest Trainings',
    ]
    return NextResponse.json({ folders: fallback, fallback: true })
  }
}
