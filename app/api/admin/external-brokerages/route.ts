import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

// Returns a de-duplicated directory of external brokerages previously entered
// on any transaction, so the Payouts modal can prefill a new brokerage row
// instead of retyping. Identity, contact, address and W-9 / federal ID fields
// only. Commission and payment fields are intentionally excluded because they
// are deal-specific and must be entered fresh each time.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const rows = await fetchAllRows(
      'transaction_external_brokerages',
      `brokerage_name, brokerage_role, agent_name, agent_email, agent_phone,
       broker_name, broker_phone, broker_email,
       brokerage_address, brokerage_city, brokerage_state, brokerage_zip,
       side, federal_id_type, federal_id_number, w9_on_file, created_at`,
      { orderBy: { column: 'created_at', ascending: false, nullsFirst: false } }
    )

    // Dedupe by normalized brokerage name, keeping the most recent entry
    // (rows are already ordered newest first).
    const seen = new Set<string>()
    const directory: any[] = []
    for (const row of rows || []) {
      const name = (row.brokerage_name || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      directory.push(row)
    }

    return NextResponse.json({ brokerages: directory })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load brokerages' }, { status: 500 })
  }
}
