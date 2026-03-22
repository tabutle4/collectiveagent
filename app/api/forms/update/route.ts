import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'Form ID is required' }, { status: 400 })
    }

    const { data: form, error } = await supabase
      .from('forms')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating form:', error)
      return NextResponse.json({ error: 'Failed to update form' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      form,
    })
  } catch (error: any) {
    console.error('Error updating form:', error)
    return NextResponse.json({ error: error.message || 'Failed to update form' }, { status: 500 })
  }
}
