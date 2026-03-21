import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    const supabase = createClient()

    let query = supabase
      .from('agent_debts')
      .select('*')
      .order('date_incurred', { ascending: false })

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ records: data || [] })
  } catch (err: any) {
    console.error('Billing GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = createClient()

    if (action === 'create') {
      const { record } = body
      const { data, error } = await supabase
        .from('agent_debts')
        .insert(record)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ record: data })
    }

    if (action === 'update') {
      const { id, updates } = body
      const { data, error } = await supabase
        .from('agent_debts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ record: data })
    }

    if (action === 'delete') {
      const { id } = body
      const { error } = await supabase
        .from('agent_debts')
        .delete()
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Billing POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}