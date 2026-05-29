import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Parse a monthly fee invoice's description to figure out which calendar month
// it covers, and return the end-of-month date for that period. Falls back to
// null if no recognizable month/year is found so the caller can decide what to
// do (we keep the existing paid_through value rather than overwrite it wrong).
function endOfBilledMonthFromInvoice(data: any): string | null {
  const MONTHS = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december',
  ]
  const haystack = (
    (data.description || '') + ' ' +
    (data.items || []).map((i: any) => i.description || '').join(' ')
  ).toLowerCase()

  // Find every "<month> <year>" pair and keep the LATEST one. A single invoice
  // can bundle more than one month (for example a prepayment whose line items
  // are "June 2026 Monthly Brokerage Fee" and "July 2026 Monthly Brokerage
  // Fee"), and paid_through must advance to the last month covered, not the
  // first. The old logic stopped at the first month it saw and left those
  // agents short a month.
  const re = new RegExp(`\\b(${MONTHS.join('|')})\\s+(20\\d{2})\\b`, 'g')
  let best: { year: number; monthIdx: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(haystack)) !== null) {
    const monthIdx = MONTHS.indexOf(m[1])
    const year = parseInt(m[2], 10)
    if (!best || year > best.year || (year === best.year && monthIdx > best.monthIdx)) {
      best = { year, monthIdx }
    }
  }

  // Fallback for descriptions that mention a month and a year but not adjacent
  // (e.g. a prorated onboarding line "...remaining in May"): take the first
  // month found and the first year found, matching the previous behavior.
  if (!best) {
    let monthIdx = -1
    for (let i = 0; i < MONTHS.length; i++) {
      if (haystack.includes(MONTHS[i])) { monthIdx = i; break }
    }
    const yearMatch = haystack.match(/\b(20\d{2})\b/)
    if (monthIdx === -1 || !yearMatch) return null
    best = { year: parseInt(yearMatch[1], 10), monthIdx }
  }

  // day 0 of next month == last day of this month
  return new Date(best.year, best.monthIdx + 1, 0).toISOString().split('T')[0]
}

// Pick the later of two YYYY-MM-DD date strings. Used to make sure
// monthly_fee_paid_through never rolls backward when a stale invoice
// (e.g., a late March payment) lands after a later month was already paid.
function laterDate(existing: string | null | undefined, candidate: string): string {
  if (!existing) return candidate
  return existing >= candidate ? existing : candidate
}

// Resolve a Payload transaction id to its underlying invoice (with line items).
// A payment webhook only carries a transaction id; the invoice it paid is
// linked through the transaction's allocations or its payment_link. We expand
// both, read the invoice id from whichever is present, then fetch the full
// invoice (and its items) which is what every downstream fee check needs.
// Heavy logging is intentional so a single real test payment reveals the exact
// shapes in the Vercel logs if any field does not line up.
async function resolveInvoiceFromTransaction(txnId: string): Promise<any | null> {
  try {
    const txnRes = await fetch(
      `https://api.payload.com/transactions/${txnId}?fields[]=*&fields[]=allocations&fields[]=payment_link`,
      { headers: { Authorization: authHeader() } }
    )
    const txn = await txnRes.json()
    if (!txnRes.ok) {
      console.error('Payload transaction fetch failed:', txn)
      return null
    }
    console.log('PAYLOAD_TXN_RAW:', JSON.stringify(txn))

    const allocations = Array.isArray(txn.allocations) ? txn.allocations : []
    const invoiceId =
      txn.invoice_id ||
      allocations.find((a: any) => a?.invoice_id)?.invoice_id ||
      txn.payment_link?.invoice_id ||
      null

    if (!invoiceId) {
      console.log('Payload webhook: transaction has no linked invoice', txnId)
      return null
    }

    const invRes = await fetch(
      `https://api.payload.com/invoices/${invoiceId}?fields[]=*&fields[]=items`,
      { headers: { Authorization: authHeader() } }
    )
    const invoice = await invRes.json()
    if (!invRes.ok) {
      console.error('Payload invoice fetch failed:', invoice)
      return null
    }
    console.log('PAYLOAD_INVOICE_RAW:', JSON.stringify(invoice))
    return invoice
  } catch (err) {
    console.error('resolveInvoiceFromTransaction error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Log the raw event so a real test payment reveals the exact shape in the
    // Vercel logs if anything does not line up.
    console.log('PAYLOAD_WEBHOOK_RAW:', JSON.stringify(body))

    // Payload sends webhook triggers in the shape:
    //   { object: 'webhook_trigger', trigger: 'payment',
    //     triggered_on: { id: 'txn_...', object: 'transaction', value: 'processed' } }
    // The trigger only carries a transaction id, so resolve it to the invoice
    // (and its line items) before applying any fee logic. 'payment' covers
    // manually authorized payments; 'automatic_payment' covers autopay.
    const trigger = body?.trigger
    const triggeredOn = body?.triggered_on
    const isPaymentTrigger = trigger === 'payment' || trigger === 'automatic_payment'

    if (!isPaymentTrigger || triggeredOn?.object !== 'transaction' || !triggeredOn?.id) {
      return NextResponse.json({ received: true })
    }

    const invoice = await resolveInvoiceFromTransaction(triggeredOn.id)
    if (!invoice) {
      console.log('Payload webhook: no invoice resolved for transaction', triggeredOn.id)
      return NextResponse.json({ received: true })
    }

    // Only act once the invoice is actually settled. amount_due <= 0 is the
    // robust signal regardless of how Payload labels the status string.
    if (Number(invoice.amount_due ?? 0) > 0) {
      console.log(
        'Payload webhook: invoice not fully paid yet',
        invoice.id,
        'amount_due',
        invoice.amount_due
      )
      return NextResponse.json({ received: true })
    }

    if (!invoice.customer_id) {
      return NextResponse.json({ received: true })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, onboarding_fee_paid, monthly_fee_paid_through')
      .eq('payload_payee_id', invoice.customer_id)
      .single()

    if (!user) return NextResponse.json({ received: true })

    const paidDate = invoice.paid_timestamp
      ? String(invoice.paid_timestamp).split('T')[0].split(' ')[0]
      : new Date().toISOString().split('T')[0]
    const items = Array.isArray(invoice.items) ? invoice.items : []

    // Onboarding fee
    const hasOnboardingItem = items.some((item: any) => item.type === 'Onboarding Fee')
    if (hasOnboardingItem && !user.onboarding_fee_paid) {
      await supabase
        .from('users')
        .update({ onboarding_fee_paid: true, onboarding_fee_paid_date: paidDate })
        .eq('id', user.id)
      console.log('Marked onboarding fee paid for user:', user.id)
    }

    // Monthly fee (covers both manual payment and autopay). Use the month/year
    // parsed from the invoice, not the date the payment landed; fall back to
    // end-of-current-month. laterDate makes sure we never roll the value back.
    const hasMonthlyItem = items.some(
      (item: any) => item.type === 'Monthly Fee' || item.type === 'Monthly Fee (Prorated)'
    )
    if (hasMonthlyItem) {
      const billedMonthEnd = endOfBilledMonthFromInvoice(invoice)
      const fallback = (() => {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      })()
      const newPaidThrough = laterDate(user.monthly_fee_paid_through, billedMonthEnd ?? fallback)
      await supabase
        .from('users')
        .update({ monthly_fee_paid_through: newPaidThrough })
        .eq('id', user.id)
      console.log(
        'Updated monthly fee paid through for user:',
        user.id,
        'to',
        newPaidThrough,
        billedMonthEnd ? '(from invoice month)' : '(fallback)'
      )
    }

    // Custom invoice: resolve matching agent_debts. One invoice can bundle
    // multiple custom fees, each its own debt row carrying this invoice id in
    // notes, so resolve every match. The previous .single() threw on 2+ rows
    // and left all of them unresolved.
    const hasCustomItem = items.some(
      (item: any) =>
        item.type !== 'Onboarding Fee' &&
        item.type !== 'Monthly Fee' &&
        item.type !== 'Monthly Fee (Prorated)' &&
        item.type !== 'Late Fee'
    )
    if (hasCustomItem && invoice.id) {
      const { data: debts } = await supabase
        .from('agent_debts')
        .select('id, amount_owed')
        .eq('agent_id', user.id)
        .eq('status', 'outstanding')
        .ilike('notes', `%${invoice.id}%`)

      if (debts && debts.length > 0) {
        for (const debt of debts) {
          await supabase
            .from('agent_debts')
            .update({
              status: 'resolved',
              amount_paid: debt.amount_owed,
              date_resolved: paidDate,
            })
            .eq('id', debt.id)
          console.log('Marked agent debt resolved:', debt.id)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
