import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// The amount to show for a settled invoice. total_paid only reflects real
// Payload transactions, so it is 0 for invoices settled via a negative line
// item (mark-invoice-paid). In that case fall back to the sum of the positive
// charge line items, which equals what the invoice was billed for.
function receiptAmount(inv: any): number {
  const totalPaid = Number(inv?.total_paid) || 0
  if (totalPaid > 0) return totalPaid
  const charges = (inv?.items || []).reduce((sum: number, item: any) => {
    const amt = Number(item?.amount) || 0
    return amt > 0 ? sum + amt : sum
  }, 0)
  return charges
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    // Agents can only see their own receipts; admins with billing permission can see anyone's.
    const isOwner = userId === auth.user.id
    const isAdmin = auth.permissions.has('can_manage_agent_billing')
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', userId)
      .single()

    if (!user?.payload_payee_id) return NextResponse.json({ receipts: [] })

    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&limit=50`,
      { headers: { Authorization: authHeader() } }
    )

    if (!res.ok) return NextResponse.json({ receipts: [] })

    const data = await res.json()

    // A receipt is any invoice that is settled: balance due of zero or less and
    // a positive amount that was actually billed. Keying off amount_due rather
    // than the invoice status string is what the owe list does too, so an
    // invoice settled manually via mark-invoice-paid - which Payload leaves
    // flagged "unpaid" with a zero balance - shows here just like a real card
    // or bank payment. The old status=paid filter hid those entirely.
    const settled = (data.values || []).filter(
      (inv: any) => Number(inv.amount_due ?? 0) <= 0 && receiptAmount(inv) > 0
    )

    const receipts = await Promise.all(
      settled.map(async (inv: any) => {
        const { data: pl } = await supabase
          .from('payment_links')
          .select('url')
          .eq('invoice_id', inv.id)
          .single()

        return {
          id: inv.id,
          amount: receiptAmount(inv),
          paid_at: inv.paid_timestamp || inv.modified_at || null,
          // Label by the invoice's own description (e.g. "June 2026 Monthly
          // Brokerage Fee") so the row says what it was for. Labeling by the
          // first line item's type produced confusing rows where two payments
          // for the same month showed as "Payment" and "Monthly Fee".
          description: inv.description || inv.items?.[0]?.type || 'Payment',
          // How it was settled, so a recorded Zelle/check is not mistaken for a
          // duplicate of a card charge. total_paid only reflects real Payload
          // transactions; a zero balance with no total_paid was recorded by hand.
          method: Number(inv?.total_paid) > 0 ? 'Paid' : 'Recorded manually',
          url: pl?.url || null,
        }
      })
    )

    // Most recent first, capped at 20.
    receipts.sort((a: any, b: any) => {
      const ta = a.paid_at ? new Date(a.paid_at).getTime() : 0
      const tb = b.paid_at ? new Date(b.paid_at).getTime() : 0
      return tb - ta
    })

    return NextResponse.json({ receipts: receipts.slice(0, 20) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
