import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/forms/notification-emails?id=<formId>
// Returns the notification email list for a specific form.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Form id is required' }, { status: 400 })

    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, name, notification_emails')
      .eq('id', id)
      .maybeSingle()

    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    return NextResponse.json({ emails: form.notification_emails || [], name: form.name })
  } catch (err: any) {
    console.error('forms notification-emails GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/forms/notification-emails
// Body: { id: string, emails: string[] }
// Saves the notification email list for a specific form.
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const { id, emails } = await request.json()
    if (!id) return NextResponse.json({ error: 'Form id is required' }, { status: 400 })
    if (!Array.isArray(emails)) return NextResponse.json({ error: 'emails must be an array' }, { status: 400 })

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

    const { error } = await supabaseAdmin
      .from('forms')
      .update({ notification_emails: cleaned, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true, emails: cleaned })
  } catch (err: any) {
    console.error('forms notification-emails PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
