import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { listSharePointFolders } from '@/lib/zoom/sharepoint-folders'

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { folders, fallback } = await listSharePointFolders()
  if (fallback) return NextResponse.json({ folders, fallback: true })
  return NextResponse.json({ folders })
}
