import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', resolvedParams.id)
      .eq('status', 'prospect')
      .single()

    if (error) throw error

    // Strip sensitive fields
    const { password_hash, reset_token, reset_token_expires, ...safeProspect } = data

    return NextResponse.json({ prospect: safeProspect })
  } catch (error: any) {
    console.error('Error fetching prospect:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    // Only allow certain fields to be updated
    const allowedFields = ['prospect_status', 'notes']
    const filteredUpdates: Record<string, any> = {}
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { error } = await supabase
      .from('users')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)
      .eq('status', 'prospect')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating prospect:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}