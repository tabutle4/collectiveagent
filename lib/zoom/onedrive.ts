// OneDrive staging for Zoom recordings. Moved out of the recording-complete route
// so the manual process route can stage a recording the same way.

const ONEDRIVE_USER = process.env.MICROSOFT_ONEDRIVE_USER!
export const ONEDRIVE_FOLDER = 'Zoom Recordings/Pending'

export async function uploadToOneDrive(
  token: string,
  fileName: string,
  fileSize: number,
  fileStream: ReadableStream
): Promise<{ itemId: string; webUrl: string }> {
  if (!fileSize || fileSize <= 0) throw new Error('Cannot upload: file size is unknown or zero')
  const itemPath = `${ONEDRIVE_FOLDER}/${fileName}`

  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } }),
    }
  )
  if (!sessionRes.ok) throw new Error(`OneDrive upload session failed: ${await sessionRes.text()}`)
  const { uploadUrl } = await sessionRes.json()

  const chunkSize = 10 * 1024 * 1024
  const reader = fileStream.getReader()
  let offset = 0
  let buffer = new Uint8Array(0)
  let itemId = ''
  let webUrl = ''

  while (true) {
    while (buffer.length < chunkSize) {
      const { done, value } = await reader.read()
      if (done) break
      const merged = new Uint8Array(buffer.length + value.length)
      merged.set(buffer)
      merged.set(value, buffer.length)
      buffer = merged
    }

    if (buffer.length === 0) break

    const chunk = buffer.slice(0, Math.min(chunkSize, buffer.length))
    buffer = buffer.slice(chunk.length)
    const end = offset + chunk.length - 1

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end}/${fileSize}`,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
    })

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const result = await chunkRes.json()
      itemId = result.id || ''
      webUrl = result.webUrl || ''
    } else if (chunkRes.status !== 202) {
      throw new Error(`OneDrive chunk upload failed: ${chunkRes.status} ${await chunkRes.text()}`)
    }

    offset += chunk.length
    if (offset >= fileSize) break
  }

  return { itemId, webUrl }
}

export async function verifyOneDriveFile(token: string, itemId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${itemId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return res.ok
  } catch {
    return false
  }
}
