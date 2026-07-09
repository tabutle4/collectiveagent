import { NextRequest, NextResponse } from 'next/server'
import { normalizeTransactionEntryFields } from '@/lib/transactions/utils'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, supabaseAdmin } from '@/lib/supabase'
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

    // Build filters
    const filters: Array<{ type: 'eq' | 'neq' | 'is' | 'not' | 'in' | 'gte' | 'lte'; column: string; value: any }> = []
    if (!canViewAll) {
      filters.push({ type: 'eq', column: 'submitted_by', value: userId })
    }

    // Fetch transactions (batched)
    const transactions = await fetchAllRows(
      'transactions',
      `id,
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
       transaction_type,
       submitted_by,
       office_location`,
      {
        filters,
        orderBy: { column: 'closing_date', ascending: false },
      },
      supabase
    )

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
      agents,
      permissions: permissionsObject,
      canViewAll,
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
    } catch (err: any) {
      console.error('Auto-add agent block error:', err?.message || err)
      // best-effort: transaction was created, agent can be added manually
    }

    return NextResponse.json({ transaction: newTransaction })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}