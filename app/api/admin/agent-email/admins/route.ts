import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { getActiveAdmins, preferredDisplayName } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// GET - List active admins for the assign/escalate/waiting-on pickers.
// Includes the current user (Dale might reassign to herself, or you might
// want to escalate to yourself as a marker). The UI can filter if needed.
// Gated by can_view_agent_email.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const admins = await getActiveAdmins()
    return NextResponse.json({
      admins: admins.map(a => ({
        id: a.id,
        email: a.email,
        name: preferredDisplayName(a),
        role: a.role,
      })),
    })
  } catch (err: any) {
    console.error('admins list error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load admins' }, { status: 500 })
  }
}
