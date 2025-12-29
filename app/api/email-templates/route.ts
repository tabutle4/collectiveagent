import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET - List all email templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    
    let query = supabase
      .from('email_templates')
      .select('*')
        // Exclude archived templates
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error) {
    console.error('Get email templates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email templates' },
      { status: 500 }
    )
  }
}

// POST - Create new email template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      category,
      html_content,
      subject_line,
      variables,
      logo_url,
      is_default,
    } = body

    if (!name || !html_content || !subject_line) {
      return NextResponse.json(
        { error: 'Name, HTML content, and subject line are required' },
        { status: 400 }
      )
    }

    // If setting as default, unset all other defaults in same category
    if (is_default) {
      await supabase
        .from('email_templates')
        .update({ is_default: false })
        .eq('category', category || 'campaign')
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('email_templates')
      .insert([{
        name,
        description: description || null,
        category: category || 'campaign',
        html_content,
        subject_line,
        variables: variables || [],
        logo_url: logo_url || '/logo.png',
        is_default: is_default || false,
        is_active: true,
      }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error) {
    console.error('Create email template error:', error)
    return NextResponse.json(
      { error: 'Failed to create email template' },
      { status: 500 }
    )
  }
}

