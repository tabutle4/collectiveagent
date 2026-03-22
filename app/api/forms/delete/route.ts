import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Form ID is required' }, { status: 400 })
    }

    const { error } = await supabase.from('forms').delete().eq('id', id)

    if (error) {
      console.error('Error deleting form:', error)
      return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('Error deleting form:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete form' }, { status: 500 })
  }
}
