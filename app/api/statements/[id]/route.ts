import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { computeCommission } from '@/lib/transactions/math'
import { AGENT_ROLE_OPTIONS } from '@/lib/transactions/constants'

const formatRole = (role: string | null | undefined): string => {
  if (!role) return 'Agent'
  const match = AGENT_ROLE_OPTIONS.find(o => o.value === role)
  return match ? match.label : role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
  // Date-only values parse as midnight UTC, a day early in Central. Pin to noon.
  return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatType = (type: string | null): string => {
  if (!type) return '--'
  const typeMap: Record<string, string> = {
    'buyer_v2': 'Buyer',
    'seller_v2': 'Seller',
    'tenant_apt_v2': 'Tenant',
    'tenant_other_v2': 'Tenant',
    'landlord_v2': 'Landlord',
    'new_construction_buyer_v2': 'Buyer (New Construction)',
  }
  return typeMap[type] || type.replace(/_v2$/, '').replace(/_/g, ' ')
}

const isCapPlan = (plan: string | null): boolean => {
  if (!plan) return false
  const lower = plan.toLowerCase()
  // Cap Plan or Custom cap plans (but not No Cap plans)
  return (lower.includes('cap') && !lower.includes('no cap')) ||
         (lower.startsWith('custom') && lower.includes('cap') && !lower.includes('no cap'))
}

const isNewAgentPlan = (plan: string | null): boolean => {
  if (!plan) return false
  return plan.toLowerCase().includes('new agent')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Allow admins OR agents viewing their own statement
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { id: internalAgentId } = await params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'html'

    // NOTE: transaction_internal_agents has two foreign keys to users
    // (agent_id and referred_agent_id), so the users embed must name the
    // agent_id key explicitly. Without the hint PostgREST reports an ambiguous
    // relationship, which surfaced to the browser as "Record not found".
    const { data: tia, error: tiaError } = await supabase
      .from('transaction_internal_agents')
      .select(`
        *,
        transaction:transactions(*),
        agent:users!agent_id(
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          commission_plan, office, qualifying_transaction_count, qualifying_transaction_target
        )
      `)
      .eq('id', internalAgentId)
      .single()

    if (tiaError || !tia) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Check permission: admin can view all, agents can only view their own
    const canViewAll = auth.permissions.has('can_view_all_transactions')
    const isOwnStatement = tia.agent_id === auth.user.id
    if (!canViewAll && !isOwnStatement) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const txn = tia.transaction
    const agent = tia.agent

    // A statement must reflect ALL of this agent's commission on the deal, not
    // just the card that was clicked. The additional-comp flow creates extra
    // co_agent rows (same agent_id) that carry only agent_net + 1099. Gather
    // every row for this agent on the transaction, anchor the breakdown on the
    // primary row, and total the money across rows.
    const ROLE_PRIORITY: Record<string, number> = {
      primary_agent: 0, listing_agent: 1, co_agent: 2,
    }
    const PRODUCING_ROLES = ['primary_agent', 'listing_agent', 'co_agent']
    const { data: allTxnRowsRaw } = await supabase
      .from('transaction_internal_agents')
      .select('*')
      .eq('transaction_id', tia.transaction_id)
    const allTxnRows = (allTxnRowsRaw && allTxnRowsRaw.length > 0) ? allTxnRowsRaw : [tia]
    const agentRows = allTxnRows.filter(r => r.agent_id === tia.agent_id)
    const primaryRow = [...agentRows].sort(
      (a, b) => (ROLE_PRIORITY[a.agent_role] ?? 9) - (ROLE_PRIORITY[b.agent_role] ?? 9)
    )[0]
    // Rows other than the anchor contribute their 1099/net as add-ons.
    const extraRows = agentRows.filter(r => r.id !== primaryRow.id)
    const allTiaIds = agentRows.map(r => r.id)
    // Is this agent the only producing agent on the deal? Only then can the
    // brokerage line be reconciled as office side minus this agent's payout
    // without stealing another agent's share.
    const otherProducingAgentIds = new Set(
      allTxnRows
        .filter(r => PRODUCING_ROLES.includes(r.agent_role) && r.agent_id !== tia.agent_id)
        .map(r => r.agent_id)
    )
    const isSoleProducingAgent = otherProducingAgentIds.size === 0

    // Base the commission breakdown on the primary row so a second-check
    // co_agent row never drives the layout or the displayed role.
    const baseTia = primaryRow
    const plan = baseTia.commission_plan || agent?.commission_plan || '--'
    const roleLabel = formatRole(baseTia.agent_role)

    const currentYear = new Date().getFullYear()

    // Calculate YTD cap progress from TIA
    const { data: capData } = await supabase
      .from('transaction_internal_agents')
      .select('brokerage_split, transactions!inner(status, closing_date)')
      .eq('agent_id', tia.agent_id)
      // Cap rule: only primary/listing agent rows count toward the cap.
      .in('agent_role', ['primary_agent', 'listing_agent'])
      .eq('counts_toward_progress', true)
      .eq('transactions.status', 'closed')
      .gte('transactions.closing_date', `${currentYear}-01-01`)
    
    const calculatedCapProgress = (capData || []).reduce(
      (sum, r) => sum + parseFloat(r.brokerage_split || 0), 0
    )

    const { data: appliedDebts } = await supabase
      .from('agent_debts')
      .select('debt_type, description, amount_paid, date_incurred')
      .in('offset_transaction_agent_id', allTiaIds)

    // Co-op paid to outside brokerages. office_gross includes both sides, so
    // CRC's actual side is office_gross minus this.
    const { data: externalBrokeragesStmt } = await supabase
      .from('transaction_external_brokerages')
      .select('amount_1099_reportable')
      .eq('transaction_id', tia.transaction_id)
    const externalTotal = (externalBrokeragesStmt || []).reduce(
      (s, e) => s + parseFloat(e.amount_1099_reportable || 0), 0
    )

    // Additional income folded into CRC's side. Shown as its own input to the
    // compensation basis (base + additional = basis), matching how the deal is
    // actually built.
    const { data: additionalIncomeStmt } = await supabase
      .from('transaction_additional_income')
      .select('amount')
      .eq('transaction_id', tia.transaction_id)
    const additionalIncomeTotal = (additionalIncomeStmt || []).reduce(
      (s, a) => s + parseFloat(a.amount || 0), 0
    )

    // Per-row 1099 helper. Prefer the stored reportable amount; fall back to
    // the canonical formula only when it is missing.
    const rowAmount1099 = (r: any): number => {
      // Match the original `stored || fallback` behavior: a non-zero stored
      // amount wins, otherwise compute from the canonical formula.
      const stored = parseFloat(r.amount_1099_reportable)
      if (stored) return stored
      return computeCommission({
        agent_gross: r.agent_gross,
        btsa_amount: r.btsa_amount,
        processing_fee: r.processing_fee,
        coaching_fee: r.coaching_fee,
        other_fees: r.other_fees,
        rebate_amount: r.rebate_amount,
        credits_applied: 0,
        debts_deducted: 0,
      }).amount_1099
    }

    // Breakdown values come from the primary row.
    const agentGross = parseFloat(baseTia.agent_gross || 0)
    const processingFee = parseFloat(baseTia.processing_fee || 0)
    const coachingFee = parseFloat(baseTia.coaching_fee || 0)
    const otherFees = parseFloat(baseTia.other_fees || 0)
    const totalFees = processingFee + coachingFee + otherFees
    // Additional-comp rows (extra checks to the same agent) add their own 1099
    // and net on top of the primary row.
    const extraComp1099 = extraRows.reduce((s, r) => s + rowAmount1099(r), 0)
    // Per-row disbursement to the agent: base rows carry agent_gross; extra
    // co_agent rows carry agent_net (no gross). Used for the commission split.
    const rowAgentDisburse = (r: any): number => {
      const g = parseFloat(r.agent_gross || 0)
      return g > 0 ? g : parseFloat(r.agent_net || 0)
    }
    const extraAgentAmount = extraRows.reduce((s, r) => s + rowAgentDisburse(r), 0)
    const agentDisburseTotal = agentGross + extraAgentAmount
    // Totals reflect every row for this agent on the deal.
    const amount1099 = agentRows.reduce((s, r) => s + rowAmount1099(r), 0)
    // Amount withheld = what was actually applied against this agent's cards on
    // the deal. Use the applied debt records so a withholding shows even when
    // the TIA debts_deducted column has not been stamped.
    const debtsDeducted = (appliedDebts || []).reduce(
      (s, d) => s + parseFloat(d.amount_paid || 0), 0
    )
    const agentBasis = parseFloat(baseTia.agent_basis || 0)
    const splitPct = parseFloat(baseTia.split_percentage || 0)
    const brokerageSplitPct = 100 - splitPct

    const showCapProgress = isCapPlan(plan)
    const showNewAgentProgress = isNewAgentPlan(plan)
    const capProgress = calculatedCapProgress
    const capAmount = 18000
    const qualifyingCount = agent?.qualifying_transaction_count || 0
    const qualifyingTarget = agent?.qualifying_transaction_target ?? 5

    const agentName = agent
      ? `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
      : '--'

    const grossCommission = parseFloat(txn?.gross_commission || baseTia.agent_basis || 0)
    const officeGross = parseFloat(txn?.office_gross || 0)
    // CRC's actual side commission: office side minus the co-op paid to outside
    // brokerages. This is what gets split between the agent and the brokerage.
    const crcSide = Math.max(0, Math.round((officeGross - externalTotal) * 100) / 100)
    const btsaAmount = parseFloat(baseTia.btsa_amount || 0)
    // Commission percent: use the sale price, or the monthly rent for leases,
    // as the basis. Always compute when a basis is available (was showing 0%
    // whenever sales_price was blank, e.g. on leases).
    const commissionBasisForPct = parseFloat(txn?.sales_price || 0) || parseFloat(txn?.monthly_rent || 0)
    const commissionPct = commissionBasisForPct > 0
      ? ((grossCommission / commissionBasisForPct) * 100).toFixed(2)
      : '0'
    // Brokerage's cut for the commission-calculation section. When this agent
    // is the only producing agent on the deal, derive it as CRC's side minus
    // the agent's full payout so the section reconciles (Split + Additional +
    // Brokerage = CRC side). With multiple producing agents the side also covers
    // the others, so fall back to this row's stored brokerage_split.
    const brokerageSplit = isSoleProducingAgent
      ? Math.max(0, Math.round((crcSide - agentDisburseTotal) * 100) / 100)
      : parseFloat(baseTia.brokerage_split || 0)
    // Brokermint-style basis: base commission plus additional income equals the
    // compensation basis that the split is calculated on. Base is the side less
    // the additional that was folded into it.
    const baseCommission = Math.max(0, Math.round((crcSide - additionalIncomeTotal) * 100) / 100)
    // Effective split percentages derived from the actual dollars, so the label
    // is always truthful even if an additional was entered at an off-plan rate.
    const agentSplitPct = crcSide > 0
      ? (agentDisburseTotal / crcSide * 100).toFixed(2).replace(/\.00$/, '')
      : (splitPct.toString())
    const brokeragePctEff = crcSide > 0
      ? (brokerageSplit / crcSide * 100).toFixed(2).replace(/\.00$/, '')
      : brokerageSplitPct.toString()
    // Net cash to the agent = taxable income minus anything withheld. The stored
    // agent_net does not reflect withholdings recovered on this check (e.g. a
    // monthly brokerage fee), so derive it here.
    const netPayout = Math.round((amount1099 - debtsDeducted) * 100) / 100

    const debts = (appliedDebts || []).map(d => ({
      description: d.description || d.debt_type?.replace(/_/g, ' ') || 'Balance owed',
      amount: fmt$(d.amount_paid),
    }))

    const html = generateStatementHTML({
      logo_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'}/logo.png`,
      agent_name: agentName,
      representation: formatType(txn?.transaction_type),
      transaction_number: `TR-${txn?.id?.slice(0, 8).toUpperCase() || 'N/A'}`,
      property_address: txn?.property_address || '--',
      closing_date: fmtDate(txn?.closing_date || txn?.move_in_date),
      sales_price: fmt$(txn?.sales_price || txn?.monthly_rent),
      commission_plan: plan,
      gross_commission: fmt$(grossCommission),
      office_gross: fmt$(crcSide),
      btsa_amount: btsaAmount > 0 ? fmt$(btsaAmount) : null,
      commission_pct: commissionPct,
      role: roleLabel,
      payment_date: fmtDate(baseTia.payment_date),
      payment_method: baseTia.payment_method || 'ACH',
      agent_basis: fmt$(agentBasis),
      // Brokermint-style commission calculation
      base_commission: fmt$(baseCommission),
      has_additional_income: additionalIncomeTotal > 0,
      additional_income: fmt$(additionalIncomeTotal),
      compensation_basis: fmt$(crcSide),
      agent_split_amount: fmt$(agentDisburseTotal),
      agent_split_pct: agentSplitPct,
      brokerage_pct: brokeragePctEff,
      split_percentage: splitPct.toString(),
      brokerage_split_pct: brokerageSplitPct.toString(),
      agent_gross: fmt$(agentGross),
      brokerage_split: fmt$(brokerageSplit),
      processing_fee: processingFee > 0 ? fmt$(processingFee) : null,
      coaching_fee: coachingFee > 0 ? fmt$(coachingFee) : null,
      other_fees: otherFees > 0 ? fmt$(otherFees) : null,
      amount_1099: fmt$(amount1099),
      has_extra_comp: extraComp1099 > 0,
      extra_comp_amount: fmt$(extraComp1099),
      has_debts: debtsDeducted > 0,
      total_debts_deducted: fmt$(debtsDeducted),
      debts,
      agent_net: fmt$(netPayout),
      generated_date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      show_cap_progress: showCapProgress,
      cap_progress: fmt$(capProgress),
      cap_amount: fmt$(capAmount),
      cap_remaining: fmt$(Math.max(0, capAmount - capProgress)),
      cap_percentage: Math.min(100, Math.round((capProgress / capAmount) * 100)),
      show_new_agent_progress: showNewAgentProgress,
      qualifying_count: qualifyingCount,
      qualifying_target: qualifyingTarget,
    })

    if (format === 'pdf') {
      // Trigger the browser's print/save-as-PDF dialog on load so the "Download
      // PDF" button produces a PDF the agent can save.
      const printableHtml = html.replace(
        '</body>',
        `<script>window.addEventListener('load', function () { window.print(); });</script></body>`
      )
      return new NextResponse(printableHtml, {
        headers: {
          'Content-Type': 'text/html',
          'X-PDF-Filename': `${agentName.replace(/\s+/g, '_')}_${fmtDate(baseTia.payment_date)}_STATEMENT.pdf`,
        },
      })
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err: any) {
    console.error('Statement generation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function generateStatementHTML(data: Record<string, any>): string {
  const capProgressSection = data.show_cap_progress ? `
  <div style="background: #f9f7f4; border: 1px solid #e5ddd3; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8a7a60;">Cap progress</div>
      <div style="font-size: 13px; color: #333;"><strong>${data.cap_progress}</strong> <span style="color: #666;">of ${data.cap_amount}</span></div>
    </div>
    <div style="background: #e5ddd3; border-radius: 3px; height: 8px; overflow: hidden;">
      <div style="background: #C5A278; height: 100%; width: ${data.cap_percentage}%; border-radius: 3px;"></div>
    </div>
    <div style="font-size: 9px; color: #888; margin-top: 6px;">${data.cap_remaining} remaining until you hit cap and go to 100%</div>
  </div>` : ''

  const newAgentProgressSection = data.show_new_agent_progress ? `
  <div style="background: #f9f7f4; border: 1px solid #e5ddd3; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8a7a60; margin-bottom: 2px;">New Agent Plan progress</div>
      <div style="font-size: 13px; color: #333;">After ${data.qualifying_target} qualifying sales, you'll upgrade to the <strong>85/15 plan</strong></div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 24px; font-weight: 600; color: #333;">${data.qualifying_count} <span style="font-size: 14px; font-weight: 400; color: #666;">of ${data.qualifying_target}</span></div>
      <div style="font-size: 9px; color: #888;">qualifying sales</div>
    </div>
  </div>` : ''

  const brokerageSplitNote = data.show_cap_progress ? ' · counts toward cap' : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commission Statement - ${data.agent_name}</title>
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
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .doc-title { font-size: 18px; font-weight: 300; letter-spacing: 2px; color: #333; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    @media print {
      body { padding: 20px; }
    }
    @media (max-width: 640px) {
      body { padding: 18px; font-size: 12px; }
      .doc-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .doc-title { font-size: 15px; letter-spacing: 1px; }
      .grid-2, .grid-3 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="doc-header" style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #C5A278;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <img src="${data.logo_url}" alt="CRC" style="height: 48px; width: auto;" onerror="this.style.display='none'">
      <span style="font-size: 13px; font-weight: 500; letter-spacing: 1px; color: #333;">COLLECTIVE REALTY CO</span>
    </div>
    <span class="doc-title">COMMISSION STATEMENT</span>
  </div>

  <div class="grid-2" style="margin-bottom: 24px;">
    <div style="background: #fafafa; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Prepared for</span>
        <span style="font-weight: 500; color: #333;">${data.agent_name}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Role</span>
        <span style="font-weight: 500; color: #333;">${data.role}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Represents</span>
        <span style="font-weight: 500; color: #333;">${data.representation}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Property</span>
        <span style="font-weight: 500; color: #333;">${data.property_address}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Price</span>
        <span style="font-weight: 500; color: #333;">${data.sales_price}</span>
      </div>
    </div>
    <div style="background: #fafafa; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Commission Plan</span>
        <span style="font-weight: 500; color: #333;">${data.commission_plan}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Gross Commission</span>
        <span style="font-weight: 500; color: #333;">${data.gross_commission} (${data.commission_pct}%)</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Payment Date</span>
        <span style="font-weight: 500; color: #333;">${data.payment_date}</span>
      </div>
    </div>
  </div>

  <div style="margin-bottom: 20px;">
    <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #333;">Commission calculation</div>
    <div style="font-size: 11px; color: #333;">
      ${data.has_additional_income ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Base commission <span style="color: #999; font-size: 9px; margin-left: 6px;">CRC's side</span></span>
        <span style="font-weight: 500;">${data.base_commission}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Additional income <span style="color: #999; font-size: 9px; margin-left: 6px;">shared income</span></span>
        <span style="font-weight: 500;">${data.additional_income}</span>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Compensation basis <span style="color: #999; font-size: 9px; margin-left: 6px;">CRC's side</span></span>
        <span style="font-weight: 500;">${data.compensation_basis}</span>
      </div>
      ${data.btsa_amount ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>+ BTSA <span style="color: #999; font-size: 9px; margin-left: 6px;">paid in addition to commission</span></span>
        <span style="font-weight: 500;">${data.btsa_amount}</span>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Your Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.agent_split_pct}% of basis</span></span>
        <span style="font-weight: 500;">${data.agent_split_amount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Brokerage Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.brokerage_pct}%${brokerageSplitNote}</span></span>
        <span style="font-weight: 500;">${data.brokerage_split}</span>
      </div>
    </div>
  </div>

  ${newAgentProgressSection}
  ${capProgressSection}

  <div class="grid-3" style="margin-bottom: 20px;">
    <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 14px;">
      <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px;">Your 1099 income</div>
      <div style="font-size: 22px; font-weight: 600; color: #333; margin-bottom: 8px;">${data.amount_1099}</div>
      <div style="font-size: 9px; color: #666; line-height: 1.4;">This is your <strong>taxable income</strong>. It goes on your 1099 at year end.</div>
      <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 10px; font-size: 9px;">
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #666;">Your Split (${data.agent_split_pct}%)</span>
          <span style="font-weight: 500; color: #333;">${data.agent_split_amount}</span>
        </div>
        ${data.processing_fee ? `<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span style="color: #666;">Processing Fee</span><span style="color: #333;">- ${data.processing_fee}</span></div>` : ''}
        ${data.coaching_fee ? `<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span style="color: #666;">Coaching Fee</span><span style="color: #333;">- ${data.coaching_fee}</span></div>` : ''}
        ${data.other_fees ? `<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span style="color: #666;">Other Fees</span><span style="color: #333;">- ${data.other_fees}</span></div>` : ''}
      </div>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 14px;">
      <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px;">Amounts withheld</div>
      <div style="font-size: 22px; font-weight: 600; color: ${data.has_debts ? '#333' : '#aaa'}; margin-bottom: 8px;">${data.has_debts ? data.total_debts_deducted : '$0.00'}</div>
      <div style="font-size: 9px; color: #666; line-height: 1.4;">${data.has_debts ? `Deducted to cover balances owed. <em>Does NOT reduce your 1099.</em>` : 'No outstanding balances were deducted from this payout.'}</div>
      ${data.has_debts ? `<div style="background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 10px; font-size: 9px;">${data.debts.map((d: any) => `<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span style="color: #666;">${d.description}</span><span style="color: #333;">- ${d.amount}</span></div>`).join('')}</div>` : ''}
    </div>

    <div style="background: #f9f9f9; border: 2px solid #C5A278; border-radius: 6px; padding: 14px;">
      <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px;">Cash you receive</div>
      <div style="font-size: 22px; font-weight: 600; color: #333; margin-bottom: 8px;">${data.agent_net}</div>
      <div style="font-size: 9px; color: #666; line-height: 1.4;">The <strong>actual amount deposited</strong> to your account via ${data.payment_method}.</div>
      <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 10px; font-size: 9px;">
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #666;">1099 Income</span>
          <span style="font-weight: 500; color: #333;">${data.amount_1099}</span>
        </div>
        ${data.has_debts ? `<div style="display: flex; justify-content: space-between; padding: 2px 0;"><span style="color: #666;">Less: Withheld</span><span style="color: #333;">- ${data.total_debts_deducted}</span></div>` : ''}
        <div style="display: flex; justify-content: space-between; padding: 2px 0; border-top: 1px solid #ccc; margin-top: 4px; padding-top: 4px;">
          <span style="font-weight: 600; color: #333;">Net Payout</span>
          <span style="font-weight: 600; color: #333;">${data.agent_net}</span>
        </div>
      </div>
    </div>
  </div>

  <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 10px; color: #555; border-left: 3px solid #C5A278;">
    <div style="font-weight: 500; color: #333; margin-bottom: 4px;">Important tax information</div>
    <p>${data.has_debts ? `<strong>Your 1099 income (${data.amount_1099}) is what you'll pay taxes on</strong>, not the cash you received (${data.agent_net}). The ${data.total_debts_deducted} withheld was still your income - it just went toward paying off your account balance instead of to your bank.` : `<strong>Your 1099 income (${data.amount_1099}) is what you'll pay taxes on.</strong> Since no amounts were withheld, this matches the cash you received.`}</p>
  </div>

  <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center;">
    <p>Collective Realty Co · Referral Collective LLC · Statement generated ${data.generated_date}</p>
    <p style="margin-top: 4px;">Questions? Contact transactions@collectiverealtyco.com</p>
  </div>
</body>
</html>`
}