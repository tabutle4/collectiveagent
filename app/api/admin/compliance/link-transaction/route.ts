import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

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
      if (!submissionId || !transactionId) {
        return NextResponse.json({ error: 'Missing submission_id or transaction_id' }, { status: 400 })
      }

      // Confirm the submission exists and is actually unlinked before writing.
      const { data: sub, error: subErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, transaction_id')
        .eq('id', submissionId)
        .single()
      if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
      if (sub.transaction_id) {
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

      return NextResponse.json({ success: true, transaction_id: transactionId })
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

      const rawType = String(d.transaction_type || '').toLowerCase()
      const isLease = rawType.includes('tenant') || rawType.includes('landlord') || rawType.includes('lease')

      const { data: newTxn, error: txnErr } = await supabaseAdmin
        .from('transactions')
        .insert({
          property_address: propertyAddress,
          status: 'active',
          transaction_type: isLease ? 'lease' : 'sale',
          client_name: d.client_name || null,
          closing_date: d.closing_or_movein_date || null,
          submitted_by: sub.agent_id || null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (txnErr || !newTxn) throw (txnErr || new Error('Failed to create transaction'))

      // Attach the submitting agent as an internal agent on the new transaction.
      if (sub.agent_id) {
        await supabaseAdmin.from('transaction_internal_agents').insert({
          transaction_id: newTxn.id,
          agent_id: sub.agent_id,
          agent_role: 'primary_agent',
          payment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
      }

      const { error: updErr } = await supabaseAdmin
        .from('agent_form_submissions')
        .update({ transaction_id: newTxn.id, updated_at: new Date().toISOString() })
        .eq('id', submissionId)
      if (updErr) throw updErr

      return NextResponse.json({ success: true, transaction_id: newTxn.id, created: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('link-transaction error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
