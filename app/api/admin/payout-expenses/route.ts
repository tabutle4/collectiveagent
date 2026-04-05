import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { description, amount } = await request.json()
    if (!description?.trim()) return NextResponse.json({ error: 'Description required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('payout_expenses')
      .insert({ description: description.trim(), amount: amount ? parseFloat(amount) : null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ expense: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { error } = await supabaseAdmin.from('payout_expenses').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Payout expense delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}