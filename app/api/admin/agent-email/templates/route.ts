import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CATEGORY = 'agent_email'

// GET - List templates in the agent_email category.
// Gated by can_view_agent_email.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_email')
  if (auth.error) return auth.error

  try {
    const rows = await fetchAllRows<{
      id: string
      name: string
      description: string | null
      subject_line: string
      html_content: string
      created_at: string
    }>('email_templates', 'id, name, description, subject_line, html_content, created_at', {
      filters: [{ type: 'eq', column: 'category', value: CATEGORY }],
      orderBy: { column: 'name', ascending: true },
    })
    return NextResponse.json({ templates: rows })
  } catch (err: any) {
    console.error('templates GET error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load templates' }, { status: 500 })
  }
}

// POST - Create a new template (save-as-template from the composer).
// Body: { name: string, subjectLine: string, bodyText: string }
// bodyText is the composer body (plain text). We store as html_content
// for compatibility with the existing email_templates schema, wrapped in
// simple <p> tags.
// Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    const subjectLine = String(body?.subjectLine || '').trim() || '(no subject)'
    const bodyText = String(body?.bodyText || '').trim()

    if (!name) return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
    if (!bodyText) return NextResponse.json({ error: 'Template body is required' }, { status: 400 })

    const htmlContent = bodyText
      .split(/\n\n+/)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('')

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .insert({
        name,
        description: null,
        category: CATEGORY,
        html_content: htmlContent,
        subject_line: subjectLine,
        variables: [],
        logo_url: '/logo.png',
        is_default: false,
        is_active: true,
      })
      .select('id, name, subject_line, html_content')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, template: data })
  } catch (err: any) {
    console.error('templates POST error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to save template' }, { status: 500 })
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
