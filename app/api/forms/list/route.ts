import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabase
      .from('forms')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: forms, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      forms: forms || [],
    })
  } catch (error: any) {
    console.error('Error fetching forms:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch forms' }, { status: 500 })
  }
}
