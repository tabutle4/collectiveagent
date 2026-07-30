import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

export const dynamic = 'force-dynamic'

// Fetch rows whose id is in a large list, in small chunks. Avoids both the
// 1,000-row query cap and the oversized-request error a giant .in() list throws
// once there are many deals.
async function fetchByIds(table: string, cols: string, idColumn: string, ids: string[], extra?: (q: any) => any) {
  const rows: any[] = []
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    let q: any = supabaseAdmin.from(table).select(cols).in(idColumn, ids.slice(i, i + CHUNK))
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw error
    if (data) rows.push(...data)
  }
  return rows
}

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
      const agents = await fetchByIds(
        'users',
        'id, first_name, last_name, preferred_first_name, preferred_last_name',
        'id',
        agentIds
      )
      for (const a of agents || []) {
        agentMap[a.id] = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
      }
    }

    // Batch: transactions
    const txnIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)))
    const txnMap: Record<string, any> = {}
    if (txnIds.length) {
      const txns = await fetchByIds(
        'transactions',
        'id, property_address, client_name, status, compliance_status, transaction_type, is_locked, cda_status, cda_manual_status, cda_sent_manual_at, closing_date, move_in_date, funding_status, office_gross, office_net',
        'id',
        txnIds
      )
      for (const t of txns) txnMap[t.id] = t
    }
    // Batch: post closing compliance, one row per transaction.
    const postClosingMap: Record<string, any> = {}
    if (txnIds.length) {
      const pcRows = await fetchByIds(
        'transaction_post_closing',
        'transaction_id, status, completed_at, notes',
        'transaction_id',
        txnIds
      )
      for (const p of pcRows) postClosingMap[p.transaction_id] = p
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
      const flyers = await fetchByIds(
        'transaction_flyers',
        'id, transaction_id, flyer_type, status, photo_url, downloaded_at, sent_date',
        'transaction_id',
        txnIds,
        q => q.order('created_at', { ascending: false })
      )

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
      const rejectedDocs = await fetchByIds(
        'transaction_documents',
        'transaction_id, submission_id, file_name, compliance_notes, required_document_id',
        'transaction_id',
        txnIds,
        q => q.eq('compliance_status', 'rejected')
      )
      const rdIds = Array.from(
        new Set((rejectedDocs || []).filter((d: any) => d.required_document_id).map((d: any) => d.required_document_id))
      )
      const rdMap: Record<string, string> = {}
      if (rdIds.length) {
        const rds = await fetchByIds('required_documents', 'id, name', 'id', rdIds)
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

    // Batch: paid per agent per deal (the side's own agent got paid), and the
    // side agent's net for the Needs CDA money columns.
    const paidByTxnAgent: Record<string, boolean> = {}
    const netByTxnAgent: Record<string, number> = {}
    // Deal-level payout completeness. paidByTxnAgent only answers "did THIS
    // row's agent get paid"; the Needs CDA tab needs "is everyone on the deal
    // paid", because a deal with one agent still owed is not finished. A deal
    // with no payee rows at all is left undefined here and treated as paid by
    // the consumer, so this never strands a deal that has nobody to pay.
    //
    // Only rows carrying money gate the deal. A zero or negative payout -- a
    // linked team lead or referral agent paid inside the Collective Realty Co.
    // line, a row created before financials were entered -- is never marked
    // paid by anyone because there is nothing to pay, so counting it would pin
    // the deal on Needs CDA permanently.
    const allPaidByTxn: Record<string, boolean> = {}
    const owed = (v: any) => (parseFloat(String(v ?? 0)) || 0) > 0
    if (txnIds.length) {
      const internalAgents = await fetchByIds(
        'transaction_internal_agents',
        'transaction_id, agent_id, payment_status, agent_net',
        'transaction_id',
        txnIds
      )
      for (const ia of internalAgents || []) {
        if (ia.payment_status === 'paid') {
          paidByTxnAgent[`${ia.transaction_id}:${ia.agent_id}`] = true
        }
        if (owed(ia.agent_net)) {
          allPaidByTxn[ia.transaction_id] =
            (allPaidByTxn[ia.transaction_id] ?? true) && ia.payment_status === 'paid'
        }
        const key = `${ia.transaction_id}:${ia.agent_id}`
        netByTxnAgent[key] = (netByTxnAgent[key] || 0) + (parseFloat(String(ia.agent_net ?? 0)) || 0)
      }
      // Outside brokerages are owed off the same check and are marked paid on
      // the payouts report exactly like agents, so an unpaid one leaves the
      // deal unfinished for the same reason an unpaid agent does.
      const externalBrokerages = await fetchByIds(
        'transaction_external_brokerages',
        'transaction_id, payment_status, amount_1099_reportable, commission_amount',
        'transaction_id',
        txnIds
      )
      for (const eb of externalBrokerages || []) {
        if (owed(eb.amount_1099_reportable ?? eb.commission_amount)) {
          allPaidByTxn[eb.transaction_id] =
            (allPaidByTxn[eb.transaction_id] ?? true) && eb.payment_status === 'paid'
        }
      }
    }

    // Batch: checklist completeness per transaction. Sales use the 'cda'
    // checklist, leases use the 'payouts' checklist. Complete = every active
    // item on the transaction's template has a completion row.
    const checklistCompleteByTxn: Record<string, boolean> = {}
    if (txnIds.length) {
      const templates = await fetchByIds('checklist_templates', 'id, slug', 'slug', ['cda', 'payouts'])
      const cdaTemplateId = templates.find((t: any) => t.slug === 'cda')?.id || null
      const payoutTemplateId = templates.find((t: any) => t.slug === 'payouts')?.id || null
      const itemRows = await fetchByIds(
        'checklist_items',
        'id, checklist_template_id',
        'checklist_template_id',
        [cdaTemplateId, payoutTemplateId].filter(Boolean) as string[],
        q => q.eq('is_active', true)
      )
      const cdaItemIds = (itemRows || []).filter((i: any) => i.checklist_template_id === cdaTemplateId).map((i: any) => i.id)
      const payoutItemIds = (itemRows || []).filter((i: any) => i.checklist_template_id === payoutTemplateId).map((i: any) => i.id)
      const completions = await fetchByIds('checklist_completions', 'transaction_id, checklist_item_id', 'transaction_id', txnIds)
      const doneByTxn: Record<string, Set<string>> = {}
      for (const c of completions) {
        if (!doneByTxn[c.transaction_id]) doneByTxn[c.transaction_id] = new Set()
        doneByTxn[c.transaction_id].add(c.checklist_item_id)
      }
      for (const t of Object.values(txnMap) as any[]) {
        const lease = isLeaseTransactionType(t.transaction_type)
        const required = lease ? payoutItemIds : cdaItemIds
        const done = doneByTxn[t.id] || new Set<string>()
        checklistCompleteByTxn[t.id] = required.length > 0 && required.every((iid: string) => done.has(iid))
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
      const postClosing = r.transaction_id ? postClosingMap[r.transaction_id] || null : null
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
        // Every agent row AND every outside brokerage on the deal is marked
        // paid. Defaults to true when the deal has no payee rows (or no
        // transaction) so the Needs CDA tab keeps its existing behaviour there.
        all_payees_paid: r.transaction_id ? (allPaidByTxn[r.transaction_id] ?? true) : true,
        // Sent by the app, OR marked sent by hand when it went to title
        // outside the app. Either signal counts; the manual mark never
        // overwrites the in-app one.
        cda_sent: txn?.cda_status === 'sent' || txn?.cda_manual_status === 'sent',
        cda_manual_status: txn?.cda_manual_status || null,
        cda_sent_manual_at: txn?.cda_sent_manual_at || null,
        cda_status: txn?.cda_status || null,
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
        // Transaction is the source of truth for the closing date (two-way sync
        // with the tracker's editable field); fall back to the submission's own
        // date only when the deal has neither closing_date nor move_in_date set.
        closing_date: txn?.closing_date || txn?.move_in_date || d.closing_or_movein_date || null,
        transaction_type: txn?.transaction_type || null,
        is_locked: txn?.is_locked || false,
        // Money + funding for the Needs CDA view (mirrors the Brokermint CDA report)
        funding_status: txn?.funding_status || null,
        office_gross: txn?.office_gross ?? null,
        office_net: txn?.office_net ?? null,
        agent_net: r.transaction_id && r.agent_id ? (netByTxnAgent[`${r.transaction_id}:${r.agent_id}`] ?? null) : null,
        is_lease: isLeaseTransactionType(txn?.transaction_type),
        checklist_complete: r.transaction_id ? (checklistCompleteByTxn[r.transaction_id] || false) : false,
        transaction_status: txn?.status || null,
        // Post closing compliance, tracked per deal
        post_closing_status: isLeaseTransactionType(txn?.transaction_type) ? 'complete' : (postClosing?.status || 'not_started'),
        post_closing_completed_at: postClosing?.completed_at || null,
        post_closing_notes: postClosing?.notes || null,
        // The full form responses for the expandable detail
        form_data: d,
      }
    })

    // How many days before closing a deal counts as "send the CDA now" on the
    // Needs CDA tab. Configurable in Settings -> Terms; 7 if unset.
    const { data: cdaSettings } = await supabaseAdmin
      .from('company_settings')
      .select('cda_due_soon_days')
      .limit(1)
      .maybeSingle()
    const cdaDueSoonDays = Number(cdaSettings?.cda_due_soon_days ?? 7) || 7

    return NextResponse.json({ submissions: result, cda_due_soon_days: cdaDueSoonDays })
  } catch (err: any) {
    console.error('admin compliance GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
