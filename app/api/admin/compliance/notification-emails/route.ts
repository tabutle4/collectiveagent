import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const LINKED_FORM_TYPE = 'compliance_cda'
const FORM_DEFAULTS = {
  name: 'Compliance & CDA Request',
  form_type: 'compliance-cda',
  description: 'Request compliance review and commission disbursement authorization for a transaction.',
  display_order: 3,
}

// GET /api/admin/compliance/notification-emails
// Returns the current notification email list for the compliance form.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, notification_emails')
      .eq('linked_form_type', LINKED_FORM_TYPE)
      .maybeSingle()

    return NextResponse.json({
      emails: form?.notification_emails || [],
      form_exists: !!form,
    })
  } catch (err: any) {
    console.error('notification-emails GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/admin/compliance/notification-emails
// Body: { emails: string[] }
// Upserts the compliance_cda forms row and saves the notification email list.
// Creating the row here also makes the form appear on the admin forms page.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const { emails } = await request.json()

    if (!Array.isArray(emails)) {
      return NextResponse.json({ error: 'emails must be an array' }, { status: 400 })
    }

    // Validate + normalize each email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const cleaned: string[] = []
    for (const raw of emails) {
      const e = String(raw || '').trim().toLowerCase()
      if (!e) continue
      if (!emailRegex.test(e)) {
        return NextResponse.json({ error: `Invalid email address: ${raw}` }, { status: 400 })
      }
      if (!cleaned.includes(e)) cleaned.push(e)
    }

    const now = new Date().toISOString()

    // Check if the forms row already exists
    const { data: existing } = await supabaseAdmin
      .from('forms')
      .select('id')
      .eq('linked_form_type', LINKED_FORM_TYPE)
      .maybeSingle()

    if (existing) {
      const { error } = await supabaseAdmin
        .from('forms')
        .update({ notification_emails: cleaned, updated_at: now })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('forms')
        .insert({
          name: FORM_DEFAULTS.name,
          form_type: FORM_DEFAULTS.form_type,
          linked_form_type: LINKED_FORM_TYPE,
          description: FORM_DEFAULTS.description,
          display_order: FORM_DEFAULTS.display_order,
          notification_emails: cleaned,
          is_active: true,
          updated_at: now,
        })
      if (error) throw error
    }

    return NextResponse.json({ success: true, emails: cleaned })
  } catch (err: any) {
    console.error('notification-emails POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
