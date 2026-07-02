import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/agent/flyer
// Lists the logged-in agent's flyers with property address, so they can pick
// one to upload a photo and download.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const agentId = auth.user.id

  try {
    // Flyers this agent requested. Also include flyers on transactions where the
    // agent is a primary internal agent, in case a flyer was created for them.
    const { data: flyers, error } = await supabaseAdmin
      .from('transaction_flyers')
      .select('id, transaction_id, flyer_type, status, photo_url, downloaded_at, created_at')
      .eq('requested_by', agentId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = flyers || []
    const txnIds = Array.from(new Set(rows.map(r => r.transaction_id).filter(Boolean)))

    const txnMap: Record<string, any> = {}
    if (txnIds.length) {
      const { data: txns } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, client_name')
        .in('id', txnIds)
      for (const t of txns || []) txnMap[t.id] = t
    }

    const result = rows.map(r => {
      const txn = txnMap[r.transaction_id] || null
      return {
        id: r.id,
        transaction_id: r.transaction_id,
        flyer_type: r.flyer_type,
        status: r.status,
        has_photo: !!r.photo_url,
        photo_url: r.photo_url || null,
        downloaded: !!r.downloaded_at,
        created_at: r.created_at,
        property_address: txn?.property_address || txn?.client_name || 'Untitled',
      }
    })

    return NextResponse.json({ flyers: result })
  } catch (err: any) {
    console.error('agent flyer list GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
