import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

// GET /api/pm/statements/[id]?format=html|json
//
// Returns the statement either as HTML (default, for portal/browser
// rendering) or JSON (for admin editing tools).
//
// HTML format uses the exact same visual style as commission statements
// (gold accent, two-column meta grid, dotted dividers) for brand
// consistency. Includes a "Save as PDF" button that calls window.print()
// + a @media print CSS rule that hides nav/buttons in the saved file.
//
// Auth: Hybrid.
//   - Admin can view any statement (via requireAuth + users table).
//   - Landlord can view only their own statement (via pm_sessions table,
//     same auth used by the rest of the landlord portal).
//   - 401 if neither auth path produces a match.

// Validate PM portal session (same logic as /api/pm/portal/* routes).
// Returns the session row if valid, null otherwise.
async function validatePMSession(): Promise<any | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('pm_session')?.value
    if (!token) return null

    const { data: session } = await supabaseAdmin
      .from('pm_sessions')
      .select('*')
      .eq('session_token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    return session || null
  } catch {
    return null
  }
}

const fmt$ = (n: number | null | undefined): string => {
  if (n == null) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n))
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '--'
  const ds = d.includes('T') ? d : `${d}T12:00:00`
  return new Date(ds).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const monthName = (m: number | null): string =>
  m ? new Date(2000, m - 1).toLocaleString('default', { month: 'long' }) : ''

const periodLabel = (s: any): string => {
  if (s.period_type === 'annual') return `${s.period_year}`
  return `${monthName(s.period_month)} ${s.period_year}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'html'

    // Load the statement + related data first so we can match against
    // both possible auth paths.
    const { data: statement, error: stErr } = await supabaseAdmin
      .from('pm_statements')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, unit, city, state, zip)
      `)
      .eq('id', id)
      .single()

    if (stErr || !statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    }

    // ----- Hybrid auth: three paths -----
    // Path 1: Admin session
    const adminAuth = await requireAuth(request)
    const isPmAdmin =
      !adminAuth.error && adminAuth.permissions?.has('can_manage_pm')

    if (!isPmAdmin) {
      // Path 2: URL access token (for emailed statement links - no login required)
      const urlToken = searchParams.get('token')
      const tokenValid = urlToken && statement.access_token && urlToken === statement.access_token

      if (!tokenValid) {
        // Path 3: Landlord pm_session cookie
        const pmSession = await validatePMSession()
        const isLandlordOwner =
          pmSession &&
          pmSession.user_type === 'landlord' &&
          pmSession.user_id === statement.landlord_id

        if (!isLandlordOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    if (format === 'json') {
      return NextResponse.json({ statement })
    }

    // ----- Fetch disbursement detail for HTML render -----
    // Get all disbursements for this landlord/property/period so we can
    // show deduction line items by name and separate pending deposit returns.
    const disbPeriodFilter = statement.period_type === 'monthly'
      ? { month: statement.period_month, year: statement.period_year }
      : { year: statement.period_year }

    let disbDetailQuery = supabaseAdmin
      .from('landlord_disbursements')
      .select(`
        id,
        gross_rent,
        management_fee,
        other_deductions,
        other_deductions_description,
        deposit_amount,
        net_amount,
        payment_status,
        period_month,
        period_year,
        landlord_disbursement_deductions(id, label, description, amount, sort_order)
      `)
      .eq('landlord_id', statement.landlord_id)
      .eq('property_id', statement.property_id)
      .in('payment_status', ['completed', 'paid', 'pending', 'processing'])

    if (statement.period_type === 'monthly') {
      disbDetailQuery = disbDetailQuery
        .eq('period_month', statement.period_month)
        .eq('period_year', statement.period_year)
    } else {
      disbDetailQuery = disbDetailQuery.eq('period_year', statement.period_year)
    }

    const { data: disbDetail } = await disbDetailQuery

    // Build deduction line items list for display
    const deductionLines: { label: string; amount: number }[] = []
    for (const d of (disbDetail || [])) {
      if (d.gross_rent === 0) continue // skip deposit-type disbursements
      // Named line-item deductions
      for (const ded of ((d.landlord_disbursement_deductions as any[]) || []).sort(
        (a: any, b: any) => a.sort_order - b.sort_order
      )) {
        deductionLines.push({ label: ded.label, amount: Number(ded.amount) })
      }
      // Legacy other_deductions single-field
      if (Number(d.other_deductions) > 0) {
        deductionLines.push({
          label: d.other_deductions_description || 'Other deductions',
          amount: Number(d.other_deductions),
        })
      }
    }

    // Pending deposit returns: deposit disbursements that are pending/processing
    const pendingDepositReturn = (disbDetail || [])
      .filter((d: any) => d.deposit_amount > 0 && ['pending', 'processing'].includes(d.payment_status))
      .reduce((sum: number, d: any) => sum + Number(d.deposit_amount), 0)

    // Held in trust: subtract pending deposit returns so the displayed
    // balance reflects what's actually committed as in-trust cash,
    // not money that's already queued for payout.
    const displayedHeldInTrust = Math.max(0,
      Number(statement.held_in_trust_at_statement_date) - pendingDepositReturn
    )

    // ----- Render HTML -----
    const landlord = statement.landlords
    const property = statement.managed_properties
    const propertyAddr = property
      ? `${property.property_address}${property.unit ? ` ${property.unit}` : ''}`
      : '--'
    const propertyCityStateZip = property
      ? `${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim()
      : ''

    const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'}/logo.png`

    const data = {
      landlord_name: `${landlord?.first_name || ''} ${landlord?.last_name || ''}`.trim(),
      landlord_email: landlord?.email || '',
      property_address: propertyAddr,
      property_city_state_zip: propertyCityStateZip,
      period_label: periodLabel(statement),
      statement_date: fmtDate(statement.statement_date),
      total_rent_collected: fmt$(statement.total_rent_collected),
      total_management_fees: fmt$(statement.total_management_fees),
      total_deductions: fmt$(statement.total_deductions),
      deduction_lines: deductionLines,
      total_deposits_in: fmt$(statement.total_deposits_in),
      total_deposits_returned_to_landlord: fmt$(statement.total_deposits_returned_to_landlord),
      total_deposits_refunded_to_tenant: fmt$(statement.total_deposits_refunded_to_tenant),
      pending_deposit_return: pendingDepositReturn,
      total_net_disbursed: fmt$(statement.total_net_disbursed),
      total_net_pending: fmt$(statement.total_net_pending ?? 0),
      has_pending: Number(statement.total_net_pending ?? 0) > 0,
      held_in_trust: fmt$(displayedHeldInTrust),
      notes: statement.notes || '',
      sent_at: statement.sent_at ? fmtDate(statement.sent_at) : null,
      generated_date: fmtDate(statement.created_at?.split('T')[0] || statement.statement_date),
      logo_url: logoUrl,
    }

    const html = generateStatementHTML(data)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'X-PDF-Filename': `${(data.landlord_name || 'landlord').replace(/\s+/g, '_')}_${data.period_label.replace(/\s+/g, '_')}_STATEMENT.pdf`,
      },
    })
  } catch (err: any) {
    console.error('Statement detail error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function generateStatementHTML(data: Record<string, any>): string {
  // Save-as-PDF button uses window.print() + @media print CSS to hide
  // the controls bar so the saved PDF is clean.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PM Statement - ${data.landlord_name} - ${data.period_label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      color: #333;
      line-height: 1.4;
      padding: 40px;
      max-width: 8.5in;
      margin: 0 auto;
      background: white;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
    }
    .save-pdf-button {
      display: inline-block;
      padding: 8px 16px;
      background-color: #C5A278;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    .save-pdf-button:hover {
      background-color: #b39068;
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; padding: 12px 16px; background: #f9f7f4; border: 1px solid #e5ddd3; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 2px;">Want a PDF copy?</div>
      <div style="font-size: 11px; color: #666;">Click the button to open the print dialog. Choose "Save as PDF" in the destination dropdown.</div>
    </div>
    <button class="save-pdf-button" onclick="window.print()">Save as PDF</button>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #C5A278;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <img src="${data.logo_url}" alt="Collective Realty Co." style="height: 40px; width: auto;" />
      <span style="font-size: 13px; font-weight: 500; letter-spacing: 1px; color: #333;">COLLECTIVE REALTY CO.</span>
    </div>
    <span style="font-size: 18px; font-weight: 300; letter-spacing: 2px; color: #333;">PROPERTY MANAGEMENT STATEMENT</span>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <div style="background: #fafafa; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Prepared for</span>
        <span style="font-weight: 500; color: #333;">${data.landlord_name}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Property</span>
        <span style="font-weight: 500; color: #333; text-align: right;">${data.property_address}</span>
      </div>
      ${data.property_city_state_zip ? `
      <div style="display: flex; justify-content: flex-end; padding: 3px 0; font-size: 10px;">
        <span style="color: #666;">${data.property_city_state_zip}</span>
      </div>` : ''}
    </div>
    <div style="background: #fafafa; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Statement Period</span>
        <span style="font-weight: 500; color: #333;">${data.period_label}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Statement Date</span>
        <span style="font-weight: 500; color: #333;">${data.statement_date}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Generated</span>
        <span style="font-weight: 500; color: #333;">${data.generated_date}</span>
      </div>
    </div>
  </div>

  <!-- Income & Expenses section -->
  <div style="margin-bottom: 20px;">
    <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #333;">Income & Expenses</div>
    <div style="font-size: 11px; color: #333;">
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Rent Collected</span>
        <span style="font-weight: 500;">${data.total_rent_collected}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Management Fees <span style="color: #999; font-size: 9px; margin-left: 6px;">retained by CRC</span></span>
        <span style="font-weight: 500;">- ${data.total_management_fees}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Deductions <span style="color: #999; font-size: 9px; margin-left: 6px;">repairs, HOA, etc.</span></span>
        <span style="font-weight: 500;">- ${data.total_deductions}</span>
      </div>
      ${(data.deduction_lines as any[]).length > 0 ? (data.deduction_lines as any[]).map((d: any) => `
      <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; border-bottom: 1px dotted #eee; color: #666;">
        <span style="font-size: 10px;">${d.label}</span>
        <span style="font-size: 10px;">- ${fmt$(d.amount)}</span>
      </div>`).join('') : ''}
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #ccc; margin-top: 4px; padding-top: 8px;">
        <span style="font-weight: 600;">Net Disbursed to You</span>
        <span style="font-weight: 600; color: #C5A278;">${data.total_net_disbursed}</span>
      </div>
      ${data.has_pending ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; background: #f9f7f4; border-radius: 4px; padding: 6px 8px; margin-top: 6px;">
        <span style="color: #8a7a60; font-size: 10px;">Pending disbursement (in progress)</span>
        <span style="font-weight: 600; color: #8a7a60;">${data.total_net_pending}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- Security Deposit Activity section -->
  <div style="margin-bottom: 20px;">
    <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #333;">Security Deposit Activity</div>
    <div style="font-size: 11px; color: #333;">
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Deposits Received <span style="color: #999; font-size: 9px; margin-left: 6px;">from tenants</span></span>
        <span style="font-weight: 500;">${data.total_deposits_in}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Returned to Landlord <span style="color: #999; font-size: 9px; margin-left: 6px;">paid</span></span>
        <span style="font-weight: 500;">- ${data.total_deposits_returned_to_landlord}</span>
      </div>
      ${data.pending_deposit_return > 0 ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd; background: #f9f7f4; border-radius: 4px; padding: 6px 8px; margin: 2px 0;">
        <span style="color: #8a7a60;">Pending Return to Landlord <span style="font-size: 9px; margin-left: 6px;">in progress</span></span>
        <span style="font-weight: 600; color: #8a7a60;">- ${fmt$(data.pending_deposit_return)}</span>
      </div>` : ''}
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Refunded to Tenant <span style="color: #999; font-size: 9px; margin-left: 6px;">move-out refunds</span></span>
        <span style="font-weight: 500;">- ${data.total_deposits_refunded_to_tenant}</span>
      </div>
    </div>
  </div>

  <!-- Held in Trust callout -->
  <div style="background: #f9f7f4; border: 2px solid #C5A278; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #8a7a60; margin-bottom: 4px;">Held in Trust</div>
        <div style="font-size: 9px; color: #888;">As of ${data.statement_date}</div>
      </div>
      <div style="font-size: 22px; font-weight: 600; color: #333;">${data.held_in_trust}</div>
    </div>
  </div>

  ${data.notes ? `
  <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 10px; color: #555; border-left: 3px solid #C5A278; margin-bottom: 20px;">
    <div style="font-weight: 500; color: #333; margin-bottom: 4px;">Notes</div>
    <p>${data.notes}</p>
  </div>` : ''}

  <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center;">
    <p>Collective Realty Co. · CRC Property Management · Statement generated ${data.generated_date}</p>
    <p style="margin-top: 4px;">Questions? Contact pm@collectiverealtyco.com · (281) 638-9407</p>
    ${data.sent_at ? `<p style="margin-top: 4px;">Sent ${data.sent_at}</p>` : ''}
  </div>
</body>
</html>`
}

// DELETE /api/pm/statements/[id]
// Deletes a statement so it can be regenerated. Only allowed if the
// statement has NOT been sent (sent_at is null). Regenerating a sent
// statement requires explicit confirmation on the client side.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    const { data: statement, error: fetchErr } = await supabaseAdmin
      .from('pm_statements')
      .select('id, sent_at, landlord_id, property_id, period_type, period_month, period_year')
      .eq('id', id)
      .single()

    if (fetchErr || !statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    }

    if (statement.sent_at && !force) {
      return NextResponse.json(
        { error: 'Statement has already been sent. Pass force=true to regenerate anyway.' },
        { status: 409 }
      )
    }

    const { error: delErr } = await supabaseAdmin
      .from('pm_statements')
      .delete()
      .eq('id', id)

    if (delErr) throw delErr

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Statement delete error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
