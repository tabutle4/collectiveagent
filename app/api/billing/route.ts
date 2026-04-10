import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    const auth = await requireAuth(request)
    if (auth.error) return auth.error

    // If no agent_id provided and user is not admin, auto-use their own ID
    const effectiveAgentId = agentId || (!auth.permissions.has('can_view_agent_debts') ? auth.user.id : null)

    // Agents can only view their own billing (not other agents')
    if (effectiveAgentId && effectiveAgentId !== auth.user.id && !auth.permissions.has('can_view_agent_debts')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const supabase = createClient()
    const status = searchParams.get('status')
    const debtType = searchParams.get('debt_type')

    // Called with agent_id (explicit or auto-filled) - return records for that agent
    if (effectiveAgentId) {
      let query = supabase
        .from('agent_debts')
        .select(
          'id, record_type, debt_type, description, amount_owed, amount_remaining, date_incurred, status, notes, agent_id'
        )
        .eq('agent_id', effectiveAgentId)
        .order('date_incurred', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data: records } = await query
      return NextResponse.json({ records: records || [] })
    }

    // Called with ?status=outstanding&debt_type=custom_invoice - return all matching debt records
    if (status || debtType) {
      let query = supabase
        .from('agent_debts')
        .select(
          'id, record_type, debt_type, description, amount_owed, amount_remaining, date_incurred, status, notes, agent_id'
        )
        .order('date_incurred', { ascending: false })

      if (status) query = query.eq('status', status)
      if (debtType) query = query.eq('debt_type', debtType)

      const { data: records } = await query
      return NextResponse.json({ records: records || [] })
    }

    // No params - return agent list + open debt counts (original overview endpoint)
    const [agentsRes, debtRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          'id, first_name, last_name, preferred_first_name, preferred_last_name, email, division, monthly_fee_waived, onboarding_fee_paid, onboarding_fee_paid_date, monthly_fee_paid_through, payload_payee_id, status'
        )
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('agent_debts')
        .select('agent_id', { count: 'exact' })
        .eq('status', 'outstanding')
        .eq('debt_type', 'custom_invoice'),
    ])

    return NextResponse.json({
      agents: agentsRes.data || [],
      openCustomInvoices: debtRes.count || 0,
      openDebtAgentIds: (debtRes.data || []).map((d: any) => d.agent_id),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Require can_manage_agent_debts permission for write operations
  const auth = await requirePermission(request, 'can_manage_agent_debts')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const { action } = body

    // Page sends: create, { record: { agent_id, record_type, debt_type, description, amount_owed, ... } }
    if (action === 'create') {
      const { record } = body
      const { error } = await supabase.from('agent_debts').insert({
        ...record,
        date_incurred: record.date_incurred || new Date().toISOString().split('T')[0],
        status: 'outstanding',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    // Page sends: update, { id, updates: { description, amount_owed } } or { id, updates: { notes } }
    if (action === 'update') {
      const { id, updates } = body
      const { error } = await supabase.from('agent_debts').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    // Page sends: delete, { id }
    if (action === 'delete') {
      const { id } = body
      const { error } = await supabase.from('agent_debts').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
