import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { pmLateFeeWarningEmail } from '@/lib/email/pm-layout'

// GET /api/cron/pm/send-late-fee-warnings
//
// Runs daily. Finds unpaid tenant invoices where today is exactly one day
// before the late fee applies, then emails each tenant a warning.
//
// Late fee applies after: due_date + late_fee_grace_days (from lease).
// Warning sent when: today === due_date + late_fee_grace_days - 1
//
// Schedule: 0 12 * * * (7:00 AM CT / 12:00 PM UTC)
// Runs after the late fee cron (0 11 * * *) so there is no overlap.
//
// Safety checks:
// - Skip if invoice is paid
// - Skip if late_fee_applied_at is already set (fee already charged)
// - Skip if lease has no late_fee_initial configured
// - Skip if no payment link exists (nothing to pay via)

const FROM_UPN = 'tarab@collectiverealtyco.com'
const BCC_OFFICE = 'office@collectiverealtyco.com'
const REPLY_TO = 'pm@collectiverealtyco.com'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find unpaid invoices where today is the warning day.
    // We load all unpaid invoices with their lease late fee settings,
    // then filter in code because the grace period varies per lease.
    const { data: invoices, error: fetchError } = await supabaseAdmin
      .from('tenant_invoices')
      .select(`
        id, due_date, rent_amount, total_amount, status,
        payload_payment_link_url, late_fee_applied_at,
        period_month, period_year,
        tenants(id, first_name, last_name, email),
        managed_properties(id, property_address, city),
        pm_leases(
          id, late_fee_grace_days, late_fee_initial, late_fee_daily,
          late_fee_max_days, late_fee_cap_pct, monthly_rent
        )
      `)
      .in('status', ['pending', 'sent', 'overdue'])
      .is('late_fee_applied_at', null)

    if (fetchError) throw fetchError

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No invoices to check' })
    }

    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const invoice of invoices) {
      try {
        const lease = invoice.pm_leases as any
        const tenant = invoice.tenants as any
        const property = invoice.managed_properties as any

        // Skip if no lease or no late fee configured
        if (!lease || !lease.late_fee_initial) {
          skipped++
          continue
        }

        // Skip if no payment link (tenant has no way to pay online)
        if (!invoice.payload_payment_link_url) {
          skipped++
          continue
        }

        // Skip if no tenant email
        if (!tenant?.email) {
          skipped++
          continue
        }

        // Calculate the day the late fee applies:
        // late fee applies after grace period from due date
        const graceDays = lease.late_fee_grace_days ?? 2
        const dueDate = new Date(`${invoice.due_date}T12:00:00`)
        const lateFeeDate = new Date(dueDate)
        lateFeeDate.setDate(lateFeeDate.getDate() + graceDays + 1)
        lateFeeDate.setHours(0, 0, 0, 0)

        // Warning day = the day before late fee applies
        const warningDate = new Date(lateFeeDate)
        warningDate.setDate(warningDate.getDate() - 1)

        // Only send if today is exactly the warning day
        if (today.getTime() !== warningDate.getTime()) {
          skipped++
          continue
        }

        // Calculate late fee cap based on lease settings
        // late_fee_cap_pct is already stored on the lease (set at creation based on unit count)
        const capPct = lease.late_fee_cap_pct ?? 12
        const lateFeeCap = lease.monthly_rent * (capPct / 100)

        const propertyAddr = property
          ? `${property.property_address}, ${property.city}`
          : 'your rental property'
        const dueDateFormatted = dueDate.toLocaleDateString(
          'en-US', { month: 'long', day: 'numeric', year: 'numeric' }
        )

        const html = pmLateFeeWarningEmail(
          tenant.first_name,
          propertyAddr,
          Number(invoice.rent_amount),
          Number(lease.late_fee_initial),
          lease.late_fee_daily ? Number(lease.late_fee_daily) : null,
          Math.round(lateFeeCap * 100) / 100,
          dueDateFormatted,
          invoice.payload_payment_link_url
        )

        await sendMailAs({
          fromUpn: FROM_UPN,
          to: tenant.email,
          bcc: BCC_OFFICE,
          replyTo: REPLY_TO,
          subject: `Late Fee Notice - Pay by Tomorrow to Avoid Late Fee`,
          html,
        })

        sent++
        console.log(`Late fee warning sent to ${tenant.email} for invoice ${invoice.id}`)
      } catch (err: any) {
        errors.push(`Invoice ${invoice.id}: ${err.message}`)
        console.error(`Late fee warning error for invoice ${invoice.id}:`, err)
      }
    }

    console.log(`PM late fee warnings: ${sent} sent, ${skipped} skipped, ${errors.length} errors`)
    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total_checked: invoices.length,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('PM send late fee warnings cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
