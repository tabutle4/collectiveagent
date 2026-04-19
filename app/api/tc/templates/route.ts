import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import type { TcEmailTemplate } from '@/types/tc-module'

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
 *     // Flat list of all templates (used by the search filter in the
 *     // admin page so search can find templates that are not yet
 *     // referenced by any step).
 *     all: TcEmailTemplate[]
 *   }
 *
 * Phase 1: read-only. POST/PATCH/DELETE come in Phase 1 completion.
 */

type SectionKey = 'buyer' | 'nc_buyer' | 'seller'
const SECTION_KEYS: SectionKey[] = ['buyer', 'nc_buyer', 'seller']

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    // Fetch all templates
    const { data: templatesData, error: templatesError } = await supabase
      .from('tc_email_templates')
      .select('*')
      .order('name', { ascending: true })

    if (templatesError) throw templatesError

    // Fetch all steps with their (transaction_type, step_order, template_id).
    // We need this to build the per-section ordered template lists.
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

    // Build index: template_id -> template
    const byId = new Map<string, TcEmailTemplate>()
    for (const t of templates) byId.set(t.id, t)

    // For each section, collect the minimum step_order per template_id.
    // (If a template is used in multiple steps within the same section,
    // we display it at its earliest position.)
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
      // Turn the map into a sorted array of templates
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
