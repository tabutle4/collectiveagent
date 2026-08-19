import { NextRequest, NextResponse } from 'next/server'
import { complianceIsLease } from '@/lib/forms/requiredFields'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { feeCodeFromRepresenting } from '@/lib/transactions/feeCode'
import { ensurePrimaryTia, autoCascadeTransaction } from '@/lib/transactions/cascade'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'

// Convert compliance-form commission inputs into a gross commission dollar
// amount. commission_basis_price is the PRICE the commission is computed on
// and must NEVER be written to gross_commission directly - that bug produced
// deals whose commission equaled the full sale price. Returns null when the
// inputs cannot produce a plausible figure; the office sets it at review.
function computeGrossFromRate(basisPrice: any, rate: any, rateType: any): number | null {
  const clean = (v: any) => parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''))
  const basis = clean(basisPrice)
  const rateNum = clean(rate)
  if (!Number.isFinite(rateNum) || rateNum <= 0) return null
  let gross: number | null = null
  if (String(rateType || 'percent') === 'flat') gross = Math.round(rateNum * 100) / 100
  else if (Number.isFinite(basis) && basis > 0) gross = Math.round(basis * rateNum) / 100
  if (gross != null && Number.isFinite(basis) && basis > 1000 && gross > basis * 0.25) return null
  return gross
}


// Actions for an unlinked compliance submission on the compliance tracker:
//   action: 'search'  -> find existing transactions to link to (by address/client)
//   action: 'link'    -> attach the submission to an existing transaction
//   action: 'create'  -> create a new transaction from the submission and link it
//
// A submission is "unlinked" when agent_form_submissions.transaction_id is null.
// All three actions require can_review_compliance, the same permission the
// tracker itself uses.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const action = body.action as string

    if (action === 'list_unlinked') {
      const { data: subs, error: listErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, agent_id, submitted_at, data')
        .filter('data->>submission_mode', 'eq', 'compliance')
        .is('transaction_id', null)
        .order('submitted_at', { ascending: false })
      if (listErr) throw listErr
      const items = (subs || []).map((s: any) => {
        const d = s.data || {}
        const rawType = String(d.representing || d.transaction_type || '').toLowerCase()
        const isLease = complianceIsLease({ representing: String(d.representing || ''), referred_client_type: (d as any).referred_client_type })
        const pnum = (v: any): number | null => {
          if (v === null || v === undefined || v === '') return null
          const m = String(v).replace(/,/g, '').match(/-?\d+\.?\d*/)
          return m ? parseFloat(m[0]) : null
        }
        const rent = pnum(d.total_sales_rent_price)
        const term = pnum(d.lease_term_months)
        const price = pnum(d.total_sales_rent_price)
        const volume = isLease ? (rent && term ? rent * term : null) : price
        return {
          submission_id: s.id,
          agent_id: s.agent_id,
          submitted_at: s.submitted_at,
          agent_name: d.agent_name || null,
          property_address: d.property_address || null,
          client_name: d.client_name || null,
          transaction_type: d.transaction_type || null,
          is_lease: isLease,
          monthly_rent: rent,
          lease_term: term,
          sales_price: price,
          sales_volume: volume,
          date: d.closing_or_movein_date || null,
          commission_rate: d.commission_rate || null,
        }
      })
      return NextResponse.json({ items })
    }

    if (action === 'search') {
      const q = String(body.query || '').trim()
      if (q.length < 2) return NextResponse.json({ transactions: [] })

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name, status, transaction_type, closing_date')
        .or(`property_address.ilike.%${q}%,client_name.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(15)

      if (error) throw error
      return NextResponse.json({ transactions: data || [] })
    }

    if (action === 'link') {
      const submissionId = String(body.submission_id || '')
      const transactionId = String(body.transaction_id || '')
      // relink: true means the caller knows the submission is already linked and
      // wants to point it at a different transaction (used to fix bad matches).
      const relink = body.relink === true
      if (!submissionId || !transactionId) {
        return NextResponse.json({ error: 'Missing submission_id or transaction_id' }, { status: 400 })
      }

      // Confirm the submission exists before writing.
      const { data: sub, error: subErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, transaction_id')
        .eq('id', submissionId)
        .single()
      if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
      if (sub.transaction_id && !relink) {
        return NextResponse.json({ error: 'Submission is already linked' }, { status: 409 })
      }

      // Confirm the target transaction exists.
      const { data: txn, error: txnErr } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('id', transactionId)
        .single()
      if (txnErr || !txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

      const { error: updErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .update({ transaction_id: transactionId, updated_at: new Date().toISOString() })
        .eq('id', submissionId)
      if (updErr) throw updErr

      // Linking a compliance submission to a deal: guarantee the submitting
      // agent has a primary tia row, then cascade with whatever commission
      // inputs the deal already carries.
      const { data: subAgent } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('agent_id')
        .eq('id', submissionId)
        .single()
      if (subAgent?.agent_id) {
        await ensurePrimaryTia(transactionId, subAgent.agent_id)
      }
      await autoCascadeTransaction(transactionId)
      // The sign-off travels with the submission, so the checks on both deals
      // have to be re-stamped: the new deal may now be complete, and the deal
      // the submission left may no longer be. Without this the pay-by date on
      // the payouts report keeps the state it had before the relink.
      await syncCheckComplianceDate(transactionId)
      if (sub.transaction_id && sub.transaction_id !== transactionId) {
        await syncCheckComplianceDate(sub.transaction_id)
      }

      return NextResponse.json({ success: true, transaction_id: transactionId })
    }

    if (action === 'unlink') {
      const submissionId = String(body.submission_id || '')
      if (!submissionId) return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 })

      const { data: sub, error: subErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, transaction_id')
        .eq('id', submissionId)
        .single()
      if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
      if (!sub.transaction_id) {
        return NextResponse.json({ error: 'Submission is not linked' }, { status: 409 })
      }

      const { error: updErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .update({ transaction_id: null, updated_at: new Date().toISOString() })
        .eq('id', submissionId)
      if (updErr) throw updErr

      // The deal just lost a side, so its checks must not keep a pay-by date
      // that no longer has a sign-off behind it. clearWhenNoSides covers the
      // common shape: the submission removed was the deal's only one, which
      // leaves zero sides and would otherwise take the helper's early return.
      await syncCheckComplianceDate(sub.transaction_id, { clearWhenNoSides: true })

      return NextResponse.json({ success: true, unlinked: true })
    }

    if (action === 'create') {
      const submissionId = String(body.submission_id || '')
      if (!submissionId) return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 })

      const { data: sub, error: subErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, agent_id, transaction_id, data')
        .eq('id', submissionId)
        .single()
      if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
      if (sub.transaction_id) {
        return NextResponse.json({ error: 'Submission is already linked' }, { status: 409 })
      }

      const d = sub.data || {}
      const propertyAddress = d.property_address || null
      if (!propertyAddress) {
        return NextResponse.json({ error: 'Submission has no property address to create a transaction from' }, { status: 400 })
      }

      const rawType = String(d.representing || d.transaction_type || '').toLowerCase()
      const isLease = complianceIsLease({ representing: String(d.representing || ''), referred_client_type: (d as any).referred_client_type })

      // Overview data can be overridden by the review page; fall back to the
      // submission JSON when the client does not supply a field. Numbers are
      // parsed defensively because backfilled Book data can carry stray text
      // ("12 months", "10k") in these fields.
      const ov = body.overview || {}
      const parseNum = (v: any): number | null => {
        if (v === null || v === undefined || v === '') return null
        const m = String(v).replace(/,/g, '').match(/-?\d+\.?\d*/)
        return m ? parseFloat(m[0]) : null
      }
      const rent = ov.monthly_rent !== undefined ? parseNum(ov.monthly_rent) : parseNum(d.total_sales_rent_price)
      const term = ov.lease_term !== undefined ? parseNum(ov.lease_term) : parseNum(d.lease_term_months)
      const salesPrice = ov.sales_price !== undefined ? parseNum(ov.sales_price) : parseNum(d.total_sales_rent_price)
      let salesVolume = ov.sales_volume !== undefined ? parseNum(ov.sales_volume) : null
      if (salesVolume === null) {
        salesVolume = isLease
          ? (rent && term ? rent * term : null)
          : salesPrice
      }
      const dateVal = ov.date !== undefined ? (ov.date || null) : (d.closing_or_movein_date || null)

      const insertRow: Record<string, any> = {
        property_address: propertyAddress,
        status: 'active',
        transaction_type: feeCodeFromRepresenting(d.representing, d.tenant_transaction_type) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'),
        client_name: (ov.client_name !== undefined ? ov.client_name : d.client_name) || null,
        client_email: d.client_email || null,
        sales_volume: salesVolume,
        gross_commission: computeGrossFromRate(d.commission_basis_price, d.commission_rate, d.commission_rate_type),
        submitted_by: sub.agent_id || null,
        compliance_status: 'complete',
        updated_at: new Date().toISOString(),
      }
      if (isLease) {
        insertRow.move_in_date = dateVal
        insertRow.monthly_rent = rent
        insertRow.lease_term = term
      } else {
        insertRow.closing_date = dateVal
        insertRow.sales_price = salesPrice
      }

      const { data: newTxn, error: txnErr } = await supabaseAdmin
        .from('transactions')
        .insert(insertRow)
        .select('id')
        .single()
      if (txnErr || !newTxn) throw (txnErr || new Error('Failed to create transaction'))

      // Attach the submitting agent as an internal agent on the new transaction.
      // Stamp the full canonical field set so the row is complete before the
      // cascade below runs: side lets autoCascadeTransaction resolve the right
      // side commission as basis, and plan / units / counts_toward_progress
      // mirror app/api/transactions/route.ts. Side is derived from the
      // submission's transaction_type the same way the canonical route derives
      // it (null when the type carries no side, which the cascade tolerates).
      if (sub.agent_id) {
        const linkAgentSide =
          rawType.includes('landlord') ? 'landlord'
          : rawType.includes('seller') ? 'seller'
          : rawType.includes('tenant') ? 'tenant'
          : rawType.includes('buyer') ? 'buyer'
          : null
        const { data: linkAgentUser } = await supabaseAdmin
          .from('users')
          .select('commission_plan, lease_commission_plan')
          .eq('id', sub.agent_id)
          .single()
        const linkCommissionPlan = isLease
          ? (linkAgentUser?.lease_commission_plan || linkAgentUser?.commission_plan || '')
          : (linkAgentUser?.commission_plan || '')
        await supabaseAdmin.from('transaction_internal_agents').insert({
          transaction_id: newTxn.id,
          agent_id: sub.agent_id,
          agent_role: 'primary_agent',
          side: linkAgentSide,
          commission_plan: linkCommissionPlan,
          counts_toward_progress: !isLease,
          units: 1,
          payment_status: 'pending',
          funding_source: 'crc',
          uses_canonical_math: true,
          updated_at: new Date().toISOString(),
        })
      }

      const { error: updErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .update({ transaction_id: newTxn.id, updated_at: new Date().toISOString() })
        .eq('id', submissionId)
      if (updErr) throw updErr

      // New deal created from a submission: cascade so the commission tab is
      // populated the moment a basis exists on the submission data.
      await autoCascadeTransaction(newTxn.id)
      // A brand new deal has no checks yet, but the submission may already be
      // signed off, so stamp for the case where a check is linked immediately.
      await syncCheckComplianceDate(newTxn.id)

      return NextResponse.json({ success: true, transaction_id: newTxn.id, created: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('link-transaction error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
