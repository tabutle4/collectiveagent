import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

export const dynamic = 'force-dynamic'

const LINKED_ROLES = ['team_lead', 'momentum_partner', 'referral_agent']

// Data for the CDA approval page: the deal, its producing agents (for CDA
// previews), and the agent's compliance request form. Broker/operations only.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_approve_cda')
  if (auth.error) return auth.error
  try {
    const { id } = await params
    const { data: transaction } = await supabaseAdmin
      .from('transactions')
      .select('id, property_address, transaction_type, sales_price, monthly_rent, office_net, ecommission_amount, closing_date, closed_date, cda_status, broker_approved_at')
      .eq('id', id)
      .single()
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    // Every figure the Send-for-approval screen shows, so the broker can see
    // the same money on the screen where the signature actually happens.
    const { data: tias } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select(`
        id, agent_id, agent_role, side, agent_basis, split_percentage, agent_gross,
        brokerage_split, btsa_amount, processing_fee, coaching_fee, other_fees,
        other_fees_description, rebate_amount, amount_1099_reportable, adjustment_notes,
        user:users!transaction_internal_agents_agent_id_fkey(preferred_first_name, first_name, preferred_last_name, last_name)
      `)
      .eq('transaction_id', id)

    const producing = (tias || []).filter((t: any) => !LINKED_ROLES.includes(t.agent_role))

    // Debts already staged against these rows -- the deductions that land on
    // the payout. amount_paid is what was actually applied.
    const producingIds = producing.map((t: any) => t.id)
    const { data: stagedDebts } = producingIds.length > 0
      ? await supabaseAdmin
          .from('agent_debts')
          .select('offset_transaction_agent_id, description, debt_type, amount_paid')
          .in('offset_transaction_agent_id', producingIds)
          .eq('status', 'paid')
      : { data: [] as any[] }

    // Everything the agent still owes that is NOT being collected on this deal,
    // so the broker sees the balance before signing. Credits are excluded --
    // they are money owed to the agent, not an open invoice.
    const agentIds = Array.from(new Set(producing.map((t: any) => t.agent_id).filter(Boolean)))
    const { data: openInvoiceRows } = agentIds.length > 0
      ? await supabaseAdmin
          .from('agent_debts')
          .select('agent_id, description, debt_type, amount_owed, amount_remaining, date_incurred')
          .in('agent_id', agentIds)
          .eq('status', 'outstanding')
          .neq('record_type', 'credit')
          .order('date_incurred', { ascending: false })
      : { data: [] as any[] }

    const num = (v: any) => parseFloat(String(v ?? 0)) || 0
    const agents = producing.map((t: any) => {
      const staged = (stagedDebts || [])
        .filter((d: any) => d.offset_transaction_agent_id === t.id)
        .map((d: any) => ({
          description: d.description || String(d.debt_type || '').replace(/_/g, ' ') || 'Debt',
          amount_paid: num(d.amount_paid),
        }))
      const stagedTotal = staged.reduce((sum: number, d: any) => sum + d.amount_paid, 0)
      const openInvoices = (openInvoiceRows || [])
        .filter((d: any) => d.agent_id === t.agent_id)
        .map((d: any) => ({
          description: d.description || String(d.debt_type || '').replace(/_/g, ' ') || 'Invoice',
          amount_remaining: num(d.amount_remaining ?? d.amount_owed),
          date_incurred: d.date_incurred || null,
        }))
      return {
        id: t.id,
        agent_id: t.agent_id,
        role: String(t.agent_role || '').replace(/_/g, ' '),
        name: [t.user?.preferred_first_name || t.user?.first_name, t.user?.preferred_last_name || t.user?.last_name]
          .filter(Boolean).join(' ') || 'Agent',
        side: t.side || null,
        agent_basis: num(t.agent_basis),
        split_percentage: num(t.split_percentage),
        agent_gross: num(t.agent_gross),
        brokerage_split: num(t.brokerage_split),
        btsa_amount: num(t.btsa_amount),
        processing_fee: num(t.processing_fee),
        coaching_fee: num(t.coaching_fee),
        other_fees: num(t.other_fees),
        other_fees_description: t.other_fees_description || null,
        rebate_amount: num(t.rebate_amount),
        amount_1099_reportable: num(t.amount_1099_reportable),
        adjustment_notes: t.adjustment_notes || null,
        staged,
        net_to_agent: Math.round((num(t.amount_1099_reportable) - stagedTotal) * 100) / 100,
        open_invoices: openInvoices,
        open_invoices_total: Math.round(
          openInvoices.reduce((sum: number, d: any) => sum + d.amount_remaining, 0) * 100
        ) / 100,
      }
    })

    // Checklist status for this deal. Leases use the 'payouts' template, sales
    // use the 'cda' template -- the same rule the transaction page follows.
    const { data: completions } = await supabaseAdmin
      .from('checklist_completions')
      .select('checklist_item_id, completed_at, auto_verified')
      .eq('transaction_id', id)
    const { data: template } = await supabaseAdmin
      .from('checklist_templates')
      .select('id')
      .eq('slug', isLeaseTransactionType(transaction.transaction_type) ? 'payouts' : 'cda')
      .single()
    const { data: checklistItems } = template?.id
      ? await supabaseAdmin
          .from('checklist_items')
          .select('id, section, label, display_order')
          .eq('checklist_template_id', template.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
      : { data: [] as any[] }
    const completionMap = new Map((completions || []).map((c: any) => [c.checklist_item_id, c]))
    const checklist = (checklistItems || []).map((item: any) => ({
      id: item.id,
      section: item.section || null,
      label: item.label,
      completed: !!completionMap.get(item.id),
      completed_at: completionMap.get(item.id)?.completed_at || null,
    }))

    const { data: subs } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('data, submitted_at')
      .eq('transaction_id', id)
      .order('submitted_at', { ascending: false })
      .limit(20)
    const compliance =
      (subs || []).find((s: any) => s.data?.submission_mode === 'compliance')?.data ||
      (subs && subs[0]?.data) || null

    return NextResponse.json({ transaction, agents, compliance, checklist })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
