import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/lib/api-auth'
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

// GET - Get single email template (any authenticated user can view)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    // Normalize and validate ID
    const normalizedId = normalizeUuidInput(resolvedParams?.id)
    if (!normalizedId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', normalizedId)
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    console.error('Get email template error:', error)
    return NextResponse.json({ error: 'Failed to fetch email template' }, { status: 500 })
  }
}

// PUT - Update email template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_email_templates')
  if (auth.error) return auth.error

  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    // Normalize and validate ID
    const normalizedId = normalizeUuidInput(resolvedParams?.id)
    if (!normalizedId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const body = await request.json()
    console.log('PUT /api/email-templates/[id] - Request body:', {
      id: normalizedId,
      name: body.name,
      subject_line: body.subject_line,
      has_html_content: !!body.html_content,
      html_content_length: body.html_content?.length || 0,
    })

    const {
      name,
      description,
      category,
      html_content,
      subject_line,
      variables,
      logo_url,
      is_default,
      is_active,
    } = body

    if (!name || !subject_line || !html_content) {
      return NextResponse.json(
        { error: 'Name, subject line, and HTML content are required' },
        { status: 400 }
      )
    }

    // If setting as default, unset all other defaults in same category
    if (is_default) {
      const { data: currentTemplate, error: fetchError } = await supabase
        .from('email_templates')
        .select('category')
        .eq('id', normalizedId)
        .single()

      if (fetchError) {
        console.error('Error fetching current template:', fetchError)
      } else if (currentTemplate) {
        const { error: unsetError } = await supabase
          .from('email_templates')
          .update({ is_default: false })
          .eq('category', currentTemplate.category || 'campaign')
          .eq('is_default', true)
          .neq('id', normalizedId)

        if (unsetError) {
          console.error('Error unsetting other defaults:', unsetError)
        }
      }
    }

    const updateData: any = {
      name: name.trim(),
      description: description?.trim() || null,
      category: category || 'campaign',
      html_content: html_content,
      subject_line: subject_line.trim(),
      variables: variables || [],
      logo_url: logo_url?.trim() || '/logo.png',
      is_default: is_default || false,
      is_active: is_active !== undefined ? is_active : true,
    }

    console.log('Updating template with data:', {
      id: normalizedId,
      ...updateData,
      html_content_length: updateData.html_content.length,
    })

    const { data, error } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', normalizedId)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      throw error
    }

    if (!data) {
      console.error('No data returned from update')
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    console.log('Template updated successfully:', { id: data.id, name: data.name })
    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Update email template error:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    })

    const errorMessage = error?.message || error?.details || 'Failed to update email template'
    return NextResponse.json({ error: errorMessage }, { status: error?.code ? 400 : 500 })
  }
}

// DELETE - Delete email template (cannot delete default templates)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_email_templates')
  if (auth.error) return auth.error

  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    // Normalize and validate ID
    const normalizedId = normalizeUuidInput(resolvedParams?.id)
    if (!normalizedId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // First check if template is default
    const { data: template, error: fetchError } = await supabase
      .from('email_templates')
      .select('is_default')
      .eq('id', normalizedId)
      .single()

    if (fetchError) throw fetchError

    if (template?.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete default template. Please set another template as default first.' },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('email_templates').delete().eq('id', normalizedId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete email template error:', error)
    if (error?.status === 400) {
      return NextResponse.json(
        { error: error.error || 'Cannot delete default template' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Failed to delete email template' }, { status: 500 })
  }
}
