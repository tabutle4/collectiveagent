import { NextRequest, NextResponse } from 'next/server'
import { validateFormToken } from '@/lib/magic-links'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }
    
    const validation = validateFormToken(token)
    if (!validation) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }
    
    // Check if this token exists in the forms table (for admin-created forms)
    const supabase = createClient()
    const { data: formDefinition } = await supabase
      .from('forms')
      .select('id, name, form_type, is_active')
      .eq('shareable_token', token)
      .single()
    
    if (formDefinition && !formDefinition.is_active) {
      return NextResponse.json(
        { error: 'This form is no longer active' },
        { status: 403 }
      )
    }
    
    // Token is valid - return success
    // The form will be empty and any agent can fill it out
    return NextResponse.json({
      success: true,
      form_type: validation.formType,
      form_definition: formDefinition || null,
    })
    
  } catch (error: any) {
    console.error('Error validating form token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate token' },
      { status: 500 }
    )
  }
}

