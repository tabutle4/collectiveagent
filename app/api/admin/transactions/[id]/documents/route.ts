import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
      .select('id, transaction_type, property_address')
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
      return NextResponse.json({ doc: data })
    } catch (err: any) {
      console.error('add_document error:', err)
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

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    console.error('transaction documents POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
