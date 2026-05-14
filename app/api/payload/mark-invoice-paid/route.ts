import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Human-readable labels for the payment methods the modal offers.
const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  check: 'Check',
  ach: 'ACH',
  offset: 'Commission Offset',
}

// Parse a monthly fee invoice's description to find which calendar month it
// covers, and return the end-of-month date for that period as 'YYYY-MM-DD'.
// Returns null if no recognizable month/year is found (e.g. a custom invoice),
// in which case the caller leaves monthly_fee_paid_through untouched.
function endOfBilledMonthFromInvoice(description: string | null | undefined): string | null {
  const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ]
  const haystack = (description || '').toLowerCase()
  let monthIdx = -1
  for (let i = 0; i < MONTHS.length; i++) {
    if (haystack.includes(MONTHS[i])) { monthIdx = i; break }
  }
  const yearMatch = haystack.match(/\b(20\d{2})\b/)
  if (monthIdx === -1 || !yearMatch) return null
  const year = parseInt(yearMatch[1], 10)
  // day 0 of next month == last day of this month
  return new Date(year, monthIdx + 1, 0).toISOString().split('T')[0]
}

// Pick the later of two YYYY-MM-DD date strings, so monthly_fee_paid_through
// never rolls backward when an older invoice is marked paid after a newer one.
function laterDate(existing: string | null | undefined, candidate: string): string {
  if (!existing) return candidate
  return existing >= candidate ? existing : candidate
}

// POST /api/payload/mark-invoice-paid
// Marks a Payload invoice settled by appending a negative "charge" line item
// that zeroes the balance due. This mirrors the manual workflow of adding a
// negative line item in the Payload dashboard. It does NOT create a Payload
// transaction (which could trigger a real charge against a saved payment
// method) - it is a pure bookkeeping adjustment for payments received outside
// Payload (Zelle, check, ACH, or commission offset).
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { invoice_id, user_id, method, note } = await request.json()

    if (!invoice_id || !user_id || !method) {
      return NextResponse.json(
        { error: 'invoice_id, user_id, and method are required' },
        { status: 400 }
      )
    }

    const methodLabel = METHOD_LABELS[method]
    if (!methodLabel) {
      return NextResponse.json(
        { error: 'method must be one of: zelle, check, ach, offset' },
        { status: 400 }
      )
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('payload_payee_id, monthly_fee_paid_through')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json(
        { error: 'Agent does not have a Payload customer ID.' },
        { status: 400 }
      )
    }

    // Fetch the invoice to read its current balance and description.
    const invRes = await fetch(`https://api.payload.com/invoices/${invoice_id}`, {
      headers: { Authorization: authHeader() },
    })
    const invoice = await invRes.json()
    if (!invRes.ok) {
      console.error('Payload invoice fetch failed:', invoice)
      return NextResponse.json(
        { error: invoice.message || 'Failed to load invoice' },
        { status: 500 }
      )
    }

    const balanceDue = Number(invoice.amount_due ?? 0)
    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: 'Invoice has no outstanding balance - it is already settled.' },
        { status: 400 }
      )
    }

    // Append a negative charge line item to zero out the balance. Using
    // entry_type 'charge' with a negative amount (rather than a 'payment'
    // entry) keeps this a pure ledger adjustment with no transaction
    // processing.
    const lineItemDescription = note
      ? `${methodLabel}: ${note}`
      : `Paid via ${methodLabel}`

    const lineRes = await fetch('https://api.payload.com/line_items/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        invoice_id,
        type: `Payment (${methodLabel})`,
        description: lineItemDescription,
        amount: String(-balanceDue),
        entry_type: 'charge',
      }),
    })

    const lineData = await lineRes.json()
    if (!lineRes.ok) {
      console.error('Payload line item creation failed:', lineData)
      return NextResponse.json(
        { error: lineData.message || 'Failed to mark invoice paid' },
        { status: 500 }
      )
    }

    // If this is a monthly fee invoice, advance monthly_fee_paid_through to the
    // end of the billed month. laterDate ensures we never roll the value
    // backward. Custom/non-monthly invoices leave the column untouched.
    const billedMonthEnd = endOfBilledMonthFromInvoice(invoice.description)
    let updatedPaidThrough: string | null = null
    if (billedMonthEnd) {
      updatedPaidThrough = laterDate(user.monthly_fee_paid_through, billedMonthEnd)
      if (updatedPaidThrough !== user.monthly_fee_paid_through) {
        await supabaseAdmin
          .from('users')
          .update({ monthly_fee_paid_through: updatedPaidThrough })
          .eq('id', user_id)
      }
    }

    return NextResponse.json({
      success: true,
      amount_cleared: balanceDue,
      monthly_fee_paid_through: updatedPaidThrough,
    })
  } catch (error: any) {
    console.error('Error marking invoice paid:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to mark invoice paid' },
      { status: 500 }
    )
  }
}
