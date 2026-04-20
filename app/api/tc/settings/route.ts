import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET /api/tc/settings
 *
 * Returns the singleton tc_settings row. A unique index on (true) in
 * 01_schema.sql guarantees at most one row. Uses .maybeSingle() so the
 * response is gracefully null if the seed has not yet been run.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase.from('tc_settings').select('*').maybeSingle()

    if (error) throw error

    return NextResponse.json({ settings: data || null })
  } catch (error) {
    console.error('Get TC settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC settings' }, { status: 500 })
  }
}

/**
 * PATCH /api/tc/settings
 *
 * Updates the singleton tc_settings row. Banner upload goes through a
 * separate endpoint (/api/tc/settings/upload-banner) so this route does
 * not need to handle file uploads.
 *
 * Accepts any subset of:
 *   - signature_html_template   (HTML string)
 *   - tc_calendar_group_id      (M365 group UUID)
 *   - office_email              (email)
 *   - office_phone              (freeform phone)
 *   - default_reply_to          (email)
 *   - google_review_link        (URL)
 *   - office_locations_html     (HTML string)
 *
 * Fields that are omitted from the body are not touched. Sending null
 * for nullable fields clears them.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const update: Record<string, unknown> = {}

    // Email field helper. Accepts strings with a loose email shape.
    // When `required` is true (for NOT NULL columns like office_email and
    // default_reply_to), empty or null values are rejected. Otherwise
    // empty/null clears the field.
    const setEmail = (key: string, { required = false } = {}) => {
      if (!(key in body)) return
      const v = body[key]
      if (v === null || v === '') {
        if (required) {
          throw new Error(`${key} is required`)
        }
        update[key] = null
        return
      }
      if (typeof v !== 'string') {
        throw new Error(`${key} must be a string`)
      }
      const trimmed = v.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error(`${key} must be a valid email address`)
      }
      update[key] = trimmed
    }

    // URL field helper. Requires http/https scheme or null.
    const setUrl = (key: string) => {
      if (!(key in body)) return
      const v = body[key]
      if (v === null || v === '') {
        update[key] = null
        return
      }
      if (typeof v !== 'string') {
        throw new Error(`${key} must be a string`)
      }
      const trimmed = v.trim()
      if (!/^https?:\/\//i.test(trimmed)) {
        throw new Error(`${key} must start with http:// or https://`)
      }
      update[key] = trimmed
    }

    // Freeform text. Empty string stored as null for nullable columns.
    const setText = (key: string, { required = false } = {}) => {
      if (!(key in body)) return
      const v = body[key]
      if (v === null || v === '') {
        if (required) {
          throw new Error(`${key} is required`)
        }
        update[key] = null
        return
      }
      if (typeof v !== 'string') {
        throw new Error(`${key} must be a string`)
      }
      update[key] = v
    }

    // Phone field. Store as entered (no format enforcement since
    // international phones vary widely).
    const setPhone = (key: string) => {
      if (!(key in body)) return
      const v = body[key]
      if (v === null || v === '') {
        update[key] = null
        return
      }
      if (typeof v !== 'string') {
        throw new Error(`${key} must be a string`)
      }
      update[key] = v.trim()
    }

    // office_email and default_reply_to have NOT NULL in the schema, so
    // reject empty values. The other fields allow null to clear.
    try {
      setEmail('office_email', { required: true })
      setEmail('default_reply_to', { required: true })
      setUrl('google_review_link')
      setText('signature_html_template')
      setText('office_locations_html')
      setText('tc_calendar_group_id')
      setPhone('office_phone')
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Invalid input'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()
    update.updated_by = auth.user.id

    // Locate the singleton row.
    const { data: settingsRow, error: fetchError } = await supabase
      .from('tc_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      console.error('tc_settings fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to read settings row', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!settingsRow) {
      return NextResponse.json(
        { error: 'tc_settings row missing. Run 03_seed_settings.sql.' },
        { status: 500 }
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from('tc_settings')
      .update(update)
      .eq('id', settingsRow.id)
      .select()
      .single()

    if (updateError) {
      console.error('tc_settings update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update settings', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ settings: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Update TC settings error:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
