import { NextRequest, NextResponse } from 'next/server'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'
import { requirePermission, requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Compliance is per side: each compliance submission (agent_form_submissions row,
// one per agent per side) holds its own status. Document review state drives the
// SUBMISSION's status. The transaction's compliance_status is then dual-written as
// the worst status across sides so legacy readers keep working during rollout.
// Rules per side (unchanged from the old per-transaction rules):
//   Any rejected doc present               -> 'incomplete'
//   All required docs approved, no reject  -> 'complete'
//   Any docs pending/in-progress           -> 'in_review'
//   No docs at all                         -> no change
// Docs with a NULL submission_id are shared and count toward every side.
function statusFromDocs(docs: any[]): string | null {
  if (!docs || docs.length === 0) return null
  const hasRejected = docs.some((d: any) => d.compliance_status === 'rejected')
  const hasPending = docs.some((d: any) => d.compliance_status === 'pending')
  const requiredDocs = docs.filter((d: any) => d.required_document_id)
  const allRequiredApproved = requiredDocs.length > 0 &&
    requiredDocs.every((d: any) => d.compliance_status === 'approved')
  if (hasRejected) return 'incomplete'
  if (allRequiredApproved && !hasPending) return 'complete'
  if (docs.some((d: any) => d.compliance_status === 'approved') || hasPending) return 'in_review'
  return null
}

async function syncComplianceStatus(transactionId: string): Promise<void> {
  const [{ data: subs }, { data: docs }] = await Promise.all([
    supabase
      .from('agent_form_submissions')
      .select('id, status')
      .eq('transaction_id', transactionId)
      .filter('data->>submission_mode', 'eq', 'compliance'),
    supabase
      .from('transaction_documents')
      .select('compliance_status, required_document_id, submission_id')
      .eq('transaction_id', transactionId)
      .neq('compliance_status', 'superseded'),
  ])

  const submissions = subs || []
  const allDocs = docs || []
  const nowIso = new Date().toISOString()

  // No compliance submissions yet (pre-migration or non-compliance deal):
  // keep the old per-transaction behavior so nothing regresses.
  if (submissions.length === 0) {
    const legacy = statusFromDocs(allDocs)
    if (!legacy) return
    await supabase
      .from('transactions')
      .update({ compliance_status: legacy, updated_at: nowIso })
      .eq('id', transactionId)
    return
  }

  // Per side: this side's docs plus shared (untagged) docs.
  const sideStatuses: string[] = []
  for (const sub of submissions) {
    const sideDocs = allDocs.filter(
      (d: any) => d.submission_id === sub.id || d.submission_id === null
    )
    const computed = statusFromDocs(sideDocs)
    const effective = computed || sub.status
    sideStatuses.push(effective)
    if (computed && computed !== sub.status) {
      const patch: Record<string, any> = { status: computed, updated_at: nowIso }
      if (computed === 'complete') patch.reviewed_at = nowIso
      await supabase.from('agent_form_submissions').update(patch).eq('id', sub.id)
    }
  }

  // Dual-write the transaction as the worst side, so legacy readers stay correct.
  const derived = sideStatuses.includes('incomplete')
    ? 'incomplete'
    : sideStatuses.some(s => s === 'in_review' || s === 'submitted')
      ? 'in_review'
      : sideStatuses.length > 0 && sideStatuses.every(s => s === 'complete')
        ? 'complete'
        : null
  if (derived) {
    await supabase
      .from('transactions')
      .update({ compliance_status: derived, updated_at: nowIso })
      .eq('id', transactionId)
  }

  // The pay-by deadline follows the sign-off, whichever screen it came from.
  await syncCheckComplianceDate(transactionId)
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
      .select('id, transaction_type, property_address, compliance_status, representing')
      .eq('id', id)
      .single()

    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    // Load required documents for this transaction type
    let requiredDocs: any[] = []
    const { data: allPfts } = await supabase
      .from('processing_fee_types')
      .select('id, name, code')
    const pfts = allPfts || []
    const pftByCode: Record<string, any> = {}
    for (const p of pfts) if (p.code) pftByCode[p.code] = p

    const requiredDocsForPft = async (pftId: string) => {
      const { data: rds } = await supabase
        .from('required_documents')
        .select('id, name, description, is_required, display_order')
        .eq('processing_fee_type_id', pftId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      return rds || []
    }

    if (txn.transaction_type && pftByCode[txn.transaction_type]) {
      requiredDocs = await requiredDocsForPft(pftByCode[txn.transaction_type].id)
    }

    // Sides can have different required-doc checklists (a buyer side and a
    // seller side do not owe the same paperwork). Derive each side's type code
    // from its own representing; when the side matches the transaction's
    // representing (or nothing better exists) it uses the deal's checklist.
    const sideTypeCode = (representing: string | null, txnRepresenting: string | null): string | null => {
      if (!representing || representing === txnRepresenting) return txn.transaction_type
      const role = representing.toLowerCase()
      const candidates = pfts.filter((p: any) => (p.code || '').toLowerCase().includes(role))
      if (candidates.length === 0) return txn.transaction_type
      const txnIsV2 = /_v2$/.test(txn.transaction_type || '')
      const sameFamily = candidates.find((p: any) => /_v2$/.test(p.code) === txnIsV2)
      return (sameFamily || candidates[0]).code
    }

    // Load uploaded transaction documents
    const { data: uploadedDocs, error: docsErr } = await supabase
      .from('transaction_documents')
      .select(`
        id, file_name, file_url, file_size, file_type,
        required_document_id, compliance_status, compliance_notes, ai_review,
        reviewed_by, reviewed_at, version, onedrive_file_url,
        created_at, uploaded_by, submission_id,
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

    // Load the compliance submissions (the sides). Each side owns its own docs
    // and its own status. Two sides max per deal.
    const { data: sideSubs } = await supabase
      .from('agent_form_submissions')
      .select('id, agent_id, status, admin_notes, reviewed_at, submitted_at, data')
      .eq('transaction_id', id)
      .filter('data->>submission_mode', 'eq', 'compliance')
      .order('submitted_at', { ascending: true })

    const sideAgentIds = Array.from(new Set((sideSubs || []).map((s: any) => s.agent_id).filter(Boolean)))
    const agentNameMap: Record<string, string> = {}
    if (sideAgentIds.length) {
      const { data: agents } = await supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', sideAgentIds)
      for (const a of agents || []) {
        agentNameMap[a.id] = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
      }
    }

    // Resolve each side's checklist once per distinct type code.
    const requiredDocsByCode: Record<string, any[]> = {}
    if (txn.transaction_type) requiredDocsByCode[txn.transaction_type] = requiredDocs
    for (const s of sideSubs || []) {
      const code = sideTypeCode(s.data?.representing || null, txn.representing || null)
      if (code && !(code in requiredDocsByCode)) {
        requiredDocsByCode[code] = pftByCode[code] ? await requiredDocsForPft(pftByCode[code].id) : []
      }
    }

    let submissions = (sideSubs || []).map((s: any) => {
      const code = sideTypeCode(s.data?.representing || null, txn.representing || null)
      return {
        id: s.id,
        agent_id: s.agent_id,
        agent_name: agentNameMap[s.agent_id] || 'Unknown agent',
        side: s.data?.representing || null,
        status: s.status,
        admin_notes: s.admin_notes,
        reviewed_at: s.reviewed_at,
        submitted_at: s.submitted_at,
        required_docs: (code && requiredDocsByCode[code]) || requiredDocs,
      }
    })

    // Per-side visibility: admins see every side; an agent sees only their own
    // side's submission and docs (their tagged docs plus shared untagged ones).
    let visibleDocs = uploadedDocs || []
    const isReviewer = auth.permissions.has('can_review_compliance')
    if (!isReviewer) {
      const mySubmissionIds = new Set(
        submissions.filter(s => s.agent_id === auth.user!.id).map(s => s.id)
      )
      submissions = submissions.filter(s => s.agent_id === auth.user!.id)
      if (submissions.length > 0) {
        visibleDocs = visibleDocs.filter(
          (d: any) => d.submission_id === null || mySubmissionIds.has(d.submission_id)
        )
      }
    }

    return NextResponse.json({
      transaction: txn,
      required_docs: requiredDocs,
      uploaded_docs: visibleDocs,
      submissions,
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
      let { submission_id } = body

      if (!file_name || !file_url) {
        return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 })
      }

      // Non-admin uploads always land on the uploader's own side, regardless of
      // what the client sent. Admins may target any side explicitly, but on a
      // deal with compliance sides an admin upload must apply to a side: default
      // to the only side when there is one, reject when there are two and no
      // side was chosen.
      if (!auth.permissions.has('can_review_compliance')) {
        const { data: ownSub } = await supabase
          .from('agent_form_submissions')
          .select('id')
          .eq('transaction_id', id)
          .eq('agent_id', auth.user!.id)
          .filter('data->>submission_mode', 'eq', 'compliance')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        submission_id = ownSub?.id || null
      } else if (!submission_id) {
        const { data: sides } = await supabase
          .from('agent_form_submissions')
          .select('id')
          .eq('transaction_id', id)
          .filter('data->>submission_mode', 'eq', 'compliance')
        const sideList = sides || []
        if (sideList.length === 1) {
          submission_id = sideList[0].id
        } else if (sideList.length > 1) {
          return NextResponse.json({ error: 'This deal has more than one compliance side. Choose which side this document belongs to.' }, { status: 400 })
        }
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
          ai_review: ai_summary || null,
          submission_id: submission_id || null,
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
        .select('version, submission_id')
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
          ai_review: ai_summary || null,
          submission_id: oldDoc?.submission_id || null,
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
            submission_id: sourceDoc.submission_id || null,
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
          ai_review: ai_summary || sourceDoc.ai_review || null,
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
          ai_review: ai_summary || null,
          submission_id: sourceDoc.submission_id || null,
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
      const nowIso = new Date().toISOString()

      // The submissions are the source of truth: mark every side complete.
      await supabase
        .from('agent_form_submissions')
        .update({ status: 'complete', reviewed_at: nowIso, reviewed_by: auth.user!.id, updated_at: nowIso })
        .eq('transaction_id', id)
        .filter('data->>submission_mode', 'eq', 'compliance')

      await supabase
        .from('transactions')
        .update({ compliance_status: 'complete', updated_at: nowIso })
        .eq('id', id)

      // The per-check compliance_complete_date column is retired. Every
      // reader now derives the completion date from the submissions'
      // reviewed_at (set above), so there is nothing to stamp on checks.
      return NextResponse.json({ success: true, compliance_status: 'complete', compliance_complete_date: today })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    console.error('transaction documents POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
