import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section')

    // ── Full transaction detail load ─────────────────────────────────────────
    if (!section || section === 'full') {
      const [
        { data: txn, error: txnError },
        { data: agents, error: agentsError },
        { data: settings }
      ] = await Promise.all([
          supabase.from('transactions').select('*').eq('id', id).single(),
          supabase.from('transaction_internal_agents').select(`
            *,
            user:users!transaction_internal_agents_agent_id_fkey(
              id, first_name, last_name, preferred_first_name, preferred_last_name,
              office_email, email, phone, office, commission_plan, license_number,
              license_expiration, nrds_id, mls_id, association, join_date,
              division, revenue_share, revenue_share_percentage, referring_agent,
              referring_agent_id, referred_agents,
              qualifying_transaction_count, waive_buyer_processing_fees,
              waive_seller_processing_fees, special_commission_notes, headshot_url
            )
          `).eq('transaction_id', id),
          supabase
            .from('company_settings')
            .select('referral_tracking_url, crm_url, crm_name')
            .single(),
        ])

      if (txnError || !txn) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }

      // Extract agent IDs for other lookups (team memberships, billing)
      const agentIds = (agents || []).map((a: any) => a.agent_id).filter(Boolean)
      const agentUsers = (agents || []).map((a: any) => a.user).filter(Boolean)

      // Primary agent (submitted_by)
      const primaryAgentId = txn.submitted_by
      const primaryAgent =
        (agentUsers || []).find((u: any) => u.id === primaryAgentId) || (agentUsers || [])[0]

      // Per-agent team memberships
      const { data: teamMemberships } = agentIds.length > 0
        ? await supabase
            .from('team_member_agreements')
            .select(`
              id, agent_id, agreement_document_url, firm_min_override,
              team:teams!team_member_agreements_team_id_fkey(id, team_name)
            `)
            .in('agent_id', agentIds)
            .is('end_date', null)
        : { data: [] }

      // Fetch splits separately per membership (same pattern as admin routes)
      const membershipIds = (teamMemberships || []).map((m: any) => m.id).filter(Boolean)
      const { data: allSplits } = membershipIds.length > 0
        ? await supabase
            .from('team_agreement_splits')
            .select('id, agreement_id, plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
            .in('agreement_id', membershipIds)
            .order('plan_type')
            .order('lead_source')
        : { data: [] }

      // Build a map of agent_id -> membership (with splits attached)
      const membershipByAgent: Record<string, any> = {}
      for (const m of teamMemberships || []) {
        membershipByAgent[m.agent_id] = {
          ...m,
          splits: (allSplits || []).filter((s: any) => s.agreement_id === m.id),
        }
      }

      // Agent billing (debts + credits)
      let agentBilling = null
      if (primaryAgentId) {
        const { data: billingRecords } = await supabase
          .from('agent_debts')
          .select(
            'id, record_type, debt_type, description, amount_owed, amount_remaining, date_incurred, status'
          )
          .eq('agent_id', primaryAgentId)
          .eq('status', 'outstanding')
          .order('date_incurred', { ascending: false })

        const records = billingRecords || []
        const debts = records.filter((r: any) => r.record_type !== 'credit')
        const credits = records.filter((r: any) => r.record_type === 'credit')
        const totalDebts = debts.reduce(
          (s: number, d: any) => s + parseFloat(d.amount_remaining ?? d.amount_owed ?? 0),
          0
        )
        const totalCredits = credits.reduce(
          (s: number, c: any) => s + parseFloat(c.amount_remaining ?? c.amount_owed ?? 0),
          0
        )

        agentBilling = {
          debts,
          credits,
          total_debts: totalDebts,
          total_credits: totalCredits,
          net_balance: totalDebts - totalCredits,
        }
      }

      // Team info
      let teamInfo = null
      if (txn.team_agreement_id) {
        // team_agreement_id references team_member_agreements
        const { data: memberAgreement } = await supabase
          .from('team_member_agreements')
          .select(`
            id, team_id, agent_id, effective_date, end_date, agreement_document_url, firm_min_override, notes,
            team:teams!team_member_agreements_team_id_fkey(id, team_name, status)
          `)
          .eq('id', txn.team_agreement_id)
          .single()

        if (memberAgreement) {
          const team = Array.isArray(memberAgreement.team) ? memberAgreement.team[0] : memberAgreement.team
          
          // Get team lead from team_leads table
          let teamLeadName = null
          let teamLeadId = null
          if (team?.id) {
            const { data: teamLeadRecord } = await supabase
              .from('team_leads')
              .select(`
                agent_id,
                agent:users!team_leads_agent_id_fkey(
                  first_name, last_name, preferred_first_name, preferred_last_name
                )
              `)
              .eq('team_id', team.id)
              .is('end_date', null)
              .single()

            if (teamLeadRecord) {
              teamLeadId = teamLeadRecord.agent_id
              const leadUser = Array.isArray(teamLeadRecord.agent) ? teamLeadRecord.agent[0] : teamLeadRecord.agent
              if (leadUser) {
                teamLeadName = `${leadUser.preferred_first_name || leadUser.first_name} ${leadUser.preferred_last_name || leadUser.last_name}`
              }
            }
          }

          // Get all team members for this team
          const { data: allMembers } = await supabase
            .from('team_member_agreements')
            .select(`
              id, agent_id, effective_date, end_date,
              agent:users!team_member_agreements_agent_id_fkey(
                id, first_name, last_name, preferred_first_name, preferred_last_name
              )
            `)
            .eq('team_id', team?.id)
            .is('end_date', null)

          teamInfo = {
            agreement: {
              ...memberAgreement,
              team_name: team?.team_name,
              team_lead_id: teamLeadId,
            },
            members: allMembers || [],
            team_lead_name: teamLeadName,
          }
        }
      } else if ((primaryAgent as any)?.is_on_team && (primaryAgent as any)?.team_name) {
        // Find team by name
        const { data: team } = await supabase
          .from('teams')
          .select('id, team_name, status')
          .eq('team_name', (primaryAgent as any).team_name)
          .eq('status', 'active')
          .single()

        if (team) {
          // Get team lead
          let teamLeadName = null
          let teamLeadId = null
          const { data: teamLeadRecord } = await supabase
            .from('team_leads')
            .select(`
              agent_id,
              agent:users!team_leads_agent_id_fkey(
                first_name, last_name, preferred_first_name, preferred_last_name
              )
            `)
            .eq('team_id', team.id)
            .is('end_date', null)
            .single()

          if (teamLeadRecord) {
            teamLeadId = teamLeadRecord.agent_id
            const leadUser = Array.isArray(teamLeadRecord.agent) ? teamLeadRecord.agent[0] : teamLeadRecord.agent
            if (leadUser) {
              teamLeadName = `${leadUser.preferred_first_name || leadUser.first_name} ${leadUser.preferred_last_name || leadUser.last_name}`
            }
          }

          // Get all team members
          const { data: allMembers } = await supabase
            .from('team_member_agreements')
            .select(`
              id, agent_id, effective_date, end_date,
              agent:users!team_member_agreements_agent_id_fkey(
                id, first_name, last_name, preferred_first_name, preferred_last_name
              )
            `)
            .eq('team_id', team.id)
            .is('end_date', null)

          teamInfo = {
            agreement: {
              id: team.id,
              team_name: team.team_name,
              team_lead_id: teamLeadId,
              status: team.status,
            },
            members: allMembers || [],
            team_lead_name: teamLeadName,
          }
        }
      }

      // All checks linked to this transaction (all transaction types)
      const { data: checksData } = await supabase
        .from('checks_received')
        .select('*, check_payouts(*)')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      const checks = checksData || []

      // Checklist completions
      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('checklist_item_id, completed_by, completed_at, notes, auto_verified')
        .eq('transaction_id', id)

      // Checklist items (payouts template)
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('slug', 'payouts')
        .single()

      let checklistItems: any[] = []
      if (template?.id) {
        const { data: items } = await supabase
          .from('checklist_items')
          .select('id, section, label, description, display_order')
          .eq('checklist_template_id', template.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
        checklistItems = items || []
      }

      const completionMap = new Map((completions || []).map((c: any) => [c.checklist_item_id, c]))
      const checklist = checklistItems.map((item: any) => ({
        ...item,
        completion: completionMap.get(item.id) || null,
      }))

      return NextResponse.json({
        transaction: txn,
        agents: (agents || []).map((a: any) => ({
          ...a,
          // user is already included from the relationship join
          team_membership: membershipByAgent[a.agent_id] || null,
        })),
        primary_agent: primaryAgent || null,
        agent_billing: agentBilling,
        team_info: teamInfo,
        checks,
        checklist,
        company_settings: settings || null,
      })
    }

    // ── External brokerages (used by close modal) ────────────────────────────
    if (section === 'external_brokerages') {
      const { data: externalBrokerages, error } = await supabase
        .from('transaction_external_brokerages')
        .select('*')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ external_brokerages: externalBrokerages || [] })
    }

    // ── Contacts ──────────────────────────────────────────────────────────────
    if (section === 'contacts') {
      const { data: contacts, error } = await supabase
        .from('transaction_contacts')
        .select('*')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ contacts: contacts || [] })
    }

    // ── Checklist (legacy) ───────────────────────────────────────────────────
    if (section === 'checklist') {
      return NextResponse.json({ error: 'Use POST for checklist updates' }, { status: 405 })
    }

    return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    // ── Update transaction fields ────────────────────────────────────────────
    if (action === 'update_transaction') {
      const { updates } = body
      const { error } = await supabase
        .from('transactions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Toggle checklist item ────────────────────────────────────────────────
    if (action === 'toggle_checklist') {
      const { checklist_item_id, completed_by, completing } = body

      if (completing) {
        const { data: existing } = await supabase
          .from('checklist_completions')
          .select('id')
          .eq('transaction_id', id)
          .eq('checklist_item_id', checklist_item_id)
          .single()

        if (!existing) {
          const { error } = await supabase.from('checklist_completions').insert({
            transaction_id: id,
            checklist_item_id,
            completed_by,
            completed_at: new Date().toISOString(),
          })
          if (error) throw error
        }
      } else {
        const { error } = await supabase
          .from('checklist_completions')
          .delete()
          .eq('transaction_id', id)
          .eq('checklist_item_id', checklist_item_id)
        if (error) throw error
      }
      return NextResponse.json({ success: true })
    }

    // ── Update check ─────────────────────────────────────────────────────────
    if (action === 'update_check') {
      const { check_id, updates } = body
      const { error } = await supabase
        .from('checks_received')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', check_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Create check linked to transaction ───────────────────────────────────
    if (action === 'create_check') {
      const { check } = body
      const { data, error } = await supabase
        .from('checks_received')
        .insert({ ...check, transaction_id: id })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ check: data })
    }

    // ── Link existing check to transaction ───────────────────────────────────
    if (action === 'link_check') {
      const { check_id } = body
      const { error } = await supabase
        .from('checks_received')
        .update({ transaction_id: id, updated_at: new Date().toISOString() })
        .eq('id', check_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Add payout ───────────────────────────────────────────────────────────
    if (action === 'add_payout') {
      const { payout } = body
      const { data, error } = await supabase.from('check_payouts').insert(payout).select().single()
      if (error) throw error
      return NextResponse.json({ payout: data })
    }

    // ── Update payout ────────────────────────────────────────────────────────
    if (action === 'update_payout') {
      const { payout_id, updates } = body
      const { error } = await supabase.from('check_payouts').update(updates).eq('id', payout_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Delete payout ────────────────────────────────────────────────────────
    if (action === 'delete_payout') {
      const { payout_id } = body
      const { error } = await supabase.from('check_payouts').delete().eq('id', payout_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Update internal agent ────────────────────────────────────────────────
    if (action === 'update_internal_agent') {
      const { internal_agent_id, updates } = body
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update(updates)
        .eq('id', internal_agent_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Delete internal agent ─────────────────────────────────────────────────
    if (action === 'delete_internal_agent') {
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }
      // Verify the agent belongs to this transaction
      const { data: existing } = await supabase
        .from('transaction_internal_agents')
        .select('id')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()
      if (!existing) {
        return NextResponse.json({ error: 'Agent not found on this transaction' }, { status: 404 })
      }
      const { error } = await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', internal_agent_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Update external brokerage ────────────────────────────────────────────
    if (action === 'update_external_brokerage') {
      const { brokerage_id, updates } = body
      const { error } = await supabase
        .from('transaction_external_brokerages')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', brokerage_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    
    // ── Add new internal agent row ────────────────────────────────────────────
    if (action === 'add_internal_agent') {
      const { agent } = body
      
      // Validate agent_id is a valid UUID (required field)
      if (!agent.agent_id || agent.agent_id === '') {
        return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
      }
      
      // Build clean insert object - only include non-empty values
      const insertData: Record<string, any> = {
        transaction_id: id,
        agent_id: agent.agent_id,
        agent_role: agent.agent_role || 'co_agent',
        payment_status: agent.payment_status || 'pending',
      }
      
      // Only add optional fields if they have values
      if (agent.commission_plan) insertData.commission_plan = agent.commission_plan
      if (agent.agent_gross != null) insertData.agent_gross = agent.agent_gross
      if (agent.brokerage_split != null) insertData.brokerage_split = agent.brokerage_split
      if (agent.processing_fee != null) insertData.processing_fee = agent.processing_fee
      if (agent.coaching_fee != null) insertData.coaching_fee = agent.coaching_fee
      if (agent.other_fees != null) insertData.other_fees = agent.other_fees
      if (agent.other_fees_description) insertData.other_fees_description = agent.other_fees_description
      if (agent.btsa_amount != null) insertData.btsa_amount = agent.btsa_amount
      if (agent.debts_deducted != null) insertData.debts_deducted = agent.debts_deducted
      if (agent.team_lead_commission != null) insertData.team_lead_commission = agent.team_lead_commission
      if (agent.agent_net != null) insertData.agent_net = agent.agent_net
      if (agent.amount_1099_reportable != null) insertData.amount_1099_reportable = agent.amount_1099_reportable
      if (agent.payment_date) insertData.payment_date = agent.payment_date
      if (agent.payment_method) insertData.payment_method = agent.payment_method
      if (agent.payment_reference) insertData.payment_reference = agent.payment_reference
      
      const { data, error } = await supabase
        .from('transaction_internal_agents')
        .insert(insertData)
        .select(`
          *,
          user:users!transaction_internal_agents_agent_id_fkey(
            id, first_name, last_name, preferred_first_name, preferred_last_name,
            office_email, email, phone, office, commission_plan
          )
        `)
        .single()
      if (error) throw error
      return NextResponse.json({ agent: data })
    }

    // ── Add new external brokerage row ────────────────────────────────────────
    if (action === 'add_external_brokerage') {
      const { brokerage } = body
      
      // Validate brokerage_name is required
      if (!brokerage.brokerage_name || brokerage.brokerage_name === '') {
        return NextResponse.json({ error: 'brokerage_name is required' }, { status: 400 })
      }
      
      // Build clean insert object
      const insertData: Record<string, any> = {
        transaction_id: id,
        brokerage_name: brokerage.brokerage_name,
        brokerage_role: brokerage.brokerage_role || 'other',
        payment_status: brokerage.payment_status || 'pending',
      }
      
      // Only add optional fields if they have values
      if (brokerage.agent_name) insertData.agent_name = brokerage.agent_name
      if (brokerage.agent_email) insertData.agent_email = brokerage.agent_email
      if (brokerage.agent_phone) insertData.agent_phone = brokerage.agent_phone
      if (brokerage.broker_name) insertData.broker_name = brokerage.broker_name
      if (brokerage.brokerage_ein) insertData.brokerage_ein = brokerage.brokerage_ein
      if (brokerage.federal_id_type) insertData.federal_id_type = brokerage.federal_id_type
      if (brokerage.federal_id_number) insertData.federal_id_number = brokerage.federal_id_number
      if (brokerage.commission_amount != null) insertData.commission_amount = brokerage.commission_amount
      if (brokerage.amount_1099_reportable != null) insertData.amount_1099_reportable = brokerage.amount_1099_reportable
      if (brokerage.w9_on_file != null) insertData.w9_on_file = brokerage.w9_on_file
      if (brokerage.payment_date) insertData.payment_date = brokerage.payment_date
      if (brokerage.payment_method) insertData.payment_method = brokerage.payment_method
      if (brokerage.payment_reference) insertData.payment_reference = brokerage.payment_reference
      
      const { data, error } = await supabase
        .from('transaction_external_brokerages')
        .insert(insertData)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ brokerage: data })
    }
    // ── Mark agent PAID with full financial tracking ──────────────────────────
    if (action === 'mark_paid') {
      const {
        internal_agent_id,
        transaction_type,
        payment_date,
        payment_method,
        payment_reference,
        funding_source,
        debts_to_apply,
        agent_net_override,
        counts_toward_progress,
      } = body

      const { data: tia, error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('id', internal_agent_id)
        .single()
      if (tiaError || !tia) throw new Error('Agent record not found')

      const { data: agentUser, error: userError } = await supabase
        .from('users')
        .select('id, commission_plan, qualifying_transaction_count')
        .eq('id', tia.agent_id)
        .single()
      if (userError) throw userError

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

      let totalDebtsDeducted = 0
      if (debts_to_apply && debts_to_apply.length > 0) {
        for (const debtApp of debts_to_apply) {
          totalDebtsDeducted += parseFloat(debtApp.amount || 0)
        }
      }

      const agentNet =
        agent_net_override != null
          ? parseFloat(agent_net_override)
          : amount1099 - totalDebtsDeducted

      const tiaUpdate: any = {
        payment_status: 'paid',
        payment_date,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null,
        funding_source: funding_source || 'crc',
        amount_1099_reportable: Math.round(amount1099 * 100) / 100,
        debts_deducted: Math.round(totalDebtsDeducted * 100) / 100,
        agent_net: Math.round(agentNet * 100) / 100,
      }

      const { error: updateTiaError } = await supabase
        .from('transaction_internal_agents')
        .update(tiaUpdate)
        .eq('id', internal_agent_id)
      if (updateTiaError) throw updateTiaError

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
              amount_paid: parseFloat(debt.amount_paid || 0) + amountApplied,
              offset_transaction_id: id,
              offset_transaction_agent_id: internal_agent_id,
            }

            if (newRemaining <= 0) {
              debtUpdate.status = 'paid'
              debtUpdate.date_resolved = payment_date
            }

            await supabase.from('agent_debts').update(debtUpdate).eq('id', debtApp.debt_id)
          }
        }
      }

      if (counts_toward_progress !== false &&
          (tia.agent_role === 'primary_agent' || tia.agent_role === 'listing_agent') &&
          agentUser) {
        const plan = (agentUser.commission_plan || '').toLowerCase().trim()
        const txnIsLease = transaction_type ? isLeaseType(transaction_type) : false
        const userUpdate: any = {}

        // Leases never count toward cap or qualifying transactions
        if (!txnIsLease) {
          // Cap progress is now calculated dynamically from TIA - no need to store it

          // New agent plan ('new_agent') counts toward 5-deal qualifying threshold
          const isNewAgentPlan = plan === 'new_agent'
          if (isNewAgentPlan) {
            userUpdate.qualifying_transaction_count =
              (agentUser.qualifying_transaction_count || 0) + 1
          }
        }

        if (Object.keys(userUpdate).length > 0) {
          await supabase.from('users').update(userUpdate).eq('id', tia.agent_id)
        }
      }

      return NextResponse.json({
        success: true,
        updates: {
          ...tiaUpdate,
          debts_applied: debts_to_apply?.length || 0,
        },
      })
    }

    // ── Get agent debts for mark paid modal ──────────────────────────────────
    if (action === 'get_agent_debts') {
      const { agent_id } = body
      const { data: debts, error } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('agent_id', agent_id)
        .eq('status', 'outstanding')
        .order('date_incurred', { ascending: true })
      if (error) throw error
      return NextResponse.json({ debts: debts || [] })
    }

    // ── Create contact ────────────────────────────────────────────────────────
    if (action === 'create_contact') {
      const { contact } = body
      const { data, error } = await supabase
        .from('transaction_contacts')
        .insert({
          transaction_id: id,
          contact_type: contact.contact_type,
          contact_type_other: contact.contact_type_other || null,
          name: contact.name || null,
          phone: contact.phone || null,
          email: contact.email || null,
          company: contact.company || null,
          notes: contact.notes || null,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, contact: data })
    }

    // ── Update contact ────────────────────────────────────────────────────────
    if (action === 'update_contact') {
      const { contact_id, updates } = body
      const { error } = await supabase
        .from('transaction_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contact_id)
        .eq('transaction_id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Delete contact ────────────────────────────────────────────────────────
    if (action === 'delete_contact') {
      const { contact_id } = body
      const { error } = await supabase
        .from('transaction_contacts')
        .delete()
        .eq('id', contact_id)
        .eq('transaction_id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function isLeaseType(txnType: string): boolean {
  const t = txnType.toLowerCase()
  return (
    t.includes('lease') ||
    t.includes('apartment') ||
    t.includes('rent') ||
    t.includes('tenant') ||
    t.includes('landlord')
  )
}