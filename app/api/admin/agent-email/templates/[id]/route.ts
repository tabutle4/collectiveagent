import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CATEGORY = 'agent_email'

// PUT - Edit a template (agent_email category only).
// Body: { name?: string, subjectLine?: string, bodyText?: string }
// bodyText is plain text; stored as simple <p> html for schema compatibility.
// Gated by can_manage_agent_email.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (typeof body?.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim()
    }
    if (typeof body?.subjectLine === 'string') {
      patch.subject_line = body.subjectLine.trim() || '(no subject)'
    }
    if (typeof body?.bodyText === 'string' && body.bodyText.trim()) {
      patch.html_content = body.bodyText
        .trim()
        .split(/\n\n+/)
        .map((p: string) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('')
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // Scope the update to agent_email templates so this route can't touch
    // TC module or campaign templates that share the table.
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .update(patch)
      .eq('id', id)
      .eq('category', CATEGORY)
      .select('id, name, subject_line, html_content')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    return NextResponse.json({ success: true, template: data })
  } catch (err: any) {
    console.error('template PUT error:', err)
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 })
  }
}

// DELETE - Remove a template (agent_email category only).
// Gated by can_manage_agent_email.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', id)
      .eq('category', CATEGORY)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('template DELETE error:', err)
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
