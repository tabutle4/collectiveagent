import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  'buyer_v2':                 'Buyer',
  'seller_v2':                'Seller',
  'tenant_apt_v2':            'Tenant (apartment)',
  'tenant_other_v2':          'Tenant (not apartment)',
  'tenant_simplyhome_v2':     'Tenant (SimplyHome)',
  'tenant_commercial_v2':     'Tenant (commercial)',
  'landlord_v2':              'Landlord',
  'new_construction_buyer_v2':'New Construction Buyer',
  'land_lot_buyer_v2':        'Land/Lot Buyer',
  'commercial_buyer_v2':      'Commercial Buyer',
  'land_lot_seller_v2':       'Land/Lot Seller',
  'referred_out_v2':          'Referred Out',
  'sale':                     'Sale',
  'lease':                    'Lease',
}

function friendlyType(t: string | null): string {
  if (!t) return ''
  return TRANSACTION_TYPE_LABELS[t] || t.replace(/_/g, ' ')
}

function isLeaseType(t: string | null): boolean {
  if (!t) return false
  return ['lease', 'apartment', 'rent', 'tenant', 'landlord'].some(k =>
    t.toLowerCase().includes(k)
  )
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase() || ''
    const status = searchParams.get('status') || ''
    const from   = searchParams.get('from') || ''
    const to     = searchParams.get('to') || ''

    // Internal agents
    const { data: internalAgents, error: iaError } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select(`
        id, agent_id, agent_role, agent_net, payment_status,
        payment_date, payment_method, transaction_id,
        transactions!inner(property_address, transaction_type, closed_date)
      `)
      .order('payment_date', { ascending: false, nullsFirst: false })
      .range(0, 9999)

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
      .range(0, 9999)

    if (ebError) throw ebError

    // PM fee payouts
    const { data: pmFeePayouts, error: pmError } = await supabaseAdmin
      .from('pm_fee_payouts')
      .select(`
        id, payee_type, payee_id, payee_name, amount,
        payment_status, payment_date, payment_method,
        landlord_disbursements!inner(
          id, period_month, period_year,
          managed_properties(property_address)
        )
      `)
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (pmError) throw pmError

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
    const internalRows = (internalAgents || []).map(a => {
      const txn = a.transactions as any
      const txnType = txn?.transaction_type || null
      const closedDate = txn?.closed_date || null
      const lease = isLeaseType(txnType)
      return {
        id:               a.id,
        type:             'agent' as const,
        payee:            agentNames[a.agent_id] || 'Unknown Agent',
        payee_type:       a.agent_role || 'agent',
        address:          txn?.property_address || '',
        transaction_type: friendlyType(txnType),
        amount:           a.agent_net || 0,
        payment_status:   a.payment_status || 'pending',
        payment_date:     a.payment_date || closedDate,
        payment_method:   a.payment_method || (lease ? 'ach' : 'wire'),
        transaction_id:   a.transaction_id,
      }
    })

    const externalRows = (externalBrokerages || []).map(e => {
      const txn = e.transactions as any
      const txnType = txn?.transaction_type || null
      const closedDate = txn?.closed_date || null
      const lease = isLeaseType(txnType)
      return {
        id:               e.id,
        type:             'external' as const,
        payee:            e.agent_name || e.brokerage_name || 'Unknown',
        payee_type:       e.brokerage_role || 'external',
        address:          txn?.property_address || '',
        transaction_type: friendlyType(txnType),
        amount:           e.commission_amount || 0,
        payment_status:   e.payment_status || 'pending',
        payment_date:     e.payment_date || closedDate,
        payment_method:   e.payment_method || (lease ? 'ach' : 'wire'),
        transaction_id:   e.transaction_id,
      }
    })

    // PM fee payout rows
    const pmRows = (pmFeePayouts || []).map(p => {
      const disb = p.landlord_disbursements as any
      const prop = disb?.managed_properties as any
      const periodLabel = disb ? `${disb.period_month}/${disb.period_year}` : ''
      return {
        id:               p.id,
        type:             'pm_fee' as const,
        payee:            p.payee_name,
        payee_type:       p.payee_type === 'agent' ? 'pm_referral' : 'pm_brokerage',
        address:          prop?.property_address || '',
        transaction_type: `PM Fee ${periodLabel}`,
        amount:           p.amount || 0,
        payment_status:   p.payment_status || 'pending',
        payment_date:     p.payment_date || null,
        payment_method:   p.payment_method || 'ach',
        transaction_id:   null, // PM payouts don't link to transactions
      }
    })

    let rows = [...internalRows, ...externalRows, ...pmRows]

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