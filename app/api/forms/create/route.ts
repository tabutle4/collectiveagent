import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFormToken, getFormLinkUrl } from '@/lib/magic-links'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    const { name, description, form_type, form_config, created_by } = body

    if (!name || !form_type) {
      return NextResponse.json({ error: 'Name and form_type are required' }, { status: 400 })
    }

    // Generate shareable token and link (supports any form type)
    const token = await generateFormToken(form_type)
    const linkUrl = getFormLinkUrl(token, form_type)

    // Get max display_order
    const { data: existingForms } = await supabase
      .from('forms')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)

    const displayOrder =
      existingForms && existingForms.length > 0 ? (existingForms[0].display_order || 0) + 1 : 0

    // Create form
    const { data: form, error } = await supabase
      .from('forms')
      .insert({
        name,
        description: description || null,
        form_type,
        shareable_token: token,
        shareable_link_url: linkUrl,
        form_config: form_config || {},
        created_by: created_by || null,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating form:', error)
      return NextResponse.json({ error: 'Failed to create form' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      form,
    })
  } catch (error: any) {
    console.error('Error creating form:', error)
    return NextResponse.json({ error: error.message || 'Failed to create form' }, { status: 500 })
  }
}
