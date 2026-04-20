import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import type { TcEmailTemplate, TcAttachmentRef } from '@/types/tc-module'

/**
 * GET /api/tc/templates
 *
 * Returns templates grouped by the section they appear in (buyer,
 * nc_buyer, seller). A template with transaction_type='all' or a
 * template referenced by steps in multiple sections appears in EACH
 * section it applies to, ordered by the step_order of its earliest
 * referencing step within that section.
 *
 * Response shape:
 *   {
 *     sections: {
 *       buyer:    TcEmailTemplate[],   // in step order
 *       nc_buyer: TcEmailTemplate[],   // in step order
 *       seller:   TcEmailTemplate[],   // in step order
 *     },
 *     all: TcEmailTemplate[]  // flat list for search over orphans
 *   }
 */

type SectionKey = 'buyer' | 'nc_buyer' | 'seller'
const SECTION_KEYS: SectionKey[] = ['buyer', 'nc_buyer', 'seller']

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data: templatesData, error: templatesError } = await supabase
      .from('tc_email_templates')
      .select('*')
      .order('name', { ascending: true })

    if (templatesError) throw templatesError

    const { data: stepsData, error: stepsError } = await supabase
      .from('tc_process_steps')
      .select('transaction_type, step_order, template_id')
      .not('template_id', 'is', null)

    if (stepsError) throw stepsError

    const templates = (templatesData || []) as TcEmailTemplate[]
    const steps = (stepsData || []) as Array<{
      transaction_type: SectionKey
      step_order: number
      template_id: string
    }>

    const byId = new Map<string, TcEmailTemplate>()
    for (const t of templates) byId.set(t.id, t)

    const sections: Record<SectionKey, TcEmailTemplate[]> = {
      buyer: [],
      nc_buyer: [],
      seller: [],
    }

    for (const section of SECTION_KEYS) {
      const minOrderByTemplate = new Map<string, number>()
      for (const step of steps) {
        if (step.transaction_type !== section) continue
        const existing = minOrderByTemplate.get(step.template_id)
        if (existing === undefined || step.step_order < existing) {
          minOrderByTemplate.set(step.template_id, step.step_order)
        }
      }
      const sectionEntries: Array<{ order: number; template: TcEmailTemplate }> = []
      for (const [templateId, order] of minOrderByTemplate) {
        const template = byId.get(templateId)
        if (template) sectionEntries.push({ order, template })
      }
      sectionEntries.sort((a, b) => a.order - b.order || a.template.name.localeCompare(b.template.name))
      sections[section] = sectionEntries.map(e => e.template)
    }

    return NextResponse.json({ sections, all: templates })
  } catch (error) {
    console.error('Get TC templates error:', error)
    return NextResponse.json({ error: 'Failed to fetch TC templates' }, { status: 500 })
  }
}

/**
 * POST /api/tc/templates
 *
 * Creates a new template. Required fields are name, slug, transaction_type,
 * category, subject. Body is optional so the user can create a shell and
 * fill it in. body_format defaults to 'html'.
 *
 * Slug uniqueness is enforced by the DB (UNIQUE constraint on slug).
 * A conflict returns a 409 with a helpful message.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const body = await request.json()

    // Validate required fields.
    const required = ['name', 'slug', 'transaction_type', 'category', 'subject'] as const
    for (const key of required) {
      if (!body[key] || typeof body[key] !== 'string' || body[key].trim() === '') {
        return NextResponse.json({ error: `${key} is required` }, { status: 400 })
      }
    }

    const validTxTypes = ['buyer', 'nc_buyer', 'seller', 'all']
    if (!validTxTypes.includes(body.transaction_type)) {
      return NextResponse.json(
        { error: `transaction_type must be one of: ${validTxTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const validFormats = ['html', 'plain_text']
    const body_format = body.body_format || 'html'
    if (!validFormats.includes(body_format)) {
      return NextResponse.json(
        { error: `body_format must be 'html' or 'plain_text'` },
        { status: 400 }
      )
    }

    // Slug format: lowercase letters, digits, underscores only.
    const slug = body.slug.trim().toLowerCase()
    if (!/^[a-z0-9_]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'slug may only contain lowercase letters, digits, and underscores' },
        { status: 400 }
      )
    }

    // Attachment refs are one of a known set.
    const validAttach: TcAttachmentRef[] = ['contract', 'addenda', 'amendment']
    const attach_documents = Array.isArray(body.attach_documents) ? body.attach_documents : []
    for (const a of attach_documents) {
      if (!validAttach.includes(a)) {
        return NextResponse.json(
          { error: `attach_documents contains invalid value: ${a}` },
          { status: 400 }
        )
      }
    }

    const insert = {
      name: body.name.trim(),
      slug,
      transaction_type: body.transaction_type,
      category: body.category.trim(),
      subject: body.subject.trim(),
      body_format,
      html_body: typeof body.html_body === 'string' ? body.html_body : null,
      plain_body: typeof body.plain_body === 'string' ? body.plain_body : null,
      default_recipient_roles: body.default_recipient_roles || {
        to: [],
        cc: [],
        bcc: [],
      },
      attach_documents,
      uses_banner: body.uses_banner === true,
      uses_signature: body.uses_signature !== false, // default true
      is_active: body.is_active !== false, // default true
      notes: typeof body.notes === 'string' ? body.notes : null,
      updated_by: auth.user.id,
    }

    const { data, error } = await supabase
      .from('tc_email_templates')
      .insert(insert)
      .select()
      .single()

    if (error) {
      // Duplicate slug violation from the UNIQUE constraint.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A template with slug "${slug}" already exists` },
          { status: 409 }
        )
      }
      console.error('Create TC template error:', error)
      return NextResponse.json(
        { error: 'Failed to create template', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ template: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Create TC template error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    )
  }
}
