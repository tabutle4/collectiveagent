import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import {
  getTransactionTypeLabel,
  isLeaseTransactionType,
} from '@/lib/transactions/transactionTypes'

export const dynamic = 'force-dynamic'

// Aliases for the legacy `sale` / `lease` values that can appear on older rows.
const LEGACY_SHORT_LABELS: Record<string, string> = {
  sale: 'Sale',
  lease: 'Lease',
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function friendlyType(t: string | null): string {
  if (!t) return ''
  if (t in LEGACY_SHORT_LABELS) return LEGACY_SHORT_LABELS[t]
  return getTransactionTypeLabel(t)
}

function isLeaseType(t: string | null): boolean {
  if (!t) return false
  if (t === 'lease') return true
  return isLeaseTransactionType(t)
}

function periodLabel(month: number | null, year: number | null): string {
  if (!month || !year) return ''
  const m = MONTH_LABELS[month - 1] || ''
  return m ? `${m} ${year}` : `${year}`
}

function periodToDate(month: number | null, year: number | null): string | null {
  if (!month || !year) return null
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-01`
}

function joinAddressAndPeriod(address: string, period: string): string {
  if (address && period) return `${address} - ${period}`
  return address || period
}

type PayoutType = 'agent' | 'external' | 'pm_fee' | 'landlord'

interface PayoutRow {
  id: string
  type: PayoutType
  payee: string
  payee_type: string
  address: string
  transaction_type: string
  amount: number
  payment_status: string
  payment_date: string | null
  payment_method: string
  transaction_id: string | null
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase().trim() || ''
    const status = searchParams.get('status') || ''
    const type   = searchParams.get('type') || ''
    const from   = searchParams.get('from') || ''
    const to     = searchParams.get('to') || ''

    // Internal agents (sales/lease commissions)
    const internalAgents = await fetchAllRows(
      'transaction_internal_agents',
      `id, agent_id, agent_role, agent_net, payment_status,
       payment_date, payment_method, transaction_id,
       transactions!inner(property_address, transaction_type, closed_date)`,
      { orderBy: { column: 'payment_date', ascending: false, nullsFirst: false } }
    )

    // External brokerages (co-op / referral brokerages on a transaction)
    const externalBrokerages = await fetchAllRows(
      'transaction_external_brokerages',
      `id, brokerage_role, brokerage_name, agent_name, commission_amount,
       payment_status, payment_date, payment_method, transaction_id,
       transactions!inner(property_address, transaction_type, closed_date)`,
      { orderBy: { column: 'payment_date', ascending: false, nullsFirst: false } }
    )

    // PM fee payouts (agent and brokerage portions of the management fee)
    const pmFeePayouts = await fetchAllRows(
      'pm_fee_payouts',
      `id, payee_type, payee_id, payee_name, amount,
       payment_status, payment_date, payment_method,
       landlord_disbursements!inner(
         period_month, period_year,
         managed_properties(property_address)
       ),
       payee:users!pm_fee_payouts_payee_id_fkey(
         id, preferred_first_name, first_name, preferred_last_name, last_name
       )`,
      { orderBy: { column: 'created_at', ascending: false, nullsFirst: false } }
    )

    // Landlord disbursements (rent net of fees, paid to the landlord)
    const landlordDisbursements = await fetchAllRows(
      'landlord_disbursements',
      `id, net_amount, payment_status, payment_date, payment_method,
       period_month, period_year,
       landlords(first_name, last_name),
       managed_properties(property_address)`,
      { orderBy: { column: 'created_at', ascending: false, nullsFirst: false } }
    )

    // Get agent names for internal agents (sales/lease side)
    const agentIds = [...new Set(internalAgents.map(a => a.agent_id).filter(Boolean))]
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
    const internalRows: PayoutRow[] = internalAgents.map(a => {
      const txn = a.transactions as any
      const txnType = txn?.transaction_type || null
      const closedDate = txn?.closed_date || null
      const lease = isLeaseType(txnType)
      return {
        id:               a.id,
        type:             'agent',
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

    const externalRows: PayoutRow[] = externalBrokerages.map(e => {
      const txn = e.transactions as any
      const txnType = txn?.transaction_type || null
      const closedDate = txn?.closed_date || null
      const lease = isLeaseType(txnType)
      return {
        id:               e.id,
        type:             'external',
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

    const pmFeeRows: PayoutRow[] = pmFeePayouts.map(p => {
      const disb = (p as any).landlord_disbursements
      const property = disb?.managed_properties
      const periodM: number | null = disb?.period_month ?? null
      const periodY: number | null = disb?.period_year ?? null
      const propAddr: string = property?.property_address || ''
      const address = joinAddressAndPeriod(propAddr, periodLabel(periodM, periodY))

      let payee = ''
      if (p.payee_type === 'brokerage') {
        payee = 'Collective Realty Co.'
      } else if (p.payee_type === 'agent') {
        const u = (p as any).payee
        if (u) {
          const first = u.preferred_first_name || u.first_name || ''
          const last  = u.preferred_last_name  || u.last_name  || ''
          payee = `${first} ${last}`.trim()
        }
        if (!payee) payee = p.payee_name || 'Unknown Agent'
      } else {
        payee = p.payee_name || 'Unknown'
      }

      return {
        id:               p.id,
        type:             'pm_fee',
        payee,
        payee_type:       p.payee_type || 'agent',
        address,
        transaction_type: 'PM Fee',
        amount:           p.amount || 0,
        payment_status:   p.payment_status || 'pending',
        payment_date:     p.payment_date || periodToDate(periodM, periodY),
        payment_method:   p.payment_method || 'ach',
        transaction_id:   null,
      }
    })

    const landlordRows: PayoutRow[] = landlordDisbursements.map(d => {
      const ll = (d as any).landlords
      const property = (d as any).managed_properties
      const periodM: number | null = d.period_month ?? null
      const periodY: number | null = d.period_year ?? null
      const propAddr: string = property?.property_address || ''
      const address = joinAddressAndPeriod(propAddr, periodLabel(periodM, periodY))

      const payee = ll
        ? (`${ll.first_name || ''} ${ll.last_name || ''}`.trim() || 'Unknown Landlord')
        : 'Unknown Landlord'

      return {
        id:               d.id,
        type:             'landlord',
        payee,
        payee_type:       'landlord',
        address,
        transaction_type: 'Landlord Disbursement',
        amount:           d.net_amount || 0,
        payment_status:   d.payment_status || 'pending',
        payment_date:     d.payment_date || periodToDate(periodM, periodY),
        payment_method:   d.payment_method || 'ach',
        transaction_id:   null,
      }
    })

    const allRows: PayoutRow[] = [...internalRows, ...externalRows, ...pmFeeRows, ...landlordRows]

    // Pending summaries (computed before applying filters so the tiles
    // remain a stable "currently outstanding" total)
    const pendingByType = { agent: 0, external: 0, pm_fee: 0, landlord: 0 }
    const countByType   = { agent: 0, external: 0, pm_fee: 0, landlord: 0 }
    for (const r of allRows) {
      if (r.payment_status === 'pending') {
        pendingByType[r.type] += r.amount
        countByType[r.type]   += 1
      }
    }

    // Apply filters to the displayed rows
    let rows = allRows
    if (type)   rows = rows.filter(r => r.type === type)
    if (status) rows = rows.filter(r => r.payment_status === status)
    if (search) {
      rows = rows.filter(r =>
        r.address.toLowerCase().includes(search) ||
        r.payee.toLowerCase().includes(search)
      )
    }
    if (from) rows = rows.filter(r => r.payment_date && r.payment_date >= from)
    if (to)   rows = rows.filter(r => r.payment_date && r.payment_date <= to)

    // Sort by payment_date desc, nulls last
    rows.sort((a, b) => {
      if (!a.payment_date && !b.payment_date) return 0
      if (!a.payment_date) return 1
      if (!b.payment_date) return -1
      return b.payment_date.localeCompare(a.payment_date)
    })

    return NextResponse.json({ rows, pendingByType, countByType })
  } catch (error: any) {
    console.error('All payouts error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
