import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

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
      .select('id, property_address, transaction_type, sales_price, closing_date, closed_date, cda_status, broker_approved_at')
      .eq('id', id)
      .single()
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    const { data: tias } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('id, agent_role, user:users!transaction_internal_agents_agent_id_fkey(preferred_first_name, first_name, preferred_last_name, last_name)')
      .eq('transaction_id', id)

    const agents = (tias || [])
      .filter((t: any) => !LINKED_ROLES.includes(t.agent_role))
      .map((t: any) => ({
        id: t.id,
        role: String(t.agent_role || '').replace(/_/g, ' '),
        name: [t.user?.preferred_first_name || t.user?.first_name, t.user?.preferred_last_name || t.user?.last_name]
          .filter(Boolean).join(' ') || 'Agent',
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

    return NextResponse.json({ transaction, agents, compliance })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
