import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section') // 'full' | 'checklist' | 'check'

    // ── Full transaction detail load ─────────────────────────────────────────
    if (!section || section === 'full') {
      const [
        { data: txn, error: txnError },
        { data: agents },
        { data: settings },
      ] = await Promise.all([
        supabase.from('transactions').select('*').eq('id', id).single(),
        supabase.from('transaction_internal_agents').select('*').eq('transaction_id', id),
        supabase.from('company_settings').select('referral_tracking_url, crm_url, crm_name').single(),
      ])

      if (txnError || !txn) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }

      // Get agent user records
      const agentIds = (agents || []).map((a: any) => a.agent_id).filter(Boolean)
      const { data: agentUsers } = agentIds.length > 0
        ? await supabase
            .from('users')
            .select(`
              id, first_name, last_name, preferred_first_name, preferred_last_name,
              office_email, email, phone, office, commission_plan, license_number,
              license_expiration, nrds_id, mls_id, association, join_date,
              division, revenue_share, revenue_share_percentage, referring_agent,
              referring_agent_id, is_on_team, team_name, team_lead,
              cap_progress, cap_year, qualifying_transaction_count,
              waive_processing_fees, special_commission_notes, headshot_url
            `)
            .in('id', agentIds)
        : { data: [] }

      // Primary agent (submitted_by)
      const primaryAgentId = txn.submitted_by
      const primaryAgent = (agentUsers || []).find((u: any) => u.id === primaryAgentId)
        || (agentUsers || [])[0]

      // Agent billing (debts + credits)
      let agentBilling = null
      if (primaryAgentId) {
        const { data: billingRecords } = await supabase
          .from('agent_debts')
          .select('id, record_type, debt_type, description, amount_owed, amount_remaining, date_incurred, status')
          .eq('agent_id', primaryAgentId)
          .eq('status', 'outstanding')
          .order('date_incurred', { ascending: false })

        const records = billingRecords || []
        const debts = records.filter((r: any) => r.record_type !== 'credit')
        const credits = records.filter((r: any) => r.record_type === 'credit')
        const totalDebts = debts.reduce((s: number, d: any) => s + parseFloat(d.amount_remaining ?? d.amount_owed ?? 0), 0)
        const totalCredits = credits.reduce((s: number, c: any) => s + parseFloat(c.amount_remaining ?? c.amount_owed ?? 0), 0)

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
        const [{ data: agreement }, { data: members }] = await Promise.all([
          supabase.from('team_agreements').select('*').eq('id', txn.team_agreement_id).single(),
          supabase.from('team_members').select('*').eq('team_agreement_id', txn.team_agreement_id),
        ])
        // Get team lead name
        let teamLeadName = null
        if (agreement?.team_lead_id) {
          const { data: leadUser } = await supabase
            .from('users')
            .select('first_name, last_name, preferred_first_name, preferred_last_name')
            .eq('id', agreement.team_lead_id)
            .single()
          if (leadUser) {
            teamLeadName = `${leadUser.preferred_first_name || leadUser.first_name} ${leadUser.preferred_last_name || leadUser.last_name}`
          }
        }
        teamInfo = { agreement, members: members || [], team_lead_name: teamLeadName }
      } else if (primaryAgent?.is_on_team && primaryAgent?.team_name) {
        // Agent is on a team but agreement not linked to transaction yet
        const { data: agreement } = await supabase
          .from('team_agreements')
          .select('*')
          .eq('team_name', primaryAgent.team_name)
          .eq('status', 'active')
          .single()
        if (agreement) {
          const { data: members } = await supabase
            .from('team_members')
            .select('*')
            .eq('team_agreement_id', agreement.id)
          let teamLeadName = null
          if (agreement.team_lead_id) {
            const { data: leadUser } = await supabase
              .from('users')
              .select('first_name, last_name, preferred_first_name, preferred_last_name')
              .eq('id', agreement.team_lead_id)
              .single()
            if (leadUser) {
              teamLeadName = `${leadUser.preferred_first_name || leadUser.first_name} ${leadUser.preferred_last_name || leadUser.last_name}`
            }
          }
          teamInfo = { agreement, members: members || [], team_lead_name: teamLeadName }
        }
      }

      // Check linked to this transaction (for leases)
      let check = null
      if (txn.transaction_type && isLeaseType(txn.transaction_type)) {
        const { data: checkData } = await supabase
          .from('checks_received')
          .select('*, check_payouts(*)')
          .eq('transaction_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        check = checkData || null
      }

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

      // Merge completions into checklist items
      const completionMap = new Map((completions || []).map((c: any) => [c.checklist_item_id, c]))
      const checklist = checklistItems.map((item: any) => ({
        ...item,
        completion: completionMap.get(item.id) || null,
      }))

      return NextResponse.json({
        transaction: txn,
        agents: (agents || []).map((a: any) => ({
          ...a,
          user: (agentUsers || []).find((u: any) => u.id === a.agent_id) || null,
        })),
        primary_agent: primaryAgent || null,
        agent_billing: agentBilling,
        team_info: teamInfo,
        check,
        checklist,
        company_settings: settings || null,
      })
    }

    // ── Mark checklist item complete / incomplete ────────────────────────────
    if (section === 'checklist') {
      return NextResponse.json({ error: 'Use POST for checklist updates' }, { status: 405 })
    }

    return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
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
        // Check if already completed
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
      const { data, error } = await supabase
        .from('check_payouts')
        .insert(payout)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ payout: data })
    }

    // ── Update payout ────────────────────────────────────────────────────────
    if (action === 'update_payout') {
      const { payout_id, updates } = body
      const { error } = await supabase
        .from('check_payouts')
        .update(updates)
        .eq('id', payout_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Delete payout ────────────────────────────────────────────────────────
    if (action === 'delete_payout') {
      const { payout_id } = body
      const { error } = await supabase
        .from('check_payouts')
        .delete()
        .eq('id', payout_id)
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
  return t.includes('lease') || t.includes('apartment') || t.includes('rent')
}