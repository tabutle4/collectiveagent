import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Recalculate and update transactions.compliance_status based on document review state.
// Rules:
//   Any rejected doc present               -> 'incomplete'
//   All required docs approved, no reject  -> 'complete'
//   Any docs pending/in-progress           -> 'in_review'
//   No docs at all                         -> no change
async function syncComplianceStatus(transactionId: string): Promise<void> {
  const { data: docs } = await supabase
    .from('transaction_documents')
    .select('compliance_status, required_document_id')
    .eq('transaction_id', transactionId)
    .neq('compliance_status', 'superseded')

  if (!docs || docs.length === 0) return

  const hasRejected = docs.some((d: any) => d.compliance_status === 'rejected')
  const hasPending = docs.some((d: any) => d.compliance_status === 'pending')
  const requiredDocs = docs.filter((d: any) => d.required_document_id)
  const allRequiredApproved = requiredDocs.length > 0 &&
    requiredDocs.every((d: any) => d.compliance_status === 'approved')

  let newStatus: string
  if (hasRejected) {
    newStatus = 'incomplete'
  } else if (allRequiredApproved && !hasPending) {
    newStatus = 'complete'
  } else if (docs.some((d: any) => d.compliance_status === 'approved') || hasPending) {
    newStatus = 'in_review'
  } else {
    return
  }

  await supabase
    .from('transactions')
    .update({ compliance_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', transactionId)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Both admins (can_review_compliance) and agents (requireAuth) can view documents
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { id } = await params

  try {
    const { data: txn } = await supabase
      .from('transactions')
      .select('id, transaction_type, property_address, compliance_status')
      .eq('id', id)
      .single()

    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    // Load required documents for this transaction type
    let requiredDocs: any[] = []
    if (txn.transaction_type) {
      const { data: pft } = await supabase
        .from('processing_fee_types')
        .select('id, name, code')
        .eq('code', txn.transaction_type)
        .maybeSingle()

      if (pft) {
        const { data: rds } = await supabase
          .from('required_documents')
          .select('id, name, description, is_required, display_order')
          .eq('processing_fee_type_id', pft.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })

        requiredDocs = rds || []
      }
    }

    // Load uploaded transaction documents
    const { data: uploadedDocs, error: docsErr } = await supabase
      .from('transaction_documents')
      .select(`
        id, file_name, file_url, file_size, file_type,
        required_document_id, compliance_status, compliance_notes,
        reviewed_by, reviewed_at, version, onedrive_file_url,
        created_at, uploaded_by,
        uploader:users!transaction_documents_uploaded_by_fkey(
          id, first_name, last_name, preferred_first_name, preferred_last_name
        ),
        reviewer:users!transaction_documents_reviewed_by_fkey(
          id, first_name, last_name, preferred_first_name, preferred_last_name
        )
      `)
      .eq('transaction_id', id)
      .neq('compliance_status', 'superseded')
      .order('created_at', { ascending: false })

    if (docsErr) throw docsErr

    return NextResponse.json({
      transaction: txn,
      required_docs: requiredDocs,
      uploaded_docs: uploadedDocs || [],
    })
  } catch (err: any) {
    console.error('transaction documents GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { action } = body

  // ── Upload: any authenticated user (agent, TC, admin) ─────────────────────
  if (action === 'add_document') {
    const auth = await requireAuth(request)
    if (auth.error) return auth.error

    try {
      const { file_name, file_url, file_size, file_type, required_document_id, onedrive_file_url, ai_summary } = body

      if (!file_name || !file_url) {
        return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('transaction_documents')
        .insert({
          transaction_id: id,
          uploaded_by: auth.user!.id,
          file_name,
          file_url,
          file_size: file_size || null,
          file_type: file_type || null,
          required_document_id: required_document_id || null,
          onedrive_file_url: onedrive_file_url || null,
          compliance_status: 'pending',
          compliance_notes: ai_summary || null,
          version: 1,
        })
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    } catch (err: any) {
      console.error('add_document error:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── Replace: any authenticated user can replace (agent corrects and resubmits) ──
  if (action === 'replace') {
    const auth = await requireAuth(request)
    if (auth.error) return auth.error

    try {
      const { old_document_id, file_name, file_url, onedrive_file_url, file_size, file_type, required_document_id, ai_summary } = body
      if (!old_document_id || !file_name || !file_url) {
        return NextResponse.json({ error: 'old_document_id, file_name, and file_url are required' }, { status: 400 })
      }

      const { data: oldDoc } = await supabase
        .from('transaction_documents')
        .select('version')
        .eq('id', old_document_id)
        .eq('transaction_id', id)
        .single()

      await supabase
        .from('transaction_documents')
        .update({ compliance_status: 'superseded', updated_at: new Date().toISOString() })
        .eq('id', old_document_id)
        .eq('transaction_id', id)

      const { data: newDoc, error: insertError } = await supabase
        .from('transaction_documents')
        .insert({
          transaction_id: id,
          uploaded_by: auth.user!.id,
          file_name,
          file_url,
          onedrive_file_url: onedrive_file_url || null,
          file_size: file_size || null,
          file_type: file_type || null,
          required_document_id: required_document_id || null,
          compliance_status: 'pending',
          compliance_notes: ai_summary || null,
          version: (oldDoc?.version || 1) + 1,
        })
        .select()
        .single()

      if (insertError) throw insertError
      return NextResponse.json({ doc: newDoc })
    } catch (err: any) {
      console.error('replace error:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── All review actions: require can_review_compliance ─────────────────────
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    // ── Approve ──────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const { document_id } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      const { data, error } = await supabase
        .from('transaction_documents')
        .update({
          compliance_status: 'approved',
          compliance_notes: null,
          reviewed_by: auth.user!.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    }

    // ── Reject ───────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { document_id, compliance_notes } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })
      if (!compliance_notes?.trim()) {
        return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('transaction_documents')
        .update({
          compliance_status: 'rejected',
          compliance_notes: compliance_notes.trim(),
          reviewed_by: auth.user!.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    }

    // ── Reset to pending ─────────────────────────────────────────────────────
    if (action === 'reset') {
      const { document_id } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      const { data, error } = await supabase
        .from('transaction_documents')
        .update({
          compliance_status: 'pending',
          compliance_notes: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { document_id } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      const { error } = await supabase
        .from('transaction_documents')
        .delete()
        .eq('id', document_id)
        .eq('transaction_id', id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Assign: link a doc to required_document slot(s).
    // First slot updates the existing record. Additional slots create new sibling
    // records pointing to the same file so each slot gets its own status.
    if (action === 'assign') {
      const { document_id, required_document_id } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      // Fetch the source doc to copy file details
      const { data: sourceDoc } = await supabase
        .from('transaction_documents')
        .select('*')
        .eq('id', document_id)
        .eq('transaction_id', id)
        .single()

      if (!sourceDoc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

      // If source doc already has a required_document_id, create a new sibling record
      // rather than overwriting the original slot assignment
      if (sourceDoc.required_document_id && sourceDoc.required_document_id !== required_document_id) {
        const { data: newDoc, error: insertError } = await supabase
          .from('transaction_documents')
          .insert({
            transaction_id: id,
            uploaded_by: sourceDoc.uploaded_by,
            file_name: sourceDoc.file_name,
            file_url: sourceDoc.file_url,
            onedrive_file_url: sourceDoc.onedrive_file_url,
            file_size: sourceDoc.file_size,
            file_type: sourceDoc.file_type,
            required_document_id: required_document_id || null,
            compliance_status: 'pending',
            compliance_notes: sourceDoc.compliance_notes || null,
            version: sourceDoc.version || 1,
          })
          .select()
          .single()

        if (insertError) throw insertError
        await syncComplianceStatus(id)
        return NextResponse.json({ doc: newDoc })
      }

      // Otherwise update the existing record's slot assignment
      const { data, error } = await supabase
        .from('transaction_documents')
        .update({
          required_document_id: required_document_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    }

    // ── Reassign a doc to a different slot in place (move, not copy) ──────────
    if (action === 'reassign') {
      const { document_id, required_document_id } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      const { data, error } = await supabase
        .from('transaction_documents')
        .update({
          required_document_id: required_document_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (error) throw error
      await syncComplianceStatus(id)
      return NextResponse.json({ doc: data })
    }

    // ── Apply AI review to an already-uploaded doc (runs after upload, not during) ──
    // Writes the AI summary to compliance_notes, and if the doc is still unassigned,
    // assigns it to the AI-suggested slots (first slot in place, extras as siblings).
    if (action === 'apply_ai_review') {
      const { document_id, ai_summary, suggested_slots } = body
      if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

      const { data: sourceDoc } = await supabase
        .from('transaction_documents')
        .select('*')
        .eq('id', document_id)
        .eq('transaction_id', id)
        .single()

      if (!sourceDoc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

      const slots: string[] = Array.isArray(suggested_slots) ? suggested_slots.filter(Boolean) : []
      // Only auto-slot when the doc came in unassigned. If the admin already picked a
      // slot, leave it where they put it and just attach the summary.
      const shouldAutoSlot = !sourceDoc.required_document_id && slots.length > 0

      // Update the source doc: always attach the summary; set the first suggested
      // slot in place if it was unassigned.
      const { data: updated, error: updErr } = await supabase
        .from('transaction_documents')
        .update({
          compliance_notes: ai_summary || sourceDoc.compliance_notes || null,
          required_document_id: shouldAutoSlot ? slots[0] : sourceDoc.required_document_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document_id)
        .eq('transaction_id', id)
        .select()
        .single()

      if (updErr) throw updErr

      // Extra suggested slots become sibling rows (same file, different slot)
      if (shouldAutoSlot && slots.length > 1) {
        const siblings = slots.slice(1).map((slotId: string) => ({
          transaction_id: id,
          uploaded_by: sourceDoc.uploaded_by,
          file_name: sourceDoc.file_name,
          file_url: sourceDoc.file_url,
          onedrive_file_url: sourceDoc.onedrive_file_url,
          file_size: sourceDoc.file_size,
          file_type: sourceDoc.file_type,
          required_document_id: slotId,
          compliance_status: 'pending',
          compliance_notes: ai_summary || null,
          version: sourceDoc.version || 1,
        }))
        const { error: sibErr } = await supabase.from('transaction_documents').insert(siblings)
        if (sibErr) throw sibErr
      }

      await syncComplianceStatus(id)
      return NextResponse.json({ doc: updated })
    }

    // ── Mark file complete ───────────────────────────────────────────────────
    if (action === 'mark_complete') {
      const today = new Date().toISOString().split('T')[0]

      await supabase
        .from('transactions')
        .update({ compliance_status: 'complete', updated_at: new Date().toISOString() })
        .eq('id', id)

      // Set compliance_complete_date on all checks for this transaction that don't have one yet
      await supabase
        .from('checks_received')
        .update({ compliance_complete_date: today, updated_at: new Date().toISOString() })
        .eq('transaction_id', id)
        .is('compliance_complete_date', null)

      return NextResponse.json({ success: true, compliance_status: 'complete', compliance_complete_date: today })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    console.error('transaction documents POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
