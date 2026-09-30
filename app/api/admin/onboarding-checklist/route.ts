import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// The two onboarding lists, both of which were SQL-only before this page.
//
//   items - onboarding_checklist_items, the list agents work through at
//           /agent/checklist. Grouped into sections.
//   tasks - onboarding_admin_tasks, the office's own list on the onboarding
//           tracker. Ordered separately per agent_variant, because the
//           standard and referral lists each number from 1.
type ListName = 'items' | 'tasks'

const TABLES: Record<ListName, string> = {
  items: 'onboarding_checklist_items',
  tasks: 'onboarding_admin_tasks',
}

const SELECTS: Record<ListName, string> = {
  items:
    'id, section, section_title, item_key, label, description, priority, link_text, link_url, second_link_text, second_link_url, display_order, is_active',
  tasks: 'id, label, description, agent_variant, display_order, is_active',
}

function parseList(value: string | null): ListName | null {
  return value === 'items' || value === 'tasks' ? value : null
}

// onboarding_admin_tasks numbers each agent_variant from 1, so every ordering
// operation on that table has to be scoped to one variant or the two lists
// interleave. onboarding_checklist_items has a single sequence.
function variantFilter(list: ListName, agentVariant?: string | null) {
  return list === 'tasks' ? (agentVariant === 'referral' ? 'referral' : 'standard') : null
}

// Renumber one list contiguously from 1, active rows first in their current
// order, retired rows after them.
//
// Done in two passes, because this is a loop of individual updates rather than
// one transaction. Pass one parks every row above the highest number in use;
// pass two brings them down to 1..N. Since the parking range and the final
// range never overlap, no two rows share a display_order at any point, so a
// failure midway leaves the list parked but still unambiguous rather than with
// two active items fighting over the same number. Reordering one place with the
// arrows is the only way order changes, so a parked list is repaired by the
// next successful operation.
async function renumber(list: ListName, agentVariant: string | null) {
  let query = supabase
    .from(TABLES[list])
    .select('id, display_order, is_active')
    .order('display_order', { ascending: true })

  if (agentVariant) query = query.eq('agent_variant', agentVariant)

  const { data: rows, error } = await query
  if (error) throw error

  const all = rows || []
  const ordered = [...all.filter(r => r.is_active), ...all.filter(r => !r.is_active)]

  // Already correct: nothing to do, and no writes to fail.
  const alreadyRight = ordered.every((row, i) => row.display_order === i + 1)
  if (alreadyRight) return

  const highest = all.reduce((max, r) => Math.max(max, r.display_order || 0), 0)
  const park = Math.max(highest, ordered.length) + 1

  for (let i = 0; i < ordered.length; i++) {
    const { error: parkErr } = await supabase
      .from(TABLES[list])
      .update({ display_order: park + i })
      .eq('id', ordered[i].id)
    if (parkErr) throw parkErr
  }

  for (let i = 0; i < ordered.length; i++) {
    const { error: finalErr } = await supabase
      .from(TABLES[list])
      .update({ display_order: i + 1 })
      .eq('id', ordered[i].id)
    if (finalErr) throw finalErr
  }
}

// GET /api/admin/onboarding-checklist?list=items|tasks
// Returns active and retired rows together so the Active toggle is reversible,
// plus the distinct sections already in use so the editor can offer them.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_onboarding_checklist')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const list = parseList(searchParams.get('list')) || 'items'

    const { data: rows, error } = await supabase
      .from(TABLES[list])
      .select(SELECTS[list])
      .order('display_order', { ascending: true })

    if (error) throw error

    // Section key to heading, taken from the rows themselves so the editor
    // never invents a section the agent page does not already group by.
    const sections: { section: string; section_title: string }[] = []
    if (list === 'items') {
      for (const row of (rows || []) as any[]) {
        if (row.section && !sections.some(s => s.section === row.section)) {
          sections.push({ section: row.section, section_title: row.section_title })
        }
      }
    }

    return NextResponse.json({ list, rows: rows || [], sections })
  } catch (err: any) {
    console.error('onboarding-checklist GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: add a row to either list. New rows go to the end and the list is
// renumbered, so a caller cannot choose a colliding display_order.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_onboarding_checklist')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const list = parseList(body.list)
    if (!list) return NextResponse.json({ error: 'list must be items or tasks' }, { status: 400 })
    if (!body.label?.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }

    const agentVariant = variantFilter(list, body.agent_variant)

    let insert: any
    if (list === 'items') {
      if (!body.item_key?.trim()) {
        return NextResponse.json({ error: 'item_key is required' }, { status: 400 })
      }
      if (!body.section?.trim() || !body.section_title?.trim()) {
        return NextResponse.json(
          { error: 'section and section_title are required' },
          { status: 400 }
        )
      }

      // item_key is how the code finds a specific item - the MLS card is
      // rendered by matching item_key === 'mls_setup'. A duplicate would make
      // that match ambiguous, so it is rejected here rather than at the page.
      const { data: clash, error: clashErr } = await supabase
        .from('onboarding_checklist_items')
        .select('id')
        .eq('item_key', body.item_key.trim())

      if (clashErr) throw clashErr
      if (clash && clash.length > 0) {
        return NextResponse.json({ error: 'That item key is already in use' }, { status: 400 })
      }

      insert = {
        section: body.section.trim(),
        section_title: body.section_title.trim(),
        item_key: body.item_key.trim(),
        label: body.label.trim(),
        description: body.description?.trim() || null,
        priority: body.priority === 'high' ? 'high' : 'normal',
        link_text: body.link_text?.trim() || null,
        link_url: body.link_url?.trim() || null,
        second_link_text: body.second_link_text?.trim() || null,
        second_link_url: body.second_link_url?.trim() || null,
        display_order: 9999,
        is_active: true,
      }
    } else {
      insert = {
        label: body.label.trim(),
        description: body.description?.trim() || null,
        agent_variant: agentVariant,
        display_order: 9999,
        is_active: true,
      }
    }

    const { data, error } = await supabase
      .from(TABLES[list])
      .insert(insert)
      .select(SELECTS[list])
      .single()

    if (error) throw error

    await renumber(list, agentVariant)

    return NextResponse.json({ row: data })
  } catch (err: any) {
    console.error('onboarding-checklist POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT: edit a row's fields, toggle it active, or move it one place in the
// order. Every path finishes by renumbering, so display_order stays contiguous
// whatever the caller does.
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_onboarding_checklist')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const list = parseList(body.list)
    if (!list) return NextResponse.json({ error: 'list must be items or tasks' }, { status: 400 })
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: current, error: currentErr } = await supabase
      .from(TABLES[list])
      .select(SELECTS[list])
      .eq('id', body.id)
      .single()

    if (currentErr) throw currentErr
    if (!current) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

    const agentVariant = variantFilter(list, (current as any).agent_variant)

    // Move one place up or down, among the active rows of this list only. The
    // two rows swap numbers and the list is renumbered, which is why this can
    // never produce the duplicate display_order the agent checklist had.
    if (body.action === 'move') {
      if (body.direction !== 'up' && body.direction !== 'down') {
        return NextResponse.json({ error: 'direction must be up or down' }, { status: 400 })
      }
      if (!(current as any).is_active) {
        return NextResponse.json({ error: 'Reactivate the row before moving it' }, { status: 400 })
      }

      let listQuery = supabase
        .from(TABLES[list])
        .select('id, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (agentVariant) listQuery = listQuery.eq('agent_variant', agentVariant)

      const { data: ordered, error: orderedErr } = await listQuery
      if (orderedErr) throw orderedErr

      const rows = ordered || []
      const index = rows.findIndex(r => r.id === body.id)
      if (index === -1) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

      const swapWith = body.direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= rows.length) {
        // Already at the end it was asked to move toward. Not an error, and
        // the page keeps its arrows disabled there anyway.
        return NextResponse.json({ success: true, moved: false })
      }

      const a = rows[index]
      const b = rows[swapWith]

      const { error: aErr } = await supabase
        .from(TABLES[list])
        .update({ display_order: b.display_order })
        .eq('id', a.id)
      if (aErr) throw aErr

      const { error: bErr } = await supabase
        .from(TABLES[list])
        .update({ display_order: a.display_order })
        .eq('id', b.id)
      if (bErr) throw bErr

      await renumber(list, agentVariant)
      return NextResponse.json({ success: true, moved: true })
    }

    // Field edits. display_order is deliberately not accepted - ordering only
    // changes through the move action above, which cannot collide.
    const updates: any = {}
    if (body.label !== undefined) {
      if (!body.label?.trim()) {
        return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 })
      }
      updates.label = body.label.trim()
    }
    if (body.description !== undefined) updates.description = body.description?.trim() || null
    if (body.is_active !== undefined) updates.is_active = !!body.is_active

    if (list === 'items') {
      if (body.section !== undefined || body.section_title !== undefined) {
        if (!body.section?.trim() || !body.section_title?.trim()) {
          return NextResponse.json(
            { error: 'section and section_title must be set together' },
            { status: 400 }
          )
        }
        updates.section = body.section.trim()
        updates.section_title = body.section_title.trim()
      }
      if (body.priority !== undefined)
        updates.priority = body.priority === 'high' ? 'high' : 'normal'
      if (body.link_text !== undefined) updates.link_text = body.link_text?.trim() || null
      if (body.link_url !== undefined) updates.link_url = body.link_url?.trim() || null
      if (body.second_link_text !== undefined) {
        updates.second_link_text = body.second_link_text?.trim() || null
      }
      if (body.second_link_url !== undefined) {
        updates.second_link_url = body.second_link_url?.trim() || null
      }
      // item_key is never editable. The agent page matches on it
      // (item_key === 'mls_setup' renders the MLS card), so changing one would
      // silently turn a working item into a plain row.
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // Stamped only once there is a real change, so the guard above still works.
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from(TABLES[list])
      .update(updates)
      .eq('id', body.id)
      .select(SELECTS[list])
      .single()

    if (error) throw error

    // Activating or retiring a row changes which numbers the active list needs.
    if (body.is_active !== undefined) await renumber(list, agentVariant)

    return NextResponse.json({ row: data })
  } catch (err: any) {
    console.error('onboarding-checklist PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: retire a row. Never a hard delete - agents' completion rows point at
// onboarding_checklist_items, and 32 of them point at the Brokermint item
// retired this way. Retiring keeps that history and is reversible from the
// Active toggle.
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_onboarding_checklist')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const list = parseList(searchParams.get('list'))
    const id = searchParams.get('id')
    if (!list) return NextResponse.json({ error: 'list must be items or tasks' }, { status: 400 })
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: current, error: currentErr } = await supabase
      .from(TABLES[list])
      .select(SELECTS[list])
      .eq('id', id)
      .single()

    if (currentErr) throw currentErr
    if (!current) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

    const { error } = await supabase
      .from(TABLES[list])
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    await renumber(list, variantFilter(list, (current as any).agent_variant))

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('onboarding-checklist DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
