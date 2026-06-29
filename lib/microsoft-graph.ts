import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

interface GraphConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  userEmail: string
}

// ---------------------------------------------------------------------------
// Shared Microsoft Graph token (client credentials / application auth).
//
// A single module-level cache is used by every Graph caller in the app:
//   - MicrosoftGraphClient (OneDrive/SharePoint file operations)
//   - /api/calendar/events (group calendar CRUD)
//   - /api/tc/templates/[id]/send-test (TC test email sends)
//
// The token is valid tenant-wide, so sharing one cache is correct and saves
// round trips to login.microsoftonline.com.
// ---------------------------------------------------------------------------

let cachedGraphToken: string | null = null
let graphTokenExpiry = 0

export async function getGraphToken(): Promise<string> {
  if (cachedGraphToken && Date.now() < graphTokenExpiry) {
    return cachedGraphToken
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft Graph is not configured (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET required)'
    )
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get Microsoft Graph access token: ${errorText}`)
  }

  const data = await response.json()
  const token = data.access_token as string | undefined
  if (!token) {
    throw new Error('Microsoft Graph token endpoint returned no access_token')
  }

  cachedGraphToken = token
  // Subtract 5 minutes so we rotate before the token actually expires.
  graphTokenExpiry = Date.now() + (data.expires_in - 300) * 1000
  return token
}

// ── Delegated token via stored refresh token ──────────────────────────────
// Used for operations requiring a real group member (e.g. creating new events
// in a Microsoft 365 group calendar). The refresh token is stored encrypted
// in users.ms_refresh_token, written at Microsoft OAuth login time.
// Requires MS_TOKEN_ENCRYPTION_KEY env var (64-char hex, 32 bytes).

function encryptToken(plaintext: string): string {
  const key = Buffer.from(process.env.MS_TOKEN_ENCRYPTION_KEY!, 'hex')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function encryptMsToken(plaintext: string): string {
  return encryptToken(plaintext)
}

function decryptToken(stored: string): string {
  const key = Buffer.from(process.env.MS_TOKEN_ENCRYPTION_KEY!, 'hex')
  const [ivHex, authTagHex, encryptedHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
}

export async function getDelegatedTokenForUser(userId: string): Promise<string> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('ms_refresh_token')
    .eq('id', userId)
    .single()

  if (!user?.ms_refresh_token) {
    throw new Error('No Microsoft refresh token on file. Please log out and log back in.')
  }

  const refreshToken = decryptToken(user.ms_refresh_token)

  const tenantId     = process.env.MICROSOFT_TENANT_ID
  const clientId     = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph is not configured')
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        scope:         'https://graph.microsoft.com/.default offline_access',
      }).toString(),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    console.error('getDelegatedTokenForUser - token refresh failed:', err)
    throw new Error('Microsoft session expired. Please log out and log back in.')
  }

  const tokens = await response.json()

  // Rotate: Microsoft issues a new refresh token on every use — must store it.
  // If storage fails, throw now rather than silently losing the token and failing next use.
  if (tokens.refresh_token) {
    const { error: rotateErr } = await supabaseAdmin
      .from('users')
      .update({ ms_refresh_token: encryptToken(tokens.refresh_token) })
      .eq('id', userId)
    if (rotateErr) {
      console.error('getDelegatedTokenForUser - failed to store rotated token:', rotateErr)
      throw new Error('Failed to save refreshed token. Please log out and log in again.')
    }
  }

  return tokens.access_token as string
}

class MicrosoftGraphClient {
  private client: Client | null = null
  private config: GraphConfig

  constructor() {
    this.config = {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID!,
      userEmail: process.env.MICROSOFT_ONEDRIVE_USER!,
    }
  }

  private async initClient(): Promise<Client> {
    if (this.client) return this.client

    // Use an async authProvider so the Graph SDK requests a fresh token on
    // every call. getGraphToken() internally caches until near-expiry, so
    // this is cheap.
    this.client = Client.init({
      authProvider: async done => {
        try {
          const token = await getGraphToken()
          done(null, token)
        } catch (err) {
          done(err as Error, null)
        }
      },
    })

    return this.client
  }

  async createFolder(folderPath: string): Promise<any> {
    const client = await this.initClient()

    const pathParts = folderPath.split('/').filter(p => p)
    let currentPath = ''

    for (const part of pathParts) {
      const parentPath = currentPath || '/me/drive/root'
      currentPath = currentPath ? `${currentPath}/${part}` : part

      try {
        await client.api(`/users/${this.config.userEmail}/drive/root:/${currentPath}`).get()
      } catch (error: any) {
        if (error.statusCode === 404) {
          const folder = {
            name: part,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }

          await client
            .api(`/users/${this.config.userEmail}/drive/root:/${parentPath}:/children`)
            .post(folder)
        } else {
          throw error
        }
      }
    }

    return await client.api(`/users/${this.config.userEmail}/drive/root:/${currentPath}`).get()
  }

  async getFolder(folderPath: string): Promise<any> {
    const client = await this.initClient()

    return await client.api(`/users/${this.config.userEmail}/drive/root:/${folderPath}`).get()
  }

  async listFiles(folderPath: string): Promise<any[]> {
    const client = await this.initClient()

    const response = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}:/children`)
      .get()

    return response.value || []
  }

  async uploadFile(folderPath: string, fileName: string, fileContent: Buffer): Promise<any> {
    const token = await getGraphToken()
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.userEmail)}/drive/root:/${folderPath}/${fileName}:/content`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: fileContent as unknown as BodyInit,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OneDrive upload failed: ${res.status} ${JSON.stringify(err)}`)
    }
    return res.json()
  }

  async createSharingLink(itemPath: string, type: 'view' | 'edit' = 'view'): Promise<string> {
    const client = await this.initClient()

    const sharingLink = {
      type: type,
      scope: 'anonymous', // Changed from 'organization' to allow anonymous access without Microsoft login
    }

    const response = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${itemPath}:/createLink`)
      .post(sharingLink)

    return response.link.webUrl
  }

  async getLatestFile(folderPath: string): Promise<any | null> {
    const files = await this.listFiles(folderPath)

    if (files.length === 0) {
      return null
    }

    files.sort((a, b) => {
      return new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime()
    })

    return files[0]
  }

  async getFileDownloadUrl(itemPath: string): Promise<string> {
    const client = await this.initClient()

    const response = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${itemPath}`)
      .get()

    return response['@microsoft.graph.downloadUrl']
  }

  async uploadFileToFolder(
    folderPath: string,
    fileName: string,
    fileBuffer: Buffer
  ): Promise<{
    fileUrl: string
    downloadUrl: string
  }> {
    try {
      const token = await getGraphToken()
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.userEmail)}/drive/root:/${folderPath}/${fileName}:/content`
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: fileBuffer as unknown as BodyInit,
      })
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}))
        throw new Error(`OneDrive upload failed: ${uploadRes.status} ${JSON.stringify(err)}`)
      }
      const uploadResponse = await uploadRes.json()

      // Create a sharing link for the file (view-only, anonymous scope)
      const sharingLink = await this.createSharingLink(`${folderPath}/${fileName}`, 'view')

      return {
        fileUrl: uploadResponse.webUrl,
        downloadUrl: sharingLink, // Use sharing link instead of direct download URL
      }
    } catch (error: any) {
      console.error(`Error uploading file ${fileName} to ${folderPath}:`, error)
      throw new Error(`Failed to upload file ${fileName}: ${error.message || 'Unknown error'}`)
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const client = await this.initClient()

    try {
      const file = await client.api(`/users/${this.config.userEmail}/drive/root:/${filePath}`).get()

      await client.api(`/users/${this.config.userEmail}/drive/items/${file.id}`).delete()
    } catch (error: any) {
      // If file doesn't exist (404), that's okay - it's already deleted
      if (error.statusCode !== 404) {
        throw error
      }
    }
  }

  async moveFolder(sourcePath: string, destinationPath: string): Promise<any> {
    const client = await this.initClient()

    const sourceFolder = await this.getFolder(sourcePath)

    const destParts = destinationPath.split('/').filter(p => p)
    const destParent = destParts.slice(0, -1).join('/')
    const destParentFolder = await this.getFolder(destParent)

    const update = {
      parentReference: {
        id: destParentFolder.id,
      },
      name: destParts[destParts.length - 1],
    }

    return await client
      .api(`/users/${this.config.userEmail}/drive/items/${sourceFolder.id}`)
      .patch(update)
  }

  async moveFile(
    sourcePath: string,
    destinationFolderPath: string,
    newFileName?: string
  ): Promise<any> {
    const client = await this.initClient()

    // Get the source file
    const sourceFile = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${sourcePath}`)
      .get()

    // Get the destination folder
    const destFolder = await this.getFolder(destinationFolderPath)

    const update: any = {
      parentReference: {
        id: destFolder.id,
      },
    }

    // If newFileName is provided, rename the file
    if (newFileName) {
      update.name = newFileName
    }

    return await client
      .api(`/users/${this.config.userEmail}/drive/items/${sourceFile.id}`)
      .patch(update)
  }
}

export const graphClient = new MicrosoftGraphClient()

export async function createListingFolder(
  propertyAddress: string,
  listingId: string,
  transactionType: 'sale' | 'lease' = 'sale'
): Promise<{
  folderPath: string
  folderId: string
  sharingUrl: string
}> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to handle same address with different sellers
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`

  const folder = await graphClient.createFolder(folderPath)
  const sharingUrl = await graphClient.createSharingLink(folderPath, 'view')

  return {
    folderPath,
    folderId: folder.id,
    sharingUrl,
  }
}

export async function regenerateFolderSharingLink(
  propertyAddress: string,
  listingId: string,
  transactionType: 'sale' | 'lease' = 'sale'
): Promise<string> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'

  // Always use new format (with transaction type) - this is where reports are being uploaded
  const activePathNew = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`
  // Old format (without transaction type) - for reference only
  const activePathOld = `Listing Reports/Active/${sanitizedAddress}-${listingId}`

  const archivePathNew = `Listing Reports/Archive/${sanitizedAddress}-${transactionLabel}-${listingId}`
  const archivePathOld = `Listing Reports/Archive/${sanitizedAddress}-${listingId}`

  // Always prefer new format - check if it exists, create if not
  let folderPath = activePathNew
  try {
    await graphClient.getFolder(activePathNew)
    // New format folder exists - use it
  } catch (error: any) {
    // New format folder doesn't exist
    if (error.statusCode === 404 || error.code === 'itemNotFound') {
      // Check if old format exists - if so, we'll still create new format (reports go there)
      let oldFolderExists = false
      try {
        await graphClient.getFolder(activePathOld)
        oldFolderExists = true
      } catch (oldError: any) {
        // Old folder doesn't exist either
      }

      // Check Archive for new format
      try {
        await graphClient.getFolder(archivePathNew)
        // Folder exists in Archive, move it back to Active
        console.log(`Folder found in Archive (new format), moving back to Active...`)
        await graphClient.moveFolder(archivePathNew, activePathNew)
      } catch (archiveError: any) {
        if (archiveError.statusCode === 404 || archiveError.code === 'itemNotFound') {
          // Check Archive for old format
          try {
            await graphClient.getFolder(archivePathOld)
            // Move old format from Archive to new format in Active
            console.log(`Moving old format folder from Archive to new format in Active...`)
            await graphClient.moveFolder(archivePathOld, activePathNew)
          } catch (archiveError2: any) {
            // Folder doesn't exist anywhere, create it in Active with new format
            if (archiveError2.statusCode === 404 || archiveError2.code === 'itemNotFound') {
              console.log(`Folder not found, creating new folder in Active with new format...`)
              await graphClient.createFolder(activePathNew)
            } else {
              throw archiveError2
            }
          }
        } else {
          throw archiveError
        }
      }
    } else {
      throw error
    }
  }

  // Always use new format path - this ensures links point to where reports will be uploaded
  folderPath = activePathNew

  // Regenerate sharing link with anonymous scope
  const sharingUrl = await graphClient.createSharingLink(folderPath, 'view')

  return sharingUrl
}

export async function archiveListingFolder(
  propertyAddress: string,
  listingId: string,
  transactionType: 'sale' | 'lease' = 'sale'
): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const sourcePath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`
  const destPath = `Listing Reports/Archive/${sanitizedAddress}-${transactionLabel}-${listingId}`

  await graphClient.moveFolder(sourcePath, destPath)
}

export async function unarchiveListingFolder(
  propertyAddress: string,
  listingId: string,
  transactionType: 'sale' | 'lease' = 'sale'
): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const sourcePath = `Listing Reports/Archive/${sanitizedAddress}-${transactionLabel}-${listingId}`
  const destPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`

  await graphClient.moveFolder(sourcePath, destPath)
}

export async function getLatestListingReport(
  propertyAddress: string,
  listingId: string,
  transactionType: 'sale' | 'lease' = 'sale'
): Promise<{
  fileName: string
  downloadUrl: string
  webUrl: string
} | null> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`

  const latestFile = await graphClient.getLatestFile(folderPath)

  if (!latestFile) {
    return null
  }

  // Create a sharing link for the file instead of using direct download URL
  const sharingLink = await graphClient.createSharingLink(
    `${folderPath}/${latestFile.name}`,
    'view'
  )

  return {
    fileName: latestFile.name,
    downloadUrl: sharingLink,
    webUrl: latestFile.webUrl,
  }
}

export async function uploadWeeklyReports(
  propertyAddress: string,
  listingId: string,
  weekStart: string,
  weekEnd: string,
  file1Buffer: Buffer,
  file1Name: string,
  file2Buffer: Buffer,
  file2Name: string,
  transactionType: 'sale' | 'lease' = 'sale',
  mlsType: 'HAR' | 'NTREIS' = 'HAR'
): Promise<{
  file1Url: string
  file1DownloadUrl: string
  file2Url: string | null
  file2DownloadUrl: string | null
}> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>#]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`

  // Ensure the folder exists before uploading (creates all parent folders if needed)
  try {
    await graphClient.createFolder(folderPath)
  } catch (error: any) {
    // If folder already exists, that's fine - continue with upload
    if (error.statusCode !== 409 && error.code !== 'nameAlreadyExists') {
      console.error('Error creating folder:', error)
      throw error
    }
  }

  // Use just the Monday date for the filename
  const dateLabel = weekStart.replace(/[/\\?%*:|"<>#]/g, '-')

  const file1NameWithDate = `Showing_Report_${dateLabel}_${file1Name}`

  const file1Result = await graphClient.uploadFileToFolder(
    folderPath,
    file1NameWithDate,
    file1Buffer
  )

  // Only upload traffic report for HAR listings
  let file2Result = null
  if (mlsType === 'HAR' && file2Buffer.length > 0 && file2Name) {
    const file2NameWithDate = `Traffic_Report_${dateLabel}_${file2Name}`
    file2Result = await graphClient.uploadFileToFolder(folderPath, file2NameWithDate, file2Buffer)
  }

  return {
    file1Url: file1Result.fileUrl,
    file1DownloadUrl: file1Result.downloadUrl,
    file2Url: file2Result?.fileUrl || null,
    file2DownloadUrl: file2Result?.downloadUrl || null,
  }
}

export async function createAgentFolder(
  firstName: string,
  lastName: string,
  userId: string
): Promise<{ folderPath: string; sharingUrl: string }> {
  const sanitizedName = `${firstName} ${lastName}`.replace(/[/\\?%*:|"<>#]/g, '-')
  const folderPath = `Agent Documents/${sanitizedName}-${userId}`

  await graphClient.createFolder(folderPath)
  const sharingUrl = await graphClient.createSharingLink(folderPath, 'view')

  return { folderPath, sharingUrl }
}

export async function uploadAgentDocument(
  folderPath: string,
  fileName: string,
  fileBuffer: Buffer
): Promise<{ fileUrl: string; downloadUrl: string }> {
  return graphClient.uploadFileToFolder(folderPath, fileName, fileBuffer)
}
// ---------------------------------------------------------------------------
// Create an M365 user account for a newly activated agent.
// Requires User.ReadWrite.All and UserAuthenticationMethod.ReadWrite.All application permissions in Entra.
// ---------------------------------------------------------------------------
export async function createM365User({
  firstName,
  lastName,
  tempPassword,
  personalPhone,
  officeLocation,
}: {
  firstName: string
  lastName: string
  tempPassword: string
  personalPhone?: string | null
  officeLocation?: string | null
}): Promise<{ officeEmail: string; stepErrors: string[] }> {
  const token = await getGraphToken()
  const domain = 'collectiverealtyco.com'
  const stepErrors: string[] = []

  // Build username: first name + last initial, stripped of non-ascii and spaces
  const sanitize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-zA-Z]/g, '')       // strip everything non-alpha
      .toLowerCase()

  const first = sanitize(firstName)
  const last = sanitize(lastName)
  const lastInitial = last.charAt(0)

  // Username candidates in priority order:
  // 1. firstnamelastinitial (latiaw)
  // 2. firstnamelastname (lwilliams -- first initial + last name)
  // 3. firstname.lastname (latia.williams)
  const usernameCandidates = [
    `${first}${lastInitial}`,
    `${first.charAt(0)}${last}`,
    `${first}.${last}`,
  ]

  let baseUsername = usernameCandidates[0]
  let officeEmail = `${baseUsername}@${domain}`
  let userId = ''
  let createdNew = false

  const displayName = `${firstName} ${lastName}`

  for (const candidate of usernameCandidates) {
    const candidateEmail = `${candidate}@${domain}`
    const userBody = {
      accountEnabled: true,
      displayName,
      givenName: firstName,
      surname: lastName,
      mailNickname: candidate,
      userPrincipalName: candidateEmail,
      jobTitle: 'Real Estate Agent',
      usageLocation: 'US',
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: tempPassword,
      },
    }

    const createRes = await fetch('https://graph.microsoft.com/v1.0/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userBody),
    })

    if (createRes.status === 201) {
      const created = await createRes.json()
      userId = created.id as string
      baseUsername = candidate
      officeEmail = candidateEmail
      createdNew = true
      break
    } else if (createRes.status === 409) {
      // This username is taken -- try next candidate
      console.log(`M365 username ${candidateEmail} already exists, trying next...`)
      continue
    } else {
      const err = await createRes.json().catch(() => null)
      throw new Error(
        `M365 user creation failed for ${candidateEmail}: ${err?.error?.message || createRes.status}`
      )
    }
  }

  // All candidates taken -- look up the first candidate's existing account
  if (!createdNew) {
    const fallbackEmail = `${usernameCandidates[0]}@${domain}`
    console.log(`All username candidates taken, using existing account ${fallbackEmail}`)
    const lookupRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fallbackEmail}?$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!lookupRes.ok) {
      const err = await lookupRes.json().catch(() => null)
      throw new Error(
        `All username candidates taken and lookup failed: ${err?.error?.message || lookupRes.status}`
      )
    }
    const existing = await lookupRes.json()
    userId = existing.id as string
    officeEmail = fallbackEmail
    baseUsername = usernameCandidates[0]
  }

  // Brief delay -- user object must replicate before license/group/phone calls
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Step 2: Look up the M365 Business Basic SKU from this tenant's subscriptions
  // Requires Organization.Read.All application permission
  let skuId: string | null = null
  try {
    const skuRes = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (skuRes.ok) {
      const skuData = await skuRes.json()
      const sku = (skuData.value || []).find(
        (s: any) =>
          s.skuPartNumber === 'O365_BUSINESS_ESSENTIALS' ||
          s.skuPartNumber === 'SMB_BUSINESS_ESSENTIALS'
      )
      skuId = sku?.skuId ?? null
      if (!skuId) stepErrors.push('License: M365 Business Basic SKU not found in tenant -- assign manually')
    } else {
      stepErrors.push('License: could not query tenant SKUs -- assign manually')
    }
  } catch {
    stepErrors.push('License: SKU lookup error -- assign manually')
  }

  // Step 3: Assign license -- requires LicenseAssignment.ReadWrite.All application permission
  if (skuId) {
    try {
      const licenseRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userId}/assignLicense`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addLicenses: [{ skuId, disabledPlans: [] }],
            removeLicenses: [],
          }),
        }
      )
      if (!licenseRes.ok) {
        const err = await licenseRes.json().catch(() => null)
        const msg = err?.error?.message || licenseRes.status
        console.error('M365 license assignment failed:', msg)
        stepErrors.push(`License: assignment failed (${msg}) -- assign manually`)
      }
    } catch (err: any) {
      console.error('M365 license assignment error:', err)
      stepErrors.push('License: assignment error -- assign manually')
    }
  }

  // Step 4: Register MFA phone number -- requires UserAuthenticationMethod.ReadWrite.All
  // Format: strip non-digits, prepend +1 for 10-digit US numbers
  if (personalPhone) {
    try {
      const digits = String(personalPhone).replace(/\D/g, '')
      const formatted = digits.length === 10 ? `+1 ${digits}` : `+${digits}`
      const phoneRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userId}/authentication/phoneMethods`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phoneNumber: formatted, phoneType: 'mobile' }),
        }
      )
      if (!phoneRes.ok) {
        const err = await phoneRes.json().catch(() => null)
        const msg = err?.error?.message || phoneRes.status
        console.error('MFA phone registration failed:', msg)
        stepErrors.push(`MFA phone: registration failed (${msg}) -- add manually in Entra`)
      }
    } catch (err: any) {
      console.error('MFA phone registration error:', err)
      stepErrors.push('MFA phone: registration error -- add manually in Entra')
    }
  }

  // Step 4b: Enforce MFA per-user -- beta endpoint, stable in practice
  // Setting enabled auto-transitions to enforced once a method is registered
  try {
    const mfaEnforceRes = await fetch(
      `https://graph.microsoft.com/beta/users/${userId}/authentication/requirements`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ perUserMfaState: 'enabled' }),
      }
    )
    if (!mfaEnforceRes.ok) {
      const err = await mfaEnforceRes.json().catch(() => null)
      const msg = err?.error?.message || mfaEnforceRes.status
      console.error('MFA enforce failed:', msg)
      stepErrors.push(`MFA enforce: failed (${msg}) -- enable manually in Entra`)
    }
  } catch (err: any) {
    console.error('MFA enforce error:', err)
    stepErrors.push('MFA enforce: error -- enable manually in Entra')
  }

  // Step 5: Add to Microsoft 365 groups -- requires GroupMember.ReadWrite.All
  // Always: Agents + Onboarding. Conditionally: Houston or DFW based on office
  const GROUP_AGENTS    = '48f1de3f-74e7-4c5d-b890-bc4147fe3012'
  const GROUP_HOUSTON   = '995bce20-1771-4f91-a3b8-6d9218aa03d2'
  const GROUP_DFW       = '3474e9f3-c7c5-4c1e-be1a-fa3bfabc24d8'
  const GROUP_ONBOARDING = 'ab1f8649-51cf-4236-9f3b-70089f374a63'

  const groupsToJoin: Array<{ id: string; name: string }> = [
    { id: GROUP_AGENTS, name: 'Agents' },
    { id: GROUP_ONBOARDING, name: 'Onboarding' },
  ]
  if (officeLocation === 'Houston') groupsToJoin.push({ id: GROUP_HOUSTON, name: 'Houston Agents' })
  if (officeLocation === 'DFW') groupsToJoin.push({ id: GROUP_DFW, name: 'DFW Agents' })

  for (const group of groupsToJoin) {
    try {
      const memberRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${group.id}/members/$ref`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
          }),
        }
      )
      if (!memberRes.ok) {
        const err = await memberRes.json().catch(() => null)
        const msg = err?.error?.message || memberRes.status
        console.error(`Group membership failed for ${group.name}:`, msg)
        stepErrors.push(`Groups: failed to add to ${group.name} (${msg}) -- add manually`)
      }
    } catch (err: any) {
      console.error(`Group membership error for ${group.name}:`, err)
      stepErrors.push(`Groups: error adding to ${group.name} -- add manually`)
    }
  }

  return { officeEmail, stepErrors }
}
