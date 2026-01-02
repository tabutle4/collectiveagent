import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'

interface GraphConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  userEmail: string
}

class MicrosoftGraphClient {
  private client: Client | null = null
  private config: GraphConfig
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor() {
    this.config = {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID!,
      userEmail: process.env.MICROSOFT_ONEDRIVE_USER!,
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get access token: ${error}`)
    }

    const data = await response.json()
    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000

    if (!this.accessToken) {
      throw new Error('Failed to obtain access token')
    }

    return this.accessToken
  }

  private async initClient(): Promise<Client> {
    if (this.client && this.accessToken && Date.now() < this.tokenExpiry) {
      return this.client
    }

    const token = await this.getAccessToken()

    this.client = Client.init({
      authProvider: (done) => {
        done(null, token)
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
        await client
          .api(`/users/${this.config.userEmail}/drive/root:/${currentPath}`)
          .get()
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
    
    return await client
      .api(`/users/${this.config.userEmail}/drive/root:/${currentPath}`)
      .get()
  }

  async getFolder(folderPath: string): Promise<any> {
    const client = await this.initClient()
    
    return await client
      .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}`)
      .get()
  }

  async listFiles(folderPath: string): Promise<any[]> {
    const client = await this.initClient()
    
    const response = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}:/children`)
      .get()
    
    return response.value || []
  }

  async uploadFile(folderPath: string, fileName: string, fileContent: Buffer): Promise<any> {
    const client = await this.initClient()
    
    return await client
      .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}/${fileName}:/content`)
      .put(fileContent)
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

  async uploadFileToFolder(folderPath: string, fileName: string, fileBuffer: Buffer): Promise<{
    fileUrl: string
    downloadUrl: string
  }> {
    const client = await this.initClient()
    
    try {
      const uploadResponse = await client
        .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}/${fileName}:/content`)
        .put(fileBuffer)
      
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
      const file = await client
        .api(`/users/${this.config.userEmail}/drive/root:/${filePath}`)
        .get()
      
      await client
        .api(`/users/${this.config.userEmail}/drive/items/${file.id}`)
        .delete()
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

  async moveFile(sourcePath: string, destinationFolderPath: string, newFileName?: string): Promise<any> {
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

export async function createListingFolder(propertyAddress: string, listingId: string, transactionType: 'sale' | 'lease' = 'sale'): Promise<{
  folderPath: string
  folderId: string
  sharingUrl: string
}> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
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

export async function regenerateFolderSharingLink(propertyAddress: string, listingId: string, transactionType: 'sale' | 'lease' = 'sale'): Promise<string> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
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

export async function archiveListingFolder(propertyAddress: string, listingId: string, transactionType: 'sale' | 'lease' = 'sale'): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const sourcePath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`
  const destPath = `Listing Reports/Archive/${sanitizedAddress}-${transactionLabel}-${listingId}`
  
  await graphClient.moveFolder(sourcePath, destPath)
}

export async function unarchiveListingFolder(propertyAddress: string, listingId: string, transactionType: 'sale' | 'lease' = 'sale'): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const sourcePath = `Listing Reports/Archive/${sanitizedAddress}-${transactionLabel}-${listingId}`
  const destPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`
  
  await graphClient.moveFolder(sourcePath, destPath)
}

export async function getLatestListingReport(propertyAddress: string, listingId: string, transactionType: 'sale' | 'lease' = 'sale'): Promise<{
  fileName: string
  downloadUrl: string
  webUrl: string
} | null> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include transaction type and listing ID to match the folder path used during creation
  const transactionLabel = transactionType === 'lease' ? 'Lease' : 'Sale'
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${transactionLabel}-${listingId}`
  
  const latestFile = await graphClient.getLatestFile(folderPath)
  
  if (!latestFile) {
    return null
  }
  
  // Create a sharing link for the file instead of using direct download URL
  const sharingLink = await graphClient.createSharingLink(`${folderPath}/${latestFile.name}`, 'view')
  
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
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
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
  const dateLabel = weekStart.replace(/[/\\?%*:|"<>]/g, '-')
  
  const file1NameWithDate = `Showing_Report_${dateLabel}_${file1Name}`
  
  const file1Result = await graphClient.uploadFileToFolder(folderPath, file1NameWithDate, file1Buffer)
  
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

