import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/form-submissions
// Unified view of ALL form submissions across every form type, with agent names
// and the linked transaction or listing resolved. Supports optional filters:
//   ?mode=<submission_mode>   filter by form type (pre-listing, just-listed,
//                             under_contract, compliance, prospective-agent, ...)
//   ?agent_id=<uuid>          filter by agent
//   ?limit=<n>                cap results (default 200, max 500)
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode')
    const agentId = searchParams.get('agent_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)

    let query = supabaseAdmin
      .from('agent_form_submissions')
      .select('id, agent_id, transaction_id, listing_id, form_id, submitted_at, status, data, created_at')
      .order('submitted_at', { ascending: false })
      .limit(limit)

    if (agentId) query = query.eq('agent_id', agentId)

    const { data: submissions, error } = await query
    if (error) throw error

    let rows = submissions || []
    if (mode && mode !== 'all') {
      // Retainers are filed from the Compliance & CDA form, so they belong on
      // that tab next to the compliance submissions rather than only under All.
      const modes = mode === 'compliance' ? ['compliance', 'retainer'] : [mode]
      rows = rows.filter((r: any) => modes.includes(r.data?.submission_mode || 'compliance'))
    }

    // Batch load agent names
    const agentIds = Array.from(new Set(rows.map((r: any) => r.agent_id).filter(Boolean)))
    const agentMap: Record<string, string> = {}
    if (agentIds.length) {
      const { data: agents } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', agentIds)
      for (const a of agents || []) {
        agentMap[a.id] = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim() || 'Unknown'
      }
    }

    // Batch load linked transactions
    const txnIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)))
    const txnMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: txns } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name, status')
        .in('id', txnIds)
      for (const t of txns || []) txnMap[t.id] = t
    }

    // Batch load linked listings
    const listingIds = Array.from(new Set(rows.map((r: any) => r.listing_id).filter(Boolean)))
    const listingMap: Record<string, any> = {}
    if (listingIds.length) {
      const { data: listings } = await supabaseAdmin
        .from('listings')
        .select('id, property_address, client_names, status')
        .in('id', listingIds)
      for (const l of listings || []) listingMap[l.id] = l
    }

    // Human-friendly labels for the form types
    const MODE_LABELS: Record<string, string> = {
      'pre-listing': 'Pre-Listing',
      'just-listed': 'Just Listed',
      under_contract: 'New Contract',
      compliance: 'Compliance & CDA',
      subsequent: 'Resubmission',
      retainer: 'Retainer',
      'prospective-agent': 'Prospective Agent',
    }

    const result = rows.map((r: any) => {
      const txn = r.transaction_id ? txnMap[r.transaction_id] : null
      const listing = r.listing_id ? listingMap[r.listing_id] : null
      const submissionMode = r.data?.submission_mode || 'compliance'
      return {
        id: r.id,
        submitted_at: r.submitted_at,
        status: r.status,
        submission_mode: submissionMode,
        mode_label: MODE_LABELS[submissionMode] || submissionMode,
        agent_id: r.agent_id,
        agent_name: agentMap[r.agent_id] || 'Unknown',
        property_address:
          txn?.property_address || listing?.property_address || r.data?.property_address || null,
        client_name:
          txn?.client_name || listing?.client_names || r.data?.client_name || null,
        transaction_id: r.transaction_id || null,
        listing_id: r.listing_id || null,
        linked_status: txn?.status || listing?.status || null,
        // Raw answers so the page can expand a row and show every field that was
        // submitted. Internal keys are stripped when rendering.
        data: r.data || {},
      }
    })

    return NextResponse.json({ success: true, submissions: result })
  } catch (err: any) {
    console.error('admin form-submissions GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
