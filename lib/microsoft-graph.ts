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
    
    const uploadResponse = await client
      .api(`/users/${this.config.userEmail}/drive/root:/${folderPath}/${fileName}:/content`)
      .put(fileBuffer)
    
    // Create a sharing link for the file (view-only, organization scope)
    const sharingLink = await this.createSharingLink(`${folderPath}/${fileName}`, 'view')
    
    return {
      fileUrl: uploadResponse.webUrl,
      downloadUrl: sharingLink, // Use sharing link instead of direct download URL
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
}

export const graphClient = new MicrosoftGraphClient()

export async function createListingFolder(propertyAddress: string, listingId: string): Promise<{
  folderPath: string
  folderId: string
  sharingUrl: string
}> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to handle same address with different sellers
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  
  const folder = await graphClient.createFolder(folderPath)
  const sharingUrl = await graphClient.createSharingLink(folderPath, 'view')
  
  return {
    folderPath,
    folderId: folder.id,
    sharingUrl,
  }
}

export async function regenerateFolderSharingLink(propertyAddress: string, listingId: string): Promise<string> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to match the folder path used during creation
  const activePath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  const archivePath = `Listing Reports/Archive/${sanitizedAddress}-${listingId}`
  
  // Check if folder exists in Active location
  let folderPath = activePath
  try {
    await graphClient.getFolder(activePath)
  } catch (error: any) {
    // Folder doesn't exist in Active, check Archive
    if (error.statusCode === 404 || error.code === 'itemNotFound') {
      try {
        await graphClient.getFolder(archivePath)
        // Folder exists in Archive, move it back to Active
        console.log(`Folder found in Archive, moving back to Active...`)
        await graphClient.moveFolder(archivePath, activePath)
        folderPath = activePath
      } catch (archiveError: any) {
        // Folder doesn't exist in Archive either, create it in Active
        if (archiveError.statusCode === 404 || archiveError.code === 'itemNotFound') {
          console.log(`Folder not found, creating new folder in Active...`)
          await graphClient.createFolder(activePath)
          folderPath = activePath
        } else {
          throw archiveError
        }
      }
    } else {
      throw error
    }
  }
  
  // Regenerate sharing link with anonymous scope
  const sharingUrl = await graphClient.createSharingLink(folderPath, 'view')
  
  return sharingUrl
}

export async function archiveListingFolder(propertyAddress: string, listingId: string): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to match the folder path used during creation
  const sourcePath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  const destPath = `Listing Reports/Archive/${sanitizedAddress}-${listingId}`
  
  await graphClient.moveFolder(sourcePath, destPath)
}

export async function unarchiveListingFolder(propertyAddress: string, listingId: string): Promise<void> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to match the folder path used during creation
  const sourcePath = `Listing Reports/Archive/${sanitizedAddress}-${listingId}`
  const destPath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  
  await graphClient.moveFolder(sourcePath, destPath)
}

export async function getLatestListingReport(propertyAddress: string, listingId: string): Promise<{
  fileName: string
  downloadUrl: string
  webUrl: string
} | null> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to match the folder path used during creation
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  
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
  file2Name: string
): Promise<{
  file1Url: string
  file1DownloadUrl: string
  file2Url: string
  file2DownloadUrl: string
}> {
  const sanitizedAddress = propertyAddress.replace(/[/\\?%*:|"<>]/g, '-')
  // Include listing ID to match the folder path used during creation
  const folderPath = `Listing Reports/Active/${sanitizedAddress}-${listingId}`
  
  // Use just the Monday date for the filename
  const dateLabel = weekStart.replace(/[/\\?%*:|"<>]/g, '-')
  
  const file1NameWithDate = `Showing_Report_${dateLabel}_${file1Name}`
  const file2NameWithDate = `Traffic_Report_${dateLabel}_${file2Name}`
  
  const file1Result = await graphClient.uploadFileToFolder(folderPath, file1NameWithDate, file1Buffer)
  const file2Result = await graphClient.uploadFileToFolder(folderPath, file2NameWithDate, file2Buffer)
  
  return {
    file1Url: file1Result.fileUrl,
    file1DownloadUrl: file1Result.downloadUrl,
    file2Url: file2Result.fileUrl,
    file2DownloadUrl: file2Result.downloadUrl,
  }
}

