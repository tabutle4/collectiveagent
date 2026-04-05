import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase() || ''
    const status = searchParams.get('status') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    // Internal agents
    const { data: internalAgents, error: iaError } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select(`
        id, agent_id, agent_role, agent_net, payment_status,
        payment_date, payment_method, transaction_id,
        transactions!inner(property_address, transaction_type, closed_date)
      `)
      .order('payment_date', { ascending: false, nullsFirst: false })

    if (iaError) throw iaError

    // External brokerages
    const { data: externalBrokerages, error: ebError } = await supabaseAdmin
      .from('transaction_external_brokerages')
      .select(`
        id, brokerage_role, brokerage_name, agent_name, commission_amount,
        payment_status, payment_date, payment_method, transaction_id,
        transactions!inner(property_address, transaction_type, closed_date)
      `)
      .order('payment_date', { ascending: false, nullsFirst: false })

    if (ebError) throw ebError

    // Get agent names for internal agents
    const agentIds = [...new Set((internalAgents || []).map(a => a.agent_id).filter(Boolean))]
    let agentNames: Record<string, string> = {}
    if (agentIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, preferred_first_name, first_name, preferred_last_name, last_name')
        .in('id', agentIds)
      for (const u of users || []) {
        agentNames[u.id] = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim()
      }
    }

    // Build unified rows
    const internalRows = (internalAgents || []).map(a => ({
      id: a.id,
      type: 'agent' as const,
      payee: agentNames[a.agent_id] || 'Unknown Agent',
      payee_type: a.agent_role || 'agent',
      address: (a.transactions as any)?.property_address || '—',
      transaction_type: (a.transactions as any)?.transaction_type || '—',
      amount: a.agent_net || 0,
      payment_status: a.payment_status || 'pending',
      payment_date: a.payment_date || null,
      payment_method: a.payment_method || null,
      transaction_id: a.transaction_id,
    }))

    const externalRows = (externalBrokerages || []).map(e => ({
      id: e.id,
      type: 'external' as const,
      payee: e.agent_name || e.brokerage_name || 'Unknown',
      payee_type: e.brokerage_role || 'external',
      address: (e.transactions as any)?.property_address || '—',
      transaction_type: (e.transactions as any)?.transaction_type || '—',
      amount: e.commission_amount || 0,
      payment_status: e.payment_status || 'pending',
      payment_date: e.payment_date || null,
      payment_method: e.payment_method || null,
      transaction_id: e.transaction_id,
    }))

    let rows = [...internalRows, ...externalRows]

    // Apply filters
    if (search) {
      rows = rows.filter(r =>
        r.address.toLowerCase().includes(search) ||
        r.payee.toLowerCase().includes(search)
      )
    }
    if (status) rows = rows.filter(r => r.payment_status === status)
    if (from) rows = rows.filter(r => r.payment_date && r.payment_date >= from)
    if (to) rows = rows.filter(r => r.payment_date && r.payment_date <= to)

    // Sort by payment_date desc, nulls last
    rows.sort((a, b) => {
      if (!a.payment_date && !b.payment_date) return 0
      if (!a.payment_date) return 1
      if (!b.payment_date) return -1
      return b.payment_date.localeCompare(a.payment_date)
    })

    return NextResponse.json({ rows })
  } catch (error: any) {
    console.error('All payouts error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}