import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { regenerateRoster } from '@/lib/rosterGenerator'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_regenerate_roster')
  if (auth.error) return auth.error

  try {
    const result = await regenerateRoster()
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Roster regenerate error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to regenerate roster' },
      { status: 500 }
    )
  }
}
