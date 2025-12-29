import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Form ID is required' },
        { status: 400 }
      )
    }
    
    const { data: form, error } = await supabase
      .from('forms')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      throw error
    }
    
    if (!form) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      form,
    })
    
  } catch (error: any) {
    console.error('Error fetching form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch form' },
      { status: 500 }
    )
  }
}

