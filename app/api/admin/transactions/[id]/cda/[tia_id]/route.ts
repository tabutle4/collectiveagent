import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { loadCdaData } from '@/lib/documents/cdaData'

export const dynamic = 'force-dynamic'

const fmt$ = (n: number | null | undefined): string => {
  const v = parseFloat(String(n ?? 0))
  if (isNaN(v)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '--'
  try {
    const ds = d.includes('T') ? d : `${d}T12:00:00`
    return new Date(ds).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return '--' }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tia_id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { id, tia_id } = await params

    const res = await loadCdaData(id, tia_id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    const { model, tia } = res

    // Auth check: admin sees all, agent only sees their own TIA
    const canViewAll = auth.permissions?.has('can_view_all_transactions')
    if (!canViewAll && tia.agent_id !== auth.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Every value below comes from the shared CDA model so the web CDA and
    // the emailed CDA PDF render identical numbers. See lib/documents/cdaData.ts.
    const {
      agentName, agencyName, propertyAddr, role, logoUrl, generatedDate,
      listingSide, buyingSide, btsaTotal, totalGrossCommission,
      officeNet, officeLineLabel, agentNetPay, rebateAmount, rebateLabel,
      priceForDisplay, priceLabel, salesPricePct, externalPayees, extraRows, notes, brokerageLines,
      titleContact, buyerContact, sellerContact, agent, txn, settings,
    } = model

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CDA - ${agentName} - ${propertyAddr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #333; line-height: 1.4; padding: 40px; max-width: 8.5in; margin: 0 auto; background: white; overflow-wrap: break-word; word-break: break-word; }
    @media print { body { padding: 20px; } .no-print { display: none !important; } }
    .save-pdf-button { display: inline-block; padding: 8px 16px; background-color: #C5A278; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; font-family: inherit; }
    .save-pdf-button:hover { background-color: #b39068; }
    .section-title { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #333; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd; font-size: 11px; }
    .row.total { padding: 8px 0; border-top: 2px solid #C5A278; border-bottom: none; margin-top: 4px; font-weight: 600; font-size: 13px; }
    .row.sub { padding-left: 14px; font-size: 10px; color: #777; }
    .label { color: #555; }
    .value { font-weight: 500; color: #333; }
    .accent { color: #C5A278; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .doc-title { font-size: 18px; font-weight: 300; letter-spacing: 2px; color: #333; }
    .pdf-banner { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .meta-box { background: #fafafa; padding: 12px; border-radius: 6px; }
    .meta-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .meta-value { font-weight: 600; font-size: 12px; color: #333; margin-bottom: 2px; }
    .meta-sub { font-size: 10px; color: #666; }
    .section { margin-bottom: 20px; }
    .note-box { background: #f9f7f4; border-left: 3px solid #C5A278; padding: 10px 12px; border-radius: 0 4px 4px 0; font-size: 10px; color: #555; margin-bottom: 20px; }
    .wire-box { background: #f0f8f0; border-left: 3px solid #4a7c59; padding: 10px 12px; border-radius: 0 4px 4px 0; font-size: 10px; color: #2d4a35; margin-top: 20px; }
    @media (max-width: 640px) {
      body { padding: 18px; }
      .doc-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .doc-title { font-size: 14px; letter-spacing: 1px; }
      .pdf-banner { flex-direction: column; align-items: flex-start; }
      .meta-grid, .two-col { grid-template-columns: 1fr; }
      table { font-size: 10px; }
      td, th { padding-left: 2px !important; padding-right: 2px !important; }
    }
  </style>
</head>
<body>
  <div class="no-print pdf-banner" style="margin-bottom: 20px; padding: 12px 16px; background: #f9f7f4; border: 1px solid #e5ddd3; border-radius: 6px;">
    <div>
      <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 2px;">Want a PDF copy?</div>
      <div style="font-size: 11px; color: #666;">Click the button and choose "Save as PDF" in the destination dropdown.</div>
    </div>
    <button class="save-pdf-button" onclick="window.print()">Save as PDF</button>
  </div>

  <div class="doc-header" style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #C5A278;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <img src="${logoUrl}" alt="${agencyName}" style="height: 40px; width: auto;" onerror="this.style.display='none'" />
      <span style="font-size: 13px; font-weight: 500; letter-spacing: 1px; color: #333;">${agencyName.toUpperCase()}</span>
    </div>
    <span class="doc-title">COMMISSION DISBURSEMENT AUTHORIZATION</span>
  </div>

  <div class="two-col">
    <div>
      <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Brokerage</div>
      <div style="font-size:12px;font-weight:600;color:#333;margin-bottom:2px">${agencyName}</div>
      ${brokerageLines.map(l => `<div style="font-size:10px;color:#666">${l}</div>`).join('')}
      ${settings?.brokerage_main_email ? `<div style="font-size:10px;color:#666">${settings.brokerage_main_email}</div>` : ''}
    </div>
    <div>
      <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Property</div>
      <div style="font-size:12px;font-weight:600;color:#333;margin-bottom:2px">${propertyAddr}</div>
      <div style="font-size:10px;color:#666">Closing: ${fmtDate(txn.closing_date || txn.closed_date)}</div>
      <div style="font-size:10px;color:#666">${priceLabel}: ${fmt$(priceForDisplay)}</div>
      <div style="font-size:13px;font-weight:700;color:#333;margin-top:8px">Total Gross Commission: ${fmt$(totalGrossCommission)}</div>
      ${listingSide > 0 ? `<div style="font-size:10px;color:#666;margin-top:3px">Gross Commission: ${fmt$(listingSide + buyingSide)}${salesPricePct ? ' (' + salesPricePct + ')' : ''}</div>` : ''}
      ${btsaTotal > 0 ? `<div style="font-size:10px;color:#666">BTSA: ${fmt$(btsaTotal)}</div>` : ''}
      ${extraRows.map(r => `<div style="font-size:10px;color:#666">Additional Income (${r.label}): ${fmt$(r.amount)}</div>`).join('')}
    </div>
  </div>

  ${buyerContact || sellerContact ? `
  <div style="margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #eee">
    <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">Parties</div>
    ${buyerContact ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #eee"><span style="color:#777">Buyer / Tenant</span><span style="font-weight:500">${buyerContact.name || '--'}</span></div>` : ''}
    ${sellerContact ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#777">Seller / Landlord</span><span style="font-weight:500">${sellerContact.name || '--'}</span></div>` : ''}
  </div>` : ''}

  <div style="margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #eee">
    <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">Agent Information</div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #eee"><span style="color:#777">Agent</span><span style="font-weight:500">${agentName}</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #eee"><span style="color:#777">Role</span><span style="font-weight:500">${role}</span></div>
    ${agent.license_number ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#777">License</span><span style="font-weight:500">${agent.license_number}</span></div>` : ''}
  </div>

  <div style="margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #eee">
    <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">Payees</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="border-bottom:1px solid #ddd">
          <th style="text-align:left;padding:4px 0;color:#777;font-weight:400">Description</th>
          <th style="text-align:left;padding:4px 0;color:#777;font-weight:400">Payee</th>
          <th style="text-align:right;padding:4px 0;color:#777;font-weight:400">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${officeNet > 0 ? `<tr style="border-bottom:1px dotted #eee"><td style="padding:4px 0">${officeLineLabel}</td><td style="padding:4px 0">${agencyName}</td><td style="padding:4px 0;text-align:right">${fmt$(officeNet)}</td></tr>` : ''}
        ${agentNetPay > 0 ? `<tr style="border-bottom:1px dotted #eee"><td style="padding:4px 0">${listingSide > 0 ? 'Listing' : 'Buying'} agent commission</td><td style="padding:4px 0">${agentName}</td><td style="padding:4px 0;text-align:right">${fmt$(agentNetPay)}</td></tr>` : ''}
        ${(externalPayees || []).map((p: { name: string; amount: number }) => `<tr style="border-bottom:1px dotted #eee"><td style="padding:4px 0">External payout</td><td style="padding:4px 0">${p.name}</td><td style="padding:4px 0;text-align:right">${fmt$(p.amount)}</td></tr>`).join('')}
        ${rebateAmount > 0 && rebateLabel ? `<tr style="border-bottom:1px dotted #eee"><td style="padding:4px 0">${rebateLabel}</td><td style="padding:4px 0">${rebateLabel.includes('Buyer') ? (buyerContact?.name || '--') : (sellerContact?.name || '--')}</td><td style="padding:4px 0;text-align:right">(${fmt$(rebateAmount)})</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  ${notes ? `
  <div style="margin-bottom:20px;border-left:3px solid #C5A278;padding:8px 12px">
    <div style="font-weight:600;color:#333;margin-bottom:4px;font-size:11px">Notes</div>
    <p style="font-size:10px;color:#555">${notes}</p>
  </div>` : ''}

  ${titleContact ? `
  <div style="margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #eee">
    <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">Title Company</div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #eee"><span style="color:#777">Company</span><span style="font-weight:500">${titleContact.company || titleContact.name || '--'}</span></div>
    ${titleContact.name && titleContact.company ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #eee"><span style="color:#777">Contact</span><span style="font-weight:500">${titleContact.name}</span></div>` : ''}
    ${titleContact.email ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#777">Email</span><span style="font-weight:500">${Array.isArray(titleContact.email) ? titleContact.email[0]?.value || '--' : titleContact.email}</span></div>` : ''}
  </div>` : ''}

  ${txn.broker_approved_at ? `
  <div style="margin-bottom:20px;padding:10px 12px;border:1px solid #C5A278;border-radius:4px">
    <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px">Broker Approval</div>
    <img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'}/courtney-signature.png" alt="Broker signature" style="height:44px;display:block;margin-bottom:4px" />
    <div style="font-size:10px;color:#666">Courtney Okanlomo, Broker &middot; Approved ${fmtDate(txn.broker_approved_at)}</div>
  </div>` : ''}

  <div style="border-left:3px solid #4a7c59;padding:8px 12px;font-size:10px;color:#2d4a35;margin-bottom:20px">
    <strong>Payment instructions:</strong> Please see provided commission wiring instructions. Make check payable to <strong>${agencyName}</strong> if wiring is not available.
  </div>

  <div style="margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center">
    <p>${agencyName} &middot; Commission Disbursement Authorization generated ${generatedDate}</p>
    <p style="margin-top:4px">Questions? Contact transactions@collectiverealtyco.com</p>
  </div>
</body>
</html>`

            return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'X-PDF-Filename': `${agentName.replace(/\s+/g, '_')}_CDA.pdf`,
      },
    })
  } catch (err: any) {
    console.error('CDA error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
