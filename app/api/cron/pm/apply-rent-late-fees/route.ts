import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase'
import { voidStalePaymentLink } from '@/lib/payload/voidTenantPaymentLink'
import { firstChargeableDay } from '@/lib/pm/lateFeeSchedule'
import { requireCronSecret } from '@/lib/api-auth'

// GET - Apply late fees to overdue rent invoices
// Runs daily via Vercel cron
// Schedule: 0 11 * * * (6:00 AM CT / 11:00 AM UTC)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const supabase = createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Texas Property Code §92.019 caps what a lease may charge: 12% of rent for
    // 1-4 units, 10% for 5+. That is a ceiling on what the lease can provide
    // for, not an amount that may be charged regardless of what the lease says.
    // This job used to charge that ceiling outright on the first eligible day,
    // which ignored late_fee_initial and late_fee_daily entirely and billed
    // every tenant the maximum from day one. The lease governs; the cap only
    // trims the result.
    //
    // The grace period now comes from the lease as well. It was hardcoded to 3
    // here while the warning email read late_fee_grace_days off the lease, so
    // on any lease not set to 2 the warning went out on the wrong day.
    const DEFAULT_CAP_PCT = 12

    // Unpaid invoices whose due date has passed. late_fee_applied_at is no
    // longer a filter: a daily fee has to be recalculated each day it grows,
    // and excluding rows that already carry a fee froze it at its first value.
    // The column is still stamped on first application, because the warning
    // email uses it to tell "fee not yet charged" from "fee charged".
    //
    // Batched through fetchAllRows because dropping that filter widened this to
    // every unpaid past-due invoice, and a plain select stops silently at the
    // 1000th row with no ordering to say which thousand. yesterday rather than
    // today because the helper has no 'lt'; on a date column the two are the
    // same set.
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const invoices = await fetchAllRows<any>(
      'tenant_invoices',
      `
        id, rent_amount, late_fee, total_amount, due_date, lease_id, late_fee_applied_at,
        payload_payment_link_id, payload_payment_link_url, payload_invoice_id,
        pm_leases(
          id, monthly_rent, late_fee_cap_pct, late_fee_grace_days,
          late_fee_initial, late_fee_daily, late_fee_max_days
        )
      `,
      {
        filters: [
          { type: 'in', column: 'status', value: ['pending', 'sent', 'overdue'] },
          { type: 'lte', column: 'due_date', value: yesterdayStr },
        ],
      },
      supabase
    )

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices eligible for late fees',
        applied: 0,
      })
    }

    let applied = 0
    let skipped = 0
    // Counted separately from errors: these invoices had their fee applied
    // correctly but still have a live link at the old amount, so they read as
    // successes in `applied` and need someone to look at them by hand.
    let staleLinks = 0
    const errors: string[] = []

    for (const invoice of invoices) {
      try {
        const lease = invoice.pm_leases as any

        // No lease, or a lease that never configured an initial late fee, means
        // there is no fee to charge. Reading the cap alone was what allowed a
        // lease with no fee terms to be billed the statutory maximum.
        if (!lease || !lease.late_fee_initial) {
          skipped++
          continue
        }

        // When the fee lands comes from the shared helper, which also applies
        // the statutory grace floor. The warning email calls the same function,
        // so the day it names and the day this job charges cannot drift.
        const firstDay = firstChargeableDay(invoice.due_date, lease)

        // Still inside the grace period.
        if (today.getTime() < firstDay.getTime()) {
          skipped++
          continue
        }

        // Days of daily accrual on top of the initial fee. Zero on the first
        // chargeable day, so that day charges the initial amount and nothing
        // more. late_fee_max_days stops the accrual where the lease says it
        // stops, independently of the statutory cap.
        const MS_PER_DAY = 24 * 60 * 60 * 1000
        let accrualDays = Math.floor(
          (today.getTime() - firstDay.getTime()) / MS_PER_DAY
        )
        if (lease.late_fee_max_days != null) {
          accrualDays = Math.min(accrualDays, Number(lease.late_fee_max_days))
        }

        const initial = Number(lease.late_fee_initial) || 0
        const daily = Number(lease.late_fee_daily) || 0
        const capPct = lease.late_fee_cap_pct ?? DEFAULT_CAP_PCT
        const cap = (Number(lease.monthly_rent) || 0) * (capPct / 100)
        const lateFee = Math.round(
          Math.min(initial + daily * accrualDays, cap) * 100
        ) / 100

        // Nothing changed today, so do not touch the row. Without this the job
        // would rewrite every overdue invoice every morning once the fee has
        // reached its cap, and updated_at would churn for no reason.
        if (Math.abs(lateFee - (Number(invoice.late_fee) || 0)) < 0.005) {
          skipped++
          continue
        }

        // Update invoice with late fee. Everything on the invoice that is not
        // rent or the late fee (other charges, deposit) is preserved by
        // subtracting the old rent and old fee out of the old total.
        const { error: updateError } = await supabase
          .from('tenant_invoices')
          .update({
            late_fee: lateFee,
            total_amount: invoice.rent_amount + lateFee + (invoice.total_amount - invoice.rent_amount - (invoice.late_fee || 0)),
            // Stamped once, on first application, and left alone afterwards so
            // it keeps meaning "the day the fee first landed".
            late_fee_applied_at: invoice.late_fee_applied_at || new Date().toISOString(),
            status: 'overdue',
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoice.id)

        // The amount just moved, so any outstanding payment link is now stale.
        // Void it here rather than leaving it live: the link collects the old
        // figure and the payment webhook closes the invoice at whatever arrives,
        // so a tenant paying in good faith would come up short and the invoice
        // would read paid. Clearing the ids makes the next Send, or the tenant's
        // own portal visit, mint a fresh link at the current total. Deliberately
        // after the fee is written -- if Payload is down the ledger is still
        // right and the link stays put, which keeps the mismatch visible.
        if (!updateError && invoice.payload_payment_link_url) {
          const voided = await voidStalePaymentLink(invoice)
          if (!voided) {
            staleLinks++
            errors.push(
              `Invoice ${invoice.id}: fee updated but the stale payment link could not be voided - it is still collecting the old amount`
            )
          }
        }

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

    console.log(`PM late fees: ${applied} applied, ${skipped} skipped, ${staleLinks} stale links not voided, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      applied,
      skipped,
      stale_links_not_voided: staleLinks,
      total_checked: invoices.length,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('PM apply late fees cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
