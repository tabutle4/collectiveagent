import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

// POST - Duplicate email template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    // Normalize and validate ID
    const normalizedId = normalizeUuidInput(resolvedParams?.id)
    if (!normalizedId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Fetch the original template
    const { data: originalTemplate, error: fetchError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', normalizedId)
       
      .single()

    if (fetchError) throw fetchError

    if (!originalTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Create duplicate with modified name and without default status
    // Handle both subject and subject_line fields (database may have been updated)
    const subjectValue = originalTemplate.subject || originalTemplate.subject_line || 'Campaign Email'
    
    const duplicateData: any = {
      name: `${originalTemplate.name} (Copy)`,
      description: originalTemplate.description,
      category: originalTemplate.category || 'campaign',
      template_type: originalTemplate.template_type || originalTemplate.category || 'campaign', // Required column - use template_type from original or fallback to category
      design_type: originalTemplate.design_type || 'standard', // Required column - use design_type from original or default to 'standard'
      html_content: originalTemplate.html_content,
      subject: subjectValue, // Required column
      variables: originalTemplate.variables || [],
      logo_url: originalTemplate.logo_url || '/logo.png',
      is_default: false, // Don't duplicate default status
      is_active: originalTemplate.is_active !== undefined ? originalTemplate.is_active : true,
    }
    
    // Also set subject_line if the column exists (for backward compatibility)
    if (originalTemplate.subject_line !== undefined) {
      duplicateData.subject_line = subjectValue
    }

    const { data: newTemplate, error: insertError } = await supabase
      .from('email_templates')
      .insert([duplicateData])
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ template: newTemplate, message: 'Template duplicated successfully' })
  } catch (error: any) {
    console.error('Duplicate email template error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to duplicate email template' },
      { status: error?.code ? 400 : 500 }
    )
  }
}

