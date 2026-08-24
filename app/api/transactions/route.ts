import { NextRequest, NextResponse } from 'next/server'
import { normalizeTransactionEntryFields } from '@/lib/transactions/utils'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, supabaseAdmin } from '@/lib/supabase'
import { findDuplicateTransactions, AGENT_VISIBLE_TRANSACTION_FILTERS } from '@/lib/transactions/dedupe'
import { autoCascadeTransaction } from '@/lib/transactions/cascade'
import { verifySessionToken } from '@/lib/session'
import { getUserPermissions, PermissionCode } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const supabase = createClient()
    const userId = session.user.id

    // Get user's permissions from database
    const permissions = await getUserPermissions(userId)
    const canViewAll = permissions.has('can_view_all_transactions')

    // Commission rows power the transactions page's quarter totals (they are
    // what the quarterly report counts) and, for agents, the per-deal
    // "my net" display. Agents get only their own rows.
    // Fetched before the transactions because an agent's visible deal list is
    // derived from these rows: a deal is theirs when they hold a commission row
    // on it, no matter who submitted the compliance request.
    const tiaFilters: Array<{ type: 'eq' | 'neq' | 'is' | 'not' | 'in' | 'gte' | 'lte'; column: string; value: any }> = []
    if (!canViewAll) {
      tiaFilters.push({ type: 'eq', column: 'agent_id', value: userId })
    }
    const tia = await fetchAllRows(
      'transaction_internal_agents',
      'id, transaction_id, agent_id, agent_role, side, sales_volume, units, agent_basis, agent_gross, brokerage_split, processing_fee, coaching_fee, other_fees, btsa_amount, rebate_amount, agent_net, amount_1099_reportable, payment_status, payment_date',
      { filters: tiaFilters },
      supabase
    )

    const TRANSACTION_COLUMNS = `id,
       created_at,
       updated_at,
       property_address,
       status,
       compliance_status,
       client_name,
       sales_price,
       monthly_rent,
       sales_volume,
       closing_date,
       move_in_date,
       acceptance_date,
       lease_term,
       transaction_type,
       submitted_by,
       office_location`
    const TRANSACTION_ORDER = { column: 'closing_date', ascending: false }

    // Fetch transactions (batched)
    let transactions: any[]
    // Checks power the admin funding filter. They are fetched and returned
    // ONLY in the canViewAll branch — an agent's payload must not carry
    // check data, and office_gross is likewise admin-only.
    //
    // fundingAgents is the second half of that filter: whether each deal has a
    // PAID agent row, which is what tells "title paid the agent directly" from
    // "still waiting on money" (see fundingFilterState). Aggregated to two
    // booleans per transaction on the server so no commission amount crosses
    // the wire, and returned in the same canViewAll-only branch.
    // transaction_internal_agents is past 1,500 rows, so fetchAllRows, not a
    // bare select that would silently truncate at 1,000.
    let fundingChecks: any[] = []
    let fundingAgents: Array<{ transaction_id: string; any_paid: boolean; any_basis: boolean }> = []
    if (canViewAll) {
      let fundingAgentRows: any[] = []
      ;[transactions, fundingChecks, fundingAgentRows] = await Promise.all([
        fetchAllRows(
          'transactions',
          `${TRANSACTION_COLUMNS},
       office_gross`,
          { orderBy: TRANSACTION_ORDER },
          supabase
        ),
        fetchAllRows(
          'checks_received',
          'transaction_id, check_amount, cleared_date',
          {},
          supabase
        ),
        fetchAllRows(
          'transaction_internal_agents',
          'transaction_id, payment_date, agent_basis',
          {},
          supabase
        ),
      ])
      const agentAgg = new Map<string, { any_paid: boolean; any_basis: boolean }>()
      for (const r of fundingAgentRows as any[]) {
        const tid = r?.transaction_id
        if (!tid) continue
        const cur = agentAgg.get(tid) || { any_paid: false, any_basis: false }
        if (r.payment_date) cur.any_paid = true
        if (parseFloat(String(r.agent_basis ?? 0)) > 0) cur.any_basis = true
        agentAgg.set(tid, cur)
      }
      fundingAgents = Array.from(agentAgg.entries()).map(([transaction_id, v]) => ({
        transaction_id,
        ...v,
      }))
    } else {
      // An agent's deal list is the union of deals they hold a commission row
      // on and deals they submitted. Filtering on submitted_by alone hid every
      // deal entered by a TC, the office, or a co-agent, even though the agent
      // was paid on it.
      const participatingIds = Array.from(
        new Set((tia as any[]).map(r => r.transaction_id).filter(Boolean))
      )
      const [submitted, participating] = await Promise.all([
        fetchAllRows(
          'transactions',
          TRANSACTION_COLUMNS,
          {
            filters: [
              { type: 'eq' as const, column: 'submitted_by', value: userId },
              // Cancelled and archived deals stay fully visible to admins and
              // disappear for agents. Only this !canViewAll branch is filtered.
              ...AGENT_VISIBLE_TRANSACTION_FILTERS,
            ],
            orderBy: TRANSACTION_ORDER,
          },
          supabase
        ),
        participatingIds.length
          ? fetchAllRows(
              'transactions',
              TRANSACTION_COLUMNS,
              {
                filters: [
                  { type: 'in' as const, column: 'id', value: participatingIds },
                  ...AGENT_VISIBLE_TRANSACTION_FILTERS,
                ],
                orderBy: TRANSACTION_ORDER,
              },
              supabase
            )
          : Promise.resolve([] as any[]),
      ])
      const byId = new Map<string, any>()
      for (const t of [...submitted, ...participating]) byId.set(t.id, t)
      // Postgres orders NULLs first on a DESC sort. The merged list is sorted
      // the same way so the page's row order does not shift.
      transactions = Array.from(byId.values()).sort((a, b) => {
        if (!a.closing_date && !b.closing_date) return 0
        if (!a.closing_date) return -1
        if (!b.closing_date) return 1
        return String(b.closing_date).localeCompare(String(a.closing_date))
      })
    }

    // Get agents list for users who can view all
    let agents: any[] = []
    if (canViewAll) {
      const { data: agentData } = await supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, is_active')
        .eq('is_active', true)
        .order('preferred_first_name', { ascending: true })

      agents = agentData || []
    }

    // Convert permissions Set to object for client
    const permissionsObject: Record<string, boolean> = {}
    for (const code of permissions) {
      permissionsObject[code] = true
    }

    return NextResponse.json({
      transactions,
      tia,
      agents,
      permissions: permissionsObject,
      canViewAll,
      // Keys present ONLY for canViewAll — the agent payload is unchanged.
      ...(canViewAll ? { checks: fundingChecks, fundingAgents } : {}),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const supabase = createClient()
    const userId = session.user.id
    const body = await request.json()

    // Check permission to create transactions
    const permissions = await getUserPermissions(userId)
    if (!permissions.has('can_create_transactions')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Determine submitted_by
    // Users with can_view_all_transactions can assign to another agent
    let submittedBy = userId
    if (permissions.has('can_view_all_transactions') && body.submitted_by) {
      submittedBy = body.submitted_by
    }

    const transactionData = normalizeTransactionEntryFields({
      ...body,
      submitted_by: submittedBy,
      status: body.status || 'prospect',
      compliance_status: body.compliance_status || 'not_requested',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Remove fields that shouldn't be inserted directly
    delete transactionData.id

    // Every create modal in the app posts here, and this route had no address
    // check at all. Same contract the agent forms use: report the matches and
    // let the caller resubmit with confirm_new_deal once a person has looked.
    if (!body.confirm_new_deal) {
      const existing = await findDuplicateTransactions(transactionData.property_address)
      if (existing.length) {
        // 200, not 409, and deliberately so. A second live deal at one address
        // is routine here - landlord plus tenant on the same property, or a
        // house leased one year and sold the next - so this is a question, not
        // a failure. Returning an error status made the modal throw, which hid
        // the match list and left no way to continue. Same shape the four agent
        // form routes return, so every client handles one contract.
        return NextResponse.json({
          success: false,
          duplicate_check: true,
          matches: existing,
        })
      }
    }
    delete transactionData.confirm_new_deal

    const { data: newTransaction, error } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Auto-add the agent to transaction_internal_agents and set office_location.
    // Uses supabaseAdmin to bypass RLS (the agent being added may differ from the
    // logged-in admin, and RLS on users/TIA would block a session-scoped client).
    try {
      // Fetch agent's commission plan and office using admin client (bypasses RLS)
      const { data: agentUser } = await supabaseAdmin
        .from('users')
        .select('commission_plan, lease_commission_plan, office')
        .eq('id', submittedBy)
        .single()

      const txnType = transactionData.transaction_type || ''

      // Look up processing_fee_types for is_lease flag — future-proof against new type codes
      const { data: pft } = await supabaseAdmin
        .from('processing_fee_types')
        .select('is_lease, name')
        .eq('code', txnType)
        .maybeSingle()

      const isLease = pft?.is_lease ?? (
        txnType.includes('tenant') || txnType.includes('landlord') ||
        txnType.includes('apartment') || txnType.includes('lease')
      )

      const commissionPlan = isLease
        ? (agentUser?.lease_commission_plan || agentUser?.commission_plan || '')
        : (agentUser?.commission_plan || '')

      // Determine default role and side from type code.
      // side must be a valid Side value: 'buyer' | 'seller' | 'tenant' | 'landlord'
      // (NOT the category 'buying'/'listing' — those fail the DB constraint).
      const isListingSide =
        txnType.includes('landlord') || txnType.includes('seller')

      const agentRole = isListingSide ? 'listing_agent' : 'primary_agent'
      const side =
        txnType.includes('landlord') ? 'landlord'
        : txnType.includes('seller') ? 'seller'
        : txnType.includes('tenant') ? 'tenant'
        : txnType.includes('buyer') ? 'buyer'
        : null
      const countsToward = !isLease && (agentRole === 'primary_agent' || agentRole === 'listing_agent')

      // Auto-set office_location from agent profile if not already set
      if (agentUser?.office && !transactionData.office_location) {
        await supabaseAdmin
          .from('transactions')
          .update({ office_location: agentUser.office })
          .eq('id', newTransaction.id)
      }

      const { error: tiaError } = await supabaseAdmin
        .from('transaction_internal_agents')
        .insert({
          transaction_id: newTransaction.id,
          agent_id: submittedBy,
          agent_role: agentRole,
          side,
          commission_plan: commissionPlan,
          counts_toward_progress: countsToward,
          units: 1,
          funding_source: 'crc',
          payment_status: 'pending',
          uses_canonical_math: true,
        })

      if (tiaError) {
        console.error('Auto-add agent to TIA failed:', tiaError.message)
      }

      // Cascade immediately if the create payload carried a commission basis
      // (side commissions or gross); no-op when the basis arrives later.
      await autoCascadeTransaction(newTransaction.id)
    } catch (err: any) {
      console.error('Auto-add agent block error:', err?.message || err)
      // best-effort: transaction was created, agent can be added manually
    }

    return NextResponse.json({ transaction: newTransaction })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}