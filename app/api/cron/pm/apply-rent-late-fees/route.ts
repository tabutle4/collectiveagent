import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Apply late fees to overdue rent invoices
// Runs daily via Vercel cron
// Schedule: 0 11 * * * (6:00 AM CT / 11:00 AM UTC)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Texas Property Code §92.019:
    // - Cannot charge until rent is 2+ full days late
    // - If due on the 1st, can charge on the 4th (3 days after due date)
    // - Max: 12% for 1-4 units, 10% for 5+ units
    const graceDays = 3

    // Calculate the cutoff date (invoices due before this date are eligible for late fees)
    const cutoffDate = new Date(today)
    cutoffDate.setDate(cutoffDate.getDate() - graceDays)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

    // Find unpaid invoices past grace period without late fee applied
    const { data: invoices, error: fetchError } = await supabase
      .from('tenant_invoices')
      .select(`
        id, rent_amount, late_fee, total_amount, due_date, lease_id,
        pm_leases(id, monthly_rent, late_fee_cap_pct)
      `)
      .in('status', ['pending', 'sent', 'overdue'])
      .is('late_fee_applied_at', null)
      .lt('due_date', cutoffDateStr)

    if (fetchError) throw fetchError

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices eligible for late fees',
        applied: 0,
      })
    }

    let applied = 0
    let skipped = 0
    const errors: string[] = []

    for (const invoice of invoices) {
      try {
        const lease = invoice.pm_leases as any

        // Skip if no lease or no late fee configured in lease
        if (!lease || !lease.late_fee_cap_pct) {
          skipped++
          continue
        }

        // Calculate late fee based on legal cap percentage
        const lateFee = lease.monthly_rent * (lease.late_fee_cap_pct / 100)

        // Update invoice with late fee
        const { error: updateError } = await supabase
          .from('tenant_invoices')
          .update({
            late_fee: lateFee,
            total_amount: invoice.rent_amount + lateFee + (invoice.total_amount - invoice.rent_amount - (invoice.late_fee || 0)),
            late_fee_applied_at: new Date().toISOString(),
            status: 'overdue',
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoice.id)

        if (updateError) {
          errors.push(`Invoice ${invoice.id}: ${updateError.message}`)
        } else {
          applied++
          console.log(`Late fee $${lateFee} applied to invoice ${invoice.id}`)
        }
      } catch (err: any) {
        errors.push(`Invoice ${invoice.id}: ${err.message}`)
      }
    }

    console.log(`PM late fees: ${applied} applied, ${skipped} skipped, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      applied,
      skipped,
      total_checked: invoices.length,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('PM apply late fees cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
