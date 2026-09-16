import { getGraphToken } from '@/lib/microsoft-graph'

const SHAREPOINT_SITE = 'collectiverealtyco.sharepoint.com:/sites/agenttrainingcenter:'

// Used when Graph cannot be reached, and as the list shown to the AI in the
// naming system prompt.
export const SHAREPOINT_FOLDER_FALLBACK = [
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

let cachedFolders: string[] | null = null
let cacheExpiry = 0

export interface SharePointFolderList {
  folders: string[]
  fallback: boolean
}

export async function listSharePointFolders(): Promise<SharePointFolderList> {
  // Cache for 10 minutes
  if (cachedFolders && Date.now() < cacheExpiry) {
    return { folders: cachedFolders, fallback: false }
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

    // Get all drives and find the Videos library specifically
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drives`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!drivesRes.ok) throw new Error('Failed to get drives')
    const drivesData = await drivesRes.json()
    const drives = drivesData.value || []

    const videosDrive = drives.find((d: any) =>
      d.name === 'Videos' || d.webUrl?.toLowerCase().includes('/videos')
    )
    if (!videosDrive) throw new Error('Videos library not found')

    // List folders at root of Videos library
    const foldersRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${videosDrive.id}/root/children?$select=name,folder&$top=100`,
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

    return { folders, fallback: false }
  } catch {
    return { folders: SHAREPOINT_FOLDER_FALLBACK, fallback: true }
  }
}
