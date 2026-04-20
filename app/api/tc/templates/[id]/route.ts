import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import type { TcAttachmentRef } from '@/types/tc-module'

/**
 * GET    /api/tc/templates/[id]   Fetch a template with its full body.
 * PATCH  /api/tc/templates/[id]   Update any subset of editable fields.
 * DELETE /api/tc/templates/[id]   Soft-delete (sets is_active=false).
 *
 * The slug column has a UNIQUE constraint. PATCH allows changing the
 * slug but surfaces 409 on conflict. DELETE is soft so that any
 * historical reference (e.g. a scheduled event that fired before) can
 * still be traced back to the template that generated it.
 */

type Params = { params: Promise<{ id: string }> | { id: string } }

async function resolveId(params: Params['params']): Promise<string | null> {
  const resolved = params instanceof Promise ? await params : params
  const id = resolved?.id
  if (!id || typeof id !== 'string') return null
  return id
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const id = await resolveId(params)
    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tc_email_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    console.error('Get TC template error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC template' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const id = await resolveId(params)
    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const update: Record<string, unknown> = {}

    // --- String fields ---
    const stringKeys = ['name', 'category', 'subject', 'notes'] as const
    for (const key of stringKeys) {
      if (!(key in body)) continue
      const v = body[key]
      if (v === null) {
        if (key === 'notes') update.notes = null
        else return NextResponse.json({ error: `${key} cannot be null` }, { status: 400 })
        continue
      }
      if (typeof v !== 'string') {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 })
      }
      if (key !== 'notes' && v.trim() === '') {
        return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
      }
      update[key] = key === 'notes' ? v : v.trim()
    }

    // --- Slug (has UNIQUE constraint) ---
    if ('slug' in body) {
      if (typeof body.slug !== 'string' || !body.slug.trim()) {
        return NextResponse.json({ error: 'slug cannot be empty' }, { status: 400 })
      }
      const slug = body.slug.trim().toLowerCase()
      if (!/^[a-z0-9_]+$/.test(slug)) {
        return NextResponse.json(
          { error: 'slug may only contain lowercase letters, digits, and underscores' },
          { status: 400 }
        )
      }
      update.slug = slug
    }

    // --- Enum: transaction_type ---
    if ('transaction_type' in body) {
      const valid = ['buyer', 'nc_buyer', 'seller', 'all']
      if (!valid.includes(body.transaction_type)) {
        return NextResponse.json(
          { error: `transaction_type must be one of: ${valid.join(', ')}` },
          { status: 400 }
        )
      }
      update.transaction_type = body.transaction_type
    }

    // --- Enum: body_format ---
    if ('body_format' in body) {
      const valid = ['html', 'plain_text']
      if (!valid.includes(body.body_format)) {
        return NextResponse.json(
          { error: `body_format must be 'html' or 'plain_text'` },
          { status: 400 }
        )
      }
      update.body_format = body.body_format
    }

    // --- Body content ---
    // Accept either or both. Null clears the field, matching the column's
    // nullable schema. Empty string stored as null so the DB row never
    // carries an intentionally empty body.
    for (const key of ['html_body', 'plain_body'] as const) {
      if (!(key in body)) continue
      const v = body[key]
      if (v === null || v === '') {
        update[key] = null
        continue
      }
      if (typeof v !== 'string') {
        return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 })
      }
      update[key] = v
    }

    // --- Booleans ---
    for (const key of ['uses_banner', 'uses_signature', 'is_active'] as const) {
      if (!(key in body)) continue
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
      }
      update[key] = body[key]
    }

    // --- Attachments array ---
    if ('attach_documents' in body) {
      if (!Array.isArray(body.attach_documents)) {
        return NextResponse.json(
          { error: 'attach_documents must be an array' },
          { status: 400 }
        )
      }
      const valid: TcAttachmentRef[] = ['contract', 'addenda', 'amendment']
      for (const a of body.attach_documents) {
        if (!valid.includes(a)) {
          return NextResponse.json(
            { error: `attach_documents contains invalid value: ${a}` },
            { status: 400 }
          )
        }
      }
      update.attach_documents = body.attach_documents
    }

    // --- Recipient roles ---
    // Minimal validation: must be an object with {to, cc, bcc} arrays of
    // string role names. We let the DB store arbitrary role strings.
    if ('default_recipient_roles' in body) {
      const r = body.default_recipient_roles
      if (!r || typeof r !== 'object') {
        return NextResponse.json(
          { error: 'default_recipient_roles must be an object' },
          { status: 400 }
        )
      }
      for (const bucket of ['to', 'cc', 'bcc']) {
        const arr = (r as Record<string, unknown>)[bucket]
        if (arr !== undefined && !Array.isArray(arr)) {
          return NextResponse.json(
            { error: `default_recipient_roles.${bucket} must be an array` },
            { status: 400 }
          )
        }
      }
      update.default_recipient_roles = r
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()
    update.updated_by = auth.user.id

    const { data, error } = await supabase
      .from('tc_email_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Another template already has this slug' },
          { status: 409 }
        )
      }
      console.error('Update TC template error:', error)
      return NextResponse.json(
        { error: 'Failed to update template', details: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Update TC template error:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE  (soft-delete)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const id = await resolveId(params)
    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // Soft-delete: mark inactive. Historical scheduled events keep their
    // template_id reference; the template still exists for audit.
    const { data, error } = await supabase
      .from('tc_email_templates')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Delete TC template error:', error)
      return NextResponse.json(
        { error: 'Failed to archive template', details: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Delete TC template error:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
