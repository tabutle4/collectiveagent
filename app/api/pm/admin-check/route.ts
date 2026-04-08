import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Check if current user has PM admin access (for portal preview mode)
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  
  if (auth.error) {
    return NextResponse.json({ isAdmin: false })
  }

  // Check if user has PM management permission
  const hasPermission = auth.permissions.has('can_manage_pm')

  return NextResponse.json({ 
    isAdmin: hasPermission,
    userId: auth.user.id
  })
}
