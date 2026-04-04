import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// GET /api/payload/monthly-invoice-status
// Returns agent IDs that have at least one open (unpaid) monthly fee invoice
// Called once on billing page load to power the "Open Monthly Invoice" filter
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    // Get all active agents with a Payload account
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, payload_payee_id')
      .eq('is_active', true)
      .not('payload_payee_id', 'is', null)
      .neq('payload_payee_id', '')

    if (error) throw error

    const agentIdsWithOpenMonthly: string[] = []

    // Fetch open invoices for each agent in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 10
    for (let i = 0; i < (users || []).length; i += BATCH_SIZE) {
      const batch = (users || []).slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async u => {
          try {
            const res = await fetch(
              `https://api.payload.com/invoices/?customer_id=${u.payload_payee_id}&status=unpaid&limit=20`,
              { headers: { Authorization: authHeader() } }
            )
            if (!res.ok) return null
            const data = await res.json()
            const invoices: any[] = data.values || []
            const hasOpenMonthly = invoices.some((inv: any) =>
              inv.items?.some((item: any) =>
                typeof item.type === 'string' &&
                item.type.toLowerCase().includes('monthly fee')
              )
            )
            return hasOpenMonthly ? u.id : null
          } catch {
            return null
          }
        })
      )
      results.forEach(id => { if (id) agentIdsWithOpenMonthly.push(id) })
    }

    return NextResponse.json({ agent_ids: agentIdsWithOpenMonthly })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}