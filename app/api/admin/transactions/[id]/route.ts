import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params

    // Get transaction with all related data
    const { data: txn, error } = await supabase
      .from('transactions')
      .select(`
        *,
        submitted_by_user:users!transactions_submitted_by_fkey(
          id, first_name, last_name, preferred_first_name, preferred_last_name, email, phone
        ),
        internal_agents:transaction_internal_agents(
          *,
          user:users(
            id, first_name, last_name, preferred_first_name, preferred_last_name, 
            email, phone, commission_plan, office,
            cap_progress, cap_year, qualifying_transaction_count,
            trec_license_number
          )
        ),
        external_brokerages:transaction_external_brokerages(*),
        check:checks(*)
      `)
      .eq('id', id)
      .single()

    if (error || !txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json(txn)
  } catch (err: any) {
    console.error('GET transaction error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()

    const { error } = await supabase
      .from('transactions')
      .update(body)
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('PUT transaction error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    // ─── Update Internal Agent ─────────────────────────────────────────────────
    if (action === 'update_internal_agent') {
      const { internal_agent_id, updates } = body
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update(updates)
        .eq('id', internal_agent_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ─── Get Agent Debts ───────────────────────────────────────────────────────
    if (action === 'get_agent_debts') {
      const { agent_id } = body
      const { data, error } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('agent_id', agent_id)
        .in('status', ['pending', 'partial'])
        .order('date_incurred', { ascending: true })
      if (error) throw error
      return NextResponse.json({ debts: data || [] })
    }

    // ─── Mark Paid ─────────────────────────────────────────────────────────────
    if (action === 'mark_paid') {
      const { 
        internal_agent_id, 
        payment_date,
        payment_method,
        payment_reference,
        funding_source,
        debts_to_apply,
        agent_net_override,
        counts_toward_progress,  // NEW: boolean to control cap/qualifying updates
      } = body

      // 1. Get the internal agent record
      const { data: tia, error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('id', internal_agent_id)
        .single()
      if (tiaError || !tia) throw new Error('Agent record not found')

      // 2. Get the agent's user record
      const { data: agentUser, error: userError } = await supabase
        .from('users')
        .select('id, commission_plan, cap_progress, qualifying_transaction_count')
        .eq('id', tia.agent_id)
        .single()
      if (userError) throw userError

      // 3. Calculate 1099 amount
      const agentGross = parseFloat(tia.agent_gross || 0)
      const processingFee = parseFloat(tia.processing_fee || 0)
      const coachingFee = parseFloat(tia.coaching_fee || 0)
      const otherFees = parseFloat(tia.other_fees || 0)
      const brokerageSplit = parseFloat(tia.brokerage_split || 0)
      
      let amount1099: number
      if (tia.agent_role === 'primary_agent') {
        amount1099 = agentGross - processingFee - coachingFee - otherFees
      } else {
        amount1099 = parseFloat(tia.agent_net || 0)
      }

      // 4. Calculate debts deducted
      let totalDebtsDeducted = 0
      if (debts_to_apply && debts_to_apply.length > 0) {
        for (const debtApp of debts_to_apply) {
          totalDebtsDeducted += parseFloat(debtApp.amount || 0)
        }
      }

      // 5. Calculate final agent_net
      const agentNet = agent_net_override != null 
        ? parseFloat(agent_net_override)
        : amount1099 - totalDebtsDeducted

      // 6. Update the transaction_internal_agents record
      const tiaUpdate: any = {
        payment_status: 'paid',
        payment_date,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null,
        funding_source: funding_source || 'crc',
        amount_1099_reportable: Math.round(amount1099 * 100) / 100,
        debts_deducted: Math.round(totalDebtsDeducted * 100) / 100,
        agent_net: Math.round(agentNet * 100) / 100,
        counts_toward_progress: counts_toward_progress ?? true,  // Store the decision
      }

      const { error: updateTiaError } = await supabase
        .from('transaction_internal_agents')
        .update(tiaUpdate)
        .eq('id', internal_agent_id)
      if (updateTiaError) throw updateTiaError

      // 7. Apply debts
      if (debts_to_apply && debts_to_apply.length > 0) {
        for (const debtApp of debts_to_apply) {
          const { data: debt } = await supabase
            .from('agent_debts')
            .select('*')
            .eq('id', debtApp.debt_id)
            .single()
          
          if (debt) {
            const amountRemaining = parseFloat(debt.amount_remaining || debt.amount_owed || 0)
            const amountApplied = parseFloat(debtApp.amount || 0)
            const newRemaining = amountRemaining - amountApplied
            
            const debtUpdate: any = {
              amount_paid: (parseFloat(debt.amount_paid || 0) + amountApplied),
              offset_transaction_id: id,
              offset_transaction_agent_id: internal_agent_id,
            }

            if (newRemaining <= 0) {
              debtUpdate.status = 'paid'
              debtUpdate.date_resolved = payment_date
            }

            await supabase
              .from('agent_debts')
              .update(debtUpdate)
              .eq('id', debtApp.debt_id)
          }
        }
      }

      // 8. Update user's cap_progress and qualifying count (ONLY if counts_toward_progress is true)
      if (counts_toward_progress !== false && tia.agent_role === 'primary_agent' && agentUser) {
        const plan = (agentUser.commission_plan || '').toLowerCase()
        const userUpdate: any = {}

        // Cap progress (for 85/15 and capped plans)
        if (brokerageSplit > 0) {
          const isCapPlan = plan.includes('85') || plan.includes('100') || plan.includes('capped')
          if (isCapPlan) {
            const currentCapProgress = parseFloat(agentUser.cap_progress || 0)
            userUpdate.cap_progress = Math.round((currentCapProgress + brokerageSplit) * 100) / 100
          }
        }

        // Qualifying transaction count (for New Agent Plan)
        const isNewAgentPlan = plan.includes('new') || plan.includes('70/30')
        if (isNewAgentPlan) {
          userUpdate.qualifying_transaction_count = (agentUser.qualifying_transaction_count || 0) + 1
        }

        if (Object.keys(userUpdate).length > 0) {
          await supabase
            .from('users')
            .update(userUpdate)
            .eq('id', tia.agent_id)
        }
      }

      return NextResponse.json({ 
        success: true, 
        updates: {
          ...tiaUpdate,
          debts_applied: debts_to_apply?.length || 0,
        }
      })
    }

    // ─── Update Check ──────────────────────────────────────────────────────────
    if (action === 'update_check') {
      const { check_id, updates } = body
      const { error } = await supabase
        .from('checks')
        .update(updates)
        .eq('id', check_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ─── Create Check ──────────────────────────────────────────────────────────
    if (action === 'create_check') {
      const { check_data } = body
      const { data, error } = await supabase
        .from('checks')
        .insert({ ...check_data, transaction_id: id })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, check: data })
    }

    // ─── Update Status ─────────────────────────────────────────────────────────
    if (action === 'update_status') {
      const { status } = body
      const { error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('POST transaction error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}