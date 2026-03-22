import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

// DELETE - Delete campaign (permanent delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params

    const { error } = await supabase.from('campaigns').delete().eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Campaign deleted successfully' })
  } catch (error) {
    console.error('Delete campaign error:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
