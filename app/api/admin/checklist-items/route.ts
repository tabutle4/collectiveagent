import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// The two editable checklists. Leases use the 'payouts' (Commission Check
// Processing) template, sales use the 'cda' (CDA Checklist) template. Both
// exist in checklist_templates.
const CHECKLIST_SLUGS = ['payouts', 'cda']

// GET: checklist items for one template (?template=payouts|cda), plus the list
// of available templates so the page can offer a selector.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checklists')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const templateSlug = searchParams.get('template') || 'payouts'

    const { data: templates, error: templatesErr } = await supabase
      .from('checklist_templates')
      .select('id, slug')
      .in('slug', CHECKLIST_SLUGS)
      .order('slug', { ascending: true })

    if (templatesErr) throw templatesErr

    const template = (templates || []).find(t => t.slug === templateSlug)
    if (!template) {
      return NextResponse.json({ error: 'Unknown checklist template' }, { status: 400 })
    }

    // Return active and inactive items so the is_active toggle is reversible in
    // the UI. checklist_items has a single is_active flag (no separate is_required
    // like required_documents), so hiding inactive items would make the toggle
    // one-way. Inactive items render dimmed on the page.
    const { data: items, error: itemsErr } = await supabase
      .from('checklist_items')
      .select('id, checklist_template_id, section, label, description, display_order, is_active')
      .eq('checklist_template_id', template.id)
      .order('display_order', { ascending: true })

    if (itemsErr) throw itemsErr

    return NextResponse.json({ templates: templates || [], items: items || [] })
  } catch (err: any) {
    console.error('checklist-items GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: add a checklist item to a template (resolved from a template slug)
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checklists')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { template, section, label, description, display_order } = body

    if (!template || !label?.trim()) {
      return NextResponse.json({ error: 'template and label are required' }, { status: 400 })
    }

    const { data: tmpl, error: tmplErr } = await supabase
      .from('checklist_templates')
      .select('id')
      .eq('slug', template)
      .single()

    if (tmplErr) throw tmplErr
    if (!tmpl) return NextResponse.json({ error: 'Unknown checklist template' }, { status: 400 })

    const { data, error } = await supabase
      .from('checklist_items')
      .insert({
        checklist_template_id: tmpl.id,
        section: section?.trim() || null,
        label: label.trim(),
        description: description?.trim() || null,
        display_order: display_order ?? 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('checklist-items POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT: update a checklist item (also used for reordering via display_order)
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checklists')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { id, section, label, description, display_order, is_active } = body

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updates: any = {}
    if (label !== undefined) updates.label = label.trim()
    if (section !== undefined) updates.section = section?.trim() || null
    if (description !== undefined) updates.description = description?.trim() || null
    if (display_order !== undefined) updates.display_order = display_order
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('checklist_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('checklist-items PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: deactivate (soft delete) a checklist item
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checklists')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('checklist_items')
      .update({ is_active: false })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('checklist-items DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
