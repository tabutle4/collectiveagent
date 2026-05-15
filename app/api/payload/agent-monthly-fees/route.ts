import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// An invoice carries a monthly fee obligation if any line item is a Monthly Fee
// or a prorated Monthly Fee. Matches the same definition the Payload webhook
// uses to advance monthly_fee_paid_through, and intentionally includes the
// prorated month bundled into an unpaid onboarding invoice.
function hasMonthlyFeeItem(inv: any): boolean {
  return (inv?.items || []).some(
    (i: any) => i?.type === 'Monthly Fee' || i?.type === 'Monthly Fee (Prorated)'
  )
}

// GET /api/payload/agent-monthly-fees?user_id=<id>
// Returns the unpaid monthly fee balance for a single agent. Used by the
// transaction sidebar for display only - it does NOT modify any state, settle
// invoices, or deduct from commission.
//
// Response: { count, total, invoices: [{id, description, amount_due, due_date}] }
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('payload_payee_id')
      .eq('id', userId)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json({ count: 0, total: 0, invoices: [] })
    }

    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&status=unpaid&limit=50`,
      { headers: { Authorization: authHeader() } }
    )

    if (!res.ok) return NextResponse.json({ count: 0, total: 0, invoices: [] })

    const data = await res.json()
    const monthly = (data.values || []).filter(
      (inv: any) => Number(inv.amount_due ?? 0) > 0 && hasMonthlyFeeItem(inv)
    )

    const invoices = monthly.map((inv: any) => ({
      id: inv.id,
      description: inv.description || 'Monthly Fee',
      amount_due: Number(inv.amount_due ?? 0),
      due_date: inv.due_date ?? null,
    }))

    const total = invoices.reduce((sum: number, inv: any) => sum + inv.amount_due, 0)

    return NextResponse.json({ count: invoices.length, total, invoices })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
