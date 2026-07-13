import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/compliance
// Leah's compliance tracker. Compliance is per side: each row is one compliance
// submission (one agent, one side of a deal). The submission holds the truth:
// its status, admin_notes (missing items), reviewed_at (date completed). A
// subsequent recheck on the same deal does not add a row; it flags the existing
// side's row. Paid, flyer, and CDA are auto-derived, read-only.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const { data: allRows, error } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, agent_id, transaction_id, submitted_at, status, data, admin_notes, reviewed_at, created_at')
      .order('submitted_at', { ascending: false })
      .limit(3000)

    if (error) throw error

    const rows = (allRows || []).filter(
      (r: any) => (r.data?.submission_mode || '') === 'compliance'
    )
    const recheckByTxn: Record<string, { submitted_at: string; changed_fields: string[] | null }> = {}
    for (const r of allRows || []) {
      if ((r.data?.submission_mode || '') === 'subsequent' && r.transaction_id) {
        if (!recheckByTxn[r.transaction_id]) {
          recheckByTxn[r.transaction_id] = {
            submitted_at: r.submitted_at,
            changed_fields: r.data?.changed_fields || null,
          }
        }
      }
    }

    // Batch: agents
    const agentIds = Array.from(new Set(rows.map((r: any) => r.agent_id).filter(Boolean)))
    const agentMap: Record<string, string> = {}
    if (agentIds.length) {
      const { data: agents } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', agentIds)
      for (const a of agents || []) {
        agentMap[a.id] = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
      }
    }

    // Batch: transactions
    const txnIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)))
    const txnMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: txns } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name, status, compliance_status, transaction_type, is_locked, cda_status, closing_date, move_in_date')
        .in('id', txnIds)
      for (const t of txns || []) txnMap[t.id] = t
    }

    // Batch: flyers.
    // A deal can carry several flyers (Just Listed, Under Contract, Just Sold).
    // The compliance tracker is about the COMPLIANCE flyer, so prefer
    // just_sold / just_leased. Only fall back to the newest of any other type
    // when the compliance flyer has not been generated yet, so the row can still
    // show "Generate Flyer".
    const COMPLIANCE_FLYER_TYPES = ['just_sold', 'just_leased']
    const flyerMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: flyers } = await supabaseAdmin
        .from('transaction_flyers')
        .select('id, transaction_id, flyer_type, status, photo_url, downloaded_at, sent_date')
        .in('transaction_id', txnIds)
        .order('created_at', { ascending: false })

      const fallbackMap: Record<string, any> = {}
      for (const f of flyers || []) {
        if (COMPLIANCE_FLYER_TYPES.includes(f.flyer_type)) {
          if (!flyerMap[f.transaction_id]) flyerMap[f.transaction_id] = f
        } else if (!fallbackMap[f.transaction_id]) {
          fallbackMap[f.transaction_id] = f
        }
      }
      for (const [txnId, f] of Object.entries(fallbackMap)) {
        if (!flyerMap[txnId]) flyerMap[txnId] = f
      }
    }

    // Batch: rejected docs per SIDE (missing items default). Docs tagged to a
    // submission belong to that side; untagged docs count toward every side.
    const rejectedBySub: Record<string, { name: string; notes: string | null }[]> = {}
    const rejectedShared: Record<string, { name: string; notes: string | null }[]> = {}
    if (txnIds.length) {
      const { data: rejectedDocs } = await supabaseAdmin
        .from('transaction_documents')
        .select('transaction_id, submission_id, file_name, compliance_notes, required_document_id')
        .in('transaction_id', txnIds)
        .eq('compliance_status', 'rejected')
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
        const item = { name, notes: d.compliance_notes || null }
        if (d.submission_id) {
          if (!rejectedBySub[d.submission_id]) rejectedBySub[d.submission_id] = []
          rejectedBySub[d.submission_id].push(item)
        } else if (d.transaction_id) {
          if (!rejectedShared[d.transaction_id]) rejectedShared[d.transaction_id] = []
          rejectedShared[d.transaction_id].push(item)
        }
      }
    }

    // Batch: paid per agent per deal (the side's own agent got paid)
    const paidByTxnAgent: Record<string, boolean> = {}
    if (txnIds.length) {
      const { data: internalAgents } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('transaction_id, agent_id, payment_status')
        .in('transaction_id', txnIds)
      for (const ia of internalAgents || []) {
        if (ia.payment_status === 'paid') {
          paidByTxnAgent[`${ia.transaction_id}:${ia.agent_id}`] = true
        }
      }
    }

    const result = rows.map((r: any) => {
      const txn = txnMap[r.transaction_id] || null
      const flyer = flyerMap[r.transaction_id] || null
      const d = r.data || {}
      const missing = [
        ...(rejectedBySub[r.id] || []),
        ...(r.transaction_id ? rejectedShared[r.transaction_id] || [] : []),
      ]
      const recheck = r.transaction_id ? recheckByTxn[r.transaction_id] || null : null
      return {
        id: r.id,
        transaction_id: r.transaction_id,
        agent_id: r.agent_id,
        agent_name: agentMap[r.agent_id] || 'Unknown',
        submitted_at: r.submitted_at,
        side: d.representing || null,
        // The truth: submission status + Leah's fields
        compliance_status: r.status,
        missing_notes: r.admin_notes,
        completed_at: r.reviewed_at,
        // Auto-derived, read-only
        paid: !!(r.transaction_id && r.agent_id && paidByTxnAgent[`${r.transaction_id}:${r.agent_id}`]),
        cda_sent: txn?.cda_status === 'sent',
        flyer: flyer
          ? {
              id: flyer.id,
              flyer_type: flyer.flyer_type,
              has_photo: !!flyer.photo_url,
              downloaded: !!flyer.downloaded_at,
              sent: !!flyer.sent_date,
            }
          : null,
        recheck_requested: !!recheck,
        recheck_at: recheck?.submitted_at || null,
        recheck_changed_fields: recheck?.changed_fields || null,
        missing_items: missing,
        // Deal display fields
        property_address: d.property_address || txn?.property_address || null,
        client_name: d.client_name || txn?.client_name || null,
        closing_date: d.closing_or_movein_date || txn?.closing_date || txn?.move_in_date || null,
        transaction_type: txn?.transaction_type || null,
        is_locked: txn?.is_locked || false,
        // The full form responses for the expandable detail
        form_data: d,
      }
    })

    return NextResponse.json({ submissions: result })
  } catch (err: any) {
    console.error('admin compliance GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
