import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { billedChargeTotal } from '@/lib/payload/commissionOffsetItems'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Human-readable labels for how an invoice was settled outside Payload.
const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  check: 'Check',
  ach: 'ACH',
  offset: 'Commission Offset',
}

// The amount to show for a settled invoice. total_paid only reflects real
// Payload transactions, so it is 0 for invoices settled via a negative line
// item (mark-invoice-paid). In that case fall back to the sum of the positive
// charge line items, which equals what the invoice was billed for.
//
// billedChargeTotal skips the synthetic commission-offset and offset-reversal
// rows. Without that skip, a $50 fee that had been staged and unstaged read
// $100 here, because the old unstage path reversed the offset by appending a
// second positive $50 charge rather than removing the offset.
function receiptAmount(inv: any): number {
  const totalPaid = Number(inv?.total_paid) || 0
  if (totalPaid > 0) return totalPaid
  return billedChargeTotal(inv)
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

    // fields[]=* keeps every default attribute and fields[]=items adds the
    // nested line items, which receiptAmount and the description fallback both
    // read. Payload documents fields[] on list endpoints as well as on single
    // objects: https://docs.payload.com/apis/api-design/
    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&limit=50&fields[]=*&fields[]=items`,
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

    // Who settled each invoice by hand, for the invoices where the app
    // recorded it. Payload has no field for the CRC user who marked an
    // invoice paid, so this comes from payload_invoice_settlements. Rows are
    // only there from the release that started writing them, so anything
    // settled before that keeps the old "Recorded manually" label rather than
    // being attributed to a guess. Reversed rows (the offset was unstaged) are
    // excluded so a settlement that no longer stands is not shown.
    const invoiceIds = settled.map((inv: any) => inv.id)
    const settlementByInvoice = new Map<string, any>()
    if (invoiceIds.length > 0) {
      const { data: settlements } = await supabase
        .from('payload_invoice_settlements')
        .select('invoice_id, settled_by_name, method, note, created_at')
        .in('invoice_id', invoiceIds)
        .is('reversed_at', null)
        .order('created_at', { ascending: false })
      for (const s of settlements || []) {
        // Newest first, so the first row seen for an invoice is the one to show.
        if (!settlementByInvoice.has(s.invoice_id)) settlementByInvoice.set(s.invoice_id, s)
      }
    }

    const receipts = await Promise.all(
      settled.map(async (inv: any) => {
        const { data: pl } = await supabase
          .from('payment_links')
          .select('url')
          .eq('invoice_id', inv.id)
          .single()

        const settlement = settlementByInvoice.get(inv.id)
        const methodLabel = settlement ? METHOD_LABELS[settlement.method] || settlement.method : null

        return {
          id: inv.id,
          amount: receiptAmount(inv),
          paid_at: inv.paid_timestamp || inv.modified_at || null,
          // Label by the invoice's own description (e.g. "June 2026 Monthly
          // Brokerage Fee") so the row says what it was for. Labeling by the
          // first line item's type produced confusing rows where two payments
          // for the same month showed as "Payment" and "Monthly Fee".
          description: inv.description || inv.items?.[0]?.description || inv.items?.[0]?.type || 'Payment',
          // How it was settled, so a recorded Zelle/check is not mistaken for a
          // duplicate of a card charge. total_paid only reflects real Payload
          // transactions; a zero balance with no total_paid was recorded by hand.
          method: Number(inv?.total_paid) > 0 ? 'Paid' : methodLabel || 'Recorded manually',
          // Who settled it and the note they typed are internal bookkeeping,
          // so they go only to a billing admin. An agent fetching their own
          // receipts gets nulls: the agent Fees page does not render either
          // field, and the note is not written for them to read.
          // Null also for anything settled before the app started recording it.
          settled_by_name: isAdmin ? settlement?.settled_by_name || null : null,
          settled_note: isAdmin ? settlement?.note || null : null,
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
