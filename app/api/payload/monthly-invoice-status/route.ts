import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// A monthly fee invoice is identified by its top-level description, which
// create-invoice and the monthly cron both set to "<Month> <Year> Monthly
// Brokerage Fee". Onboarding and custom invoices do not get that description,
// so this cleanly excludes prorated onboarding fees.
function isMonthlyInvoice(inv: any): boolean {
  return (
    typeof inv?.description === 'string' &&
    inv.description.toLowerCase().includes('monthly brokerage fee')
  )
}

export type AgentMonthlyStatus = {
  unpaid_monthly_count: number
  unpaid_monthly_total: number
  unpaid_monthly_invoice_ids: string[]
  has_current_month_invoice: boolean
}

// GET /api/payload/monthly-invoice-status
// Returns a per-agent map of monthly fee billing status, powering the billing
// page's "who owes" summary, the months-behind status, the bulk reminder
// action, and missing-invoice detection. Consumed only by /admin/billing.
//
// Response: { statuses: { [agentId]: AgentMonthlyStatus } }
//  - unpaid_monthly_count: number of monthly fee invoices with a balance due
//  - unpaid_monthly_total: sum of amount_due across those invoices
//  - unpaid_monthly_invoice_ids: their invoice IDs (for bulk reminder send)
//  - has_current_month_invoice: whether a monthly invoice exists for the
//    current calendar month (paid or unpaid) - false means the monthly cron
//    likely skipped this agent
//
// "Unpaid" is determined by amount_due > 0 rather than status, so an invoice
// that was zeroed out via mark-invoice-paid drops out of the owed counts even
// if Payload keeps its status as unpaid.
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

    // Current calendar month marker, e.g. "may 2026", matched against the
    // invoice description to detect whether this month has been billed.
    const now = new Date()
    const currentMonthYear =
      `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`.toLowerCase()

    const statuses: Record<string, AgentMonthlyStatus> = {}

    // Fetch invoices for each agent in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 10
    for (let i = 0; i < (users || []).length; i += BATCH_SIZE) {
      const batch = (users || []).slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async u => {
          try {
            // No status filter: we need paid invoices too, so a paid
            // current-month invoice is not falsely flagged as missing.
            const res = await fetch(
              `https://api.payload.com/invoices/?customer_id=${u.payload_payee_id}&limit=50`,
              { headers: { Authorization: authHeader() } }
            )
            if (!res.ok) return null
            const data = await res.json()
            const invoices: any[] = data.values || []

            const monthlyInvoices = invoices.filter(isMonthlyInvoice)

            const unpaidMonthly = monthlyInvoices.filter(
              (inv: any) => Number(inv.amount_due ?? 0) > 0
            )

            const status: AgentMonthlyStatus = {
              unpaid_monthly_count: unpaidMonthly.length,
              unpaid_monthly_total: unpaidMonthly.reduce(
                (sum: number, inv: any) => sum + Number(inv.amount_due ?? 0),
                0
              ),
              unpaid_monthly_invoice_ids: unpaidMonthly.map((inv: any) => inv.id),
              has_current_month_invoice: monthlyInvoices.some(
                (inv: any) =>
                  typeof inv.description === 'string' &&
                  inv.description.toLowerCase().includes(currentMonthYear)
              ),
            }
            return { id: u.id, status }
          } catch {
            return null
          }
        })
      )
      results.forEach(r => {
        if (r) statuses[r.id] = r.status
      })
    }

    return NextResponse.json({ statuses })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
