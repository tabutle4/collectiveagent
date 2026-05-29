import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { graphClient } from '@/lib/microsoft-graph'

// Delete a named lease document. Removes the row in pm_lease_documents and
// attempts to delete the underlying OneDrive file; if the OneDrive deletion
// fails (file already gone, transient Graph error), the DB row is still
// removed since the document is no longer surfaced anywhere in our UI.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id: docId } = await params

    const { data: doc, error: fetchErr } = await supabaseAdmin
      .from('pm_lease_documents')
      .select('id, onedrive_path')
      .eq('id', docId)
      .single()

    if (fetchErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Best-effort OneDrive cleanup. deleteFile already swallows 404s.
    try {
      await graphClient.deleteFile(doc.onedrive_path)
    } catch (graphErr: any) {
      console.warn('Lease document OneDrive delete failed (continuing):', graphErr?.message)
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('pm_lease_documents')
      .delete()
      .eq('id', docId)

    if (deleteErr) {
      return NextResponse.json({ error: 'Failed to delete document row' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Lease document delete error:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete document' }, { status: 500 })
  }
}
