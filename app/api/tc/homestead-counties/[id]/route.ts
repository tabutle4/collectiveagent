import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * PATCH  /api/tc/homestead-counties/[id]  Update one county
 * DELETE /api/tc/homestead-counties/[id]  Delete (only if no transactions reference it)
 */

const normalizeUuidInput = (value: string | null | undefined): string | null => {
  if (
    !value ||
    value === 'undefined' ||
    value === 'null' ||
    value === '' ||
    typeof value !== 'string'
  ) {
    return null
  }
  return value
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = normalizeUuidInput(resolvedParams?.id)
    if (!id) {
      return NextResponse.json({ error: 'County ID is required' }, { status: 400 })
    }

    const body = await request.json()
    // Only write fields the client actually sent. Unset vs empty string vs
    // null all need different treatment for URL and notes (null = clear,
    // undefined = dont touch).
    const update: Record<string, unknown> = {}

    if (typeof body.county_name === 'string' && body.county_name.trim()) {
      update.county_name = body.county_name.trim()
    }
    if (typeof body.state === 'string' && body.state.trim()) {
      update.state = body.state.trim().toUpperCase()
    }
    if ('link_url' in body) {
      const v = body.link_url
      if (v === null || v === '') {
        update.link_url = null
      } else if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed && !/^https?:\/\//i.test(trimmed)) {
          return NextResponse.json(
            { error: 'Link URL must start with http:// or https://' },
            { status: 400 }
          )
        }
        update.link_url = trimmed || null
      }
    }
    if ('notes' in body) {
      const v = body.notes
      update.notes = typeof v === 'string' && v.trim() ? v.trim() : null
    }
    if (typeof body.is_active === 'boolean') {
      update.is_active = body.is_active
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('homestead_links')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A county with that name and state already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    if (!data) {
      return NextResponse.json({ error: 'County not found' }, { status: 404 })
    }

    return NextResponse.json({ county: data })
  } catch (error) {
    console.error('Update homestead county error:', error)
    return NextResponse.json({ error: 'Failed to update homestead county' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = normalizeUuidInput(resolvedParams?.id)
    if (!id) {
      return NextResponse.json({ error: 'County ID is required' }, { status: 400 })
    }

    // Block delete if any transaction references this county. Preserves
    // referential integrity without needing ON DELETE RESTRICT at the DB
    // level (which would throw an unfriendly Postgres error).
    const { count, error: countError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('homestead_county_id', id)

    if (countError) throw countError

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete. ${count} transaction(s) reference this county. Deactivate it instead.`,
        },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('homestead_links').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete homestead county error:', error)
    return NextResponse.json({ error: 'Failed to delete homestead county' }, { status: 500 })
  }
}
