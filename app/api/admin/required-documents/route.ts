import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET: all processing fee types with their required documents
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_required_documents')
  if (auth.error) return auth.error

  try {
    const { data: types, error: typesErr } = await supabase
      .from('processing_fee_types')
      .select('id, name, code, is_active, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (typesErr) throw typesErr

    const { data: docs, error: docsErr } = await supabase
      .from('required_documents')
      .select('id, processing_fee_type_id, name, description, is_required, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (docsErr) throw docsErr

    return NextResponse.json({ types: types || [], docs: docs || [] })
  } catch (err: any) {
    console.error('required-documents GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: add a required document to a processing fee type
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_required_documents')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { processing_fee_type_id, name, description, is_required, display_order } = body

    if (!processing_fee_type_id || !name?.trim()) {
      return NextResponse.json({ error: 'processing_fee_type_id and name are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('required_documents')
      .insert({
        processing_fee_type_id,
        name: name.trim(),
        description: description?.trim() || null,
        is_required: is_required ?? true,
        display_order: display_order ?? 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ doc: data })
  } catch (err: any) {
    console.error('required-documents POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT: update a required document
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_required_documents')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { id, name, description, is_required, display_order, is_active } = body

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updates: any = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (is_required !== undefined) updates.is_required = is_required
    if (display_order !== undefined) updates.display_order = display_order
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('required_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ doc: data })
  } catch (err: any) {
    console.error('required-documents PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: deactivate (soft delete) a required document
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_required_documents')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('required_documents')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('required-documents DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
