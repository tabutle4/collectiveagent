import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const coordinationId = searchParams.get('coordination_id')
    const type = searchParams.get('type') // 'email_history' or 'weekly_reports'

    if (!coordinationId) {
      return NextResponse.json({ error: 'coordination_id is required' }, { status: 400 })
    }

    const supabase = createClient()

    if (type === 'email_history') {
      const { data, error } = await supabase
        .from('coordination_email_history')
        .select('*')
        .eq('coordination_id', coordinationId)
        .order('sent_at', { ascending: false })

      if (error) throw error
      return NextResponse.json({ emailHistory: data || [] })
    } 
    
    if (type === 'weekly_reports') {
      const { data, error } = await supabase
        .from('coordination_weekly_reports')
        .select('*')
        .eq('coordination_id', coordinationId)
        .order('week_start_date', { ascending: false })

      if (error) throw error
      return NextResponse.json({ weeklyReports: data || [] })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (error: any) {
    console.error('Error fetching coordination data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}