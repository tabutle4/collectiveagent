import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/compliance
// Lists agent form submissions (compliance, subsequent, retainer) with
// agent, transaction, and flyer info for the admin queue.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') // compliance | subsequent | retainer | all
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)

    const { data: submissions, error } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, agent_id, transaction_id, submitted_at, status, data, created_at')
      .order('submitted_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    let rows = submissions || []

    // Filter by mode if requested (mode lives inside data jsonb)
    if (mode && mode !== 'all') {
      rows = rows.filter((r: any) => (r.data?.submission_mode || 'compliance') === mode)
    }

    // Batch load agents
    const agentIds = Array.from(new Set(rows.map((r: any) => r.agent_id).filter(Boolean)))
    const agentMap: Record<string, any> = {}
    if (agentIds.length) {
      const { data: agents } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', agentIds)
      for (const a of agents || []) {
        agentMap[a.id] = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
      }
    }

    // Batch load transactions
    const txnIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)))
    const txnMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: txns } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name, status, compliance_status, transaction_type, is_locked, cda_status')
        .in('id', txnIds)
      for (const t of txns || []) txnMap[t.id] = t
    }

    // Batch load flyers for these transactions
    const flyerMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: flyers } = await supabaseAdmin
        .from('transaction_flyers')
        .select('id, transaction_id, flyer_type, status, photo_url, downloaded_at')
        .in('transaction_id', txnIds)
        .order('created_at', { ascending: false })
      for (const f of flyers || []) {
        if (!flyerMap[f.transaction_id]) flyerMap[f.transaction_id] = f
      }
    }

    // Batch load rejected documents (the "what's missing" from Leah's review).
    // These carry the reviewer's compliance_notes per document.
    const missingMap: Record<string, { name: string; notes: string | null }[]> = {}
    if (txnIds.length) {
      const { data: rejectedDocs } = await supabaseAdmin
        .from('transaction_documents')
        .select('transaction_id, file_name, compliance_notes, required_document_id')
        .in('transaction_id', txnIds)
        .eq('compliance_status', 'rejected')
      // Resolve required-document names for nicer labels
      const rdIds = Array.from(
        new Set((rejectedDocs || []).filter((d: any) => d.required_document_id).map((d: any) => d.required_document_id))
      )
      const rdMap: Record<string, string> = {}
      if (rdIds.length) {
        const { data: rds } = await supabaseAdmin
          .from('required_documents')
          .select('id, name')
          .in('id', rdIds)
        for (const rd of rds || []) rdMap[rd.id] = rd.name
      }
      for (const d of rejectedDocs || []) {
        const name = d.required_document_id && rdMap[d.required_document_id] ? rdMap[d.required_document_id] : d.file_name
        if (!missingMap[d.transaction_id]) missingMap[d.transaction_id] = []
        missingMap[d.transaction_id].push({ name, notes: d.compliance_notes || null })
      }
    }

    // Batch load the latest compliance review per transaction (reviewer + when).
    const reviewMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: reviews } = await supabaseAdmin
        .from('compliance_reviews')
        .select('transaction_id, status, notes, completed_at')
        .in('transaction_id', txnIds)
        .order('completed_at', { ascending: false, nullsFirst: false })
      for (const rv of reviews || []) {
        if (!reviewMap[rv.transaction_id]) reviewMap[rv.transaction_id] = rv
      }
    }

    // Batch load the primary agent's payment status to auto-derive "Paid".
    const paidMap: Record<string, boolean> = {}
    if (txnIds.length) {
      const { data: internalAgents } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('transaction_id, agent_role, payment_status')
        .in('transaction_id', txnIds)
      for (const ia of internalAgents || []) {
        // A deal counts as paid when its primary agent has been paid.
        if (ia.agent_role === 'primary_agent' && ia.payment_status === 'paid') {
          paidMap[ia.transaction_id] = true
        }
      }
    }

    const result = rows.map((r: any) => {
      const txn = txnMap[r.transaction_id] || null
      const flyer = flyerMap[r.transaction_id] || null
      return {
        id: r.id,
        submitted_at: r.submitted_at,
        status: r.status,
        submission_mode: r.data?.submission_mode || 'compliance',
        agent_id: r.agent_id,
        agent_name: agentMap[r.agent_id] || 'Unknown',
        transaction_id: r.transaction_id,
        property_address: txn?.property_address || r.data?.property_address || null,
        client_name: txn?.client_name || r.data?.client_name || null,
        transaction_status: txn?.status || null,
        compliance_status: txn?.compliance_status || null,
        cda_sent: txn?.cda_status === 'sent',
        paid: !!paidMap[r.transaction_id],
        missing_items: missingMap[r.transaction_id] || [],
        review: reviewMap[r.transaction_id]
          ? {
              status: reviewMap[r.transaction_id].status,
              notes: reviewMap[r.transaction_id].notes,
              completed_at: reviewMap[r.transaction_id].completed_at,
            }
          : null,
        is_locked: txn?.is_locked || false,
        locked_transaction: r.data?.locked_transaction || false,
        changed_fields: r.data?.changed_fields || null,
        retainer_amount: r.data?.retainer_amount || null,
        retainer_transaction_type: r.data?.retainer_transaction_type || null,
        expedite_acknowledged: r.data?.expedite_acknowledged || false,
        notes: r.data?.notes || null,
        flyer: flyer
          ? { id: flyer.id, flyer_type: flyer.flyer_type, has_photo: !!flyer.photo_url, downloaded: !!flyer.downloaded_at }
          : null,
      }
    })

    return NextResponse.json({ submissions: result })
  } catch (err: any) {
    console.error('admin compliance GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
