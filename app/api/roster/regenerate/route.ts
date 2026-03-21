import { NextResponse } from 'next/server'
import { regenerateRoster } from '@/lib/rosterGenerator'

export async function POST() {
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
