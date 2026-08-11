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
    // Every figure on the statement has to cover all of this agent's rows on
    // the deal. The 1099 total and the withheld total already do; the
    // deductions did not, because they were read off the anchor row alone. On a
    // deal where the agent holds a second commission row carrying its own fees,
    // that made the calculation stop adding up: the split totalled every row
    // while the fees subtracted from only one.
    const sumAgentRows = (field: string): number =>
      agentRows.reduce((s: number, r: any) => s + (parseFloat(r[field]) || 0), 0)

    // Gross stays anchored on the primary row on purpose: the other rows are
    // added back separately as extraAgentAmount just below, so summing here
    // would count them twice.
    const agentGross = parseFloat(baseTia.agent_gross || 0)
    const processingFee = sumAgentRows('processing_fee')
    const coachingFee = sumAgentRows('coaching_fee')
    const otherFees = sumAgentRows('other_fees')
    const rebateAmount = sumAgentRows('rebate_amount')
    const totalFees = processingFee + coachingFee + otherFees
    // Additional-comp rows (extra checks to the same agent) add their own 1099
    // and net on top of the primary row.
    const extraComp1099 = extraRows.reduce((s, r) => s + rowAmount1099(r), 0)
    // Per-row disbursement to the agent. Rows built from a split carry
    // agent_gross. Rows whose comp was entered as a flat amount do not: team
    // lead overrides, momentum partner fees, referral splits and second checks
    // all store the money in amount_1099_reportable and leave gross at zero.
    // For those, run the canonical formula backwards from the 1099 to recover
    // the figure the deductions come out of. agent_net was the old fallback and
    // is already net of the fees and of anything withheld, so subtracting the
    // fees again below took them out twice and the column never tied. On 179
    // team lead rows, 20 momentum partner rows and 5 referral rows that is the
    // difference between a statement that reconciles and one that shows no
    // total at all.
    const rowAgentDisburse = (r: any): number => {
      const g = parseFloat(r.agent_gross || 0)
      if (g > 0) return g
      const stored = rowAmount1099(r)
      if (!stored) return parseFloat(r.agent_net || 0)
      return Math.round((
        stored
        - (parseFloat(r.btsa_amount) || 0)
        + (parseFloat(r.processing_fee) || 0)
        + (parseFloat(r.coaching_fee) || 0)
        + (parseFloat(r.other_fees) || 0)
        + (parseFloat(r.rebate_amount) || 0)
      ) * 100) / 100
    }
    const extraAgentAmount = extraRows.reduce((s, r) => s + rowAgentDisburse(r), 0)
    // The anchor row goes through the same helper as the extras. When it
    // carries a gross this is identical to reading agentGross; when it does not
    // -- every team lead, momentum partner and referral statement -- reading
    // agentGross gave zero, so the column started from nothing and subtracted
    // fees from it.
    const agentDisburseTotal = rowAgentDisburse(baseTia) + extraAgentAmount
    // Per-row breakdown. The figures above already combine every row this agent
    // holds on the deal, but nothing on the page said which rows or under what
    // role. These use the same two helpers the totals use -- rowAgentDisburse
    // and rowAmount1099 -- over the same agentRows array, so the rows always
    // add to the totals printed beneath them rather than being a second,
    // separately derived set of numbers that could drift. Only built when the
    // agent holds more than one row; a single-row statement is unchanged.
    const rowBreakdown = agentRows.length > 1
      ? [...agentRows]
          .sort((a, b) => (ROLE_PRIORITY[a.agent_role] ?? 9) - (ROLE_PRIORITY[b.agent_role] ?? 9))
          .map((r: any) => ({
            role: formatRole(r.agent_role),
            disburse: fmt$(rowAgentDisburse(r)),
            amount_1099: fmt$(rowAmount1099(r)),
          }))
      : []
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
    // No basis, no gross and no split percentage means the comp was entered as
    // a flat amount rather than derived from a split. There is nothing truthful
    // to print in the basis/split/brokerage lines for those, and what printed
    // instead was a compensation basis the agent has no claim to followed by
    // "Your Split 0% of basis $0.00". Show the amount under its role instead.
    const isOverrideComp =
      agentBasis === 0 && parseFloat(baseTia.agent_gross || 0) === 0 && splitPct === 0

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
    // Also summed across every row: BTSA is added to the 1099 the same way the
    // fees are subtracted from it, so it has to be gathered the same way.
    const btsaAmount = sumAgentRows('btsa_amount')
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
    // Does the calculation column arrive at the 1099 the deal actually stores?
    const calcReconciles =
      Math.abs(
        (agentDisburseTotal + btsaAmount - processingFee - coachingFee - otherFees - rebateAmount) -
          amount1099
      ) < 0.02

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
      is_override_comp: isOverrideComp,
      brokerage_pct: brokeragePctEff,
      split_percentage: splitPct.toString(),
      brokerage_split_pct: brokerageSplitPct.toString(),
      agent_gross: fmt$(agentGross),
      brokerage_split: fmt$(brokerageSplit),
      processing_fee: processingFee > 0 ? fmt$(processingFee) : null,
      coaching_fee: coachingFee > 0 ? fmt$(coachingFee) : null,
      other_fees: otherFees > 0 ? fmt$(otherFees) : null,
      // A rebate reduces the 1099 the same way a fee does, so it has to appear
      // wherever the deductions are listed. Without it the calculation shows a
      // split and a set of fees that do not add up to the 1099 figure beneath
      // them, and the missing amount has no label to explain it.
      rebate_amount: rebateAmount > 0 ? fmt$(rebateAmount) : null,
      // Only close the calculation with running totals when the deal's own
      // numbers actually produce them. Rows imported from Brokermint, and
      // anything edited before the canonical math was enforced, carry a stored
      // 1099 that does not equal split + BTSA - fees - rebate. Printing a total
      // under those would put a figure on the page that visibly disagrees with
      // the lines above it. The deductions still show; only the totals are
      // held back, and the three boxes below still carry both figures.
      calc_reconciles: calcReconciles,
      amount_1099: fmt$(amount1099),
      has_row_breakdown: rowBreakdown.length > 0,
      row_breakdown: rowBreakdown,
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

  // How the agent's money was arrived at. Split-based comp walks the basis down
  // through the split; flat comp has no split to walk, so it states the amount
  // under the role it was earned in. Built here rather than inline because the
  // two versions are long enough that nesting them inside the document would
  // bury the rest of the calculation.
  const compensationSection = data.is_override_comp ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>${data.role} commission <span style="color: #999; font-size: 9px; margin-left: 6px;">agreed amount, not a split of the basis</span></span>
        <span style="font-weight: 500;">${data.agent_split_amount}</span>
      </div>` : `
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
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Your Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.agent_split_pct}% of basis</span></span>
        <span style="font-weight: 500;">${data.agent_split_amount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Brokerage Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.brokerage_pct}%${brokerageSplitNote}</span></span>
        <span style="font-weight: 500;">${data.brokerage_split}</span>
      </div>`

  // Same distinction inside the 1099 box recap: a percentage there is only
  // meaningful when there was a split behind it.
  const recapTopLine = data.is_override_comp
    ? `${data.role} commission`
    : `Your Split (${data.agent_split_pct}%)`

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

  <!-- Read first: this document is an internal record for the agent, not a
       disbursement instruction. It carries no signature and no authorization,
       so a title company must never fund from it. The CDA is the only document
       that authorizes payment. Placed above everything else, and styled to
       stay legible on a phone, because it is most likely to be forwarded to
       title from a phone. -->
  <div style="border: 2px solid #b42318; background: #fef3f2; border-radius: 6px; padding: 12px 14px; margin-bottom: 24px;">
    <div style="font-size: 12px; font-weight: 700; color: #b42318; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
      This is not a Commission Disbursement Authorization
    </div>
    <p style="font-size: 11px; color: #5c1b16; line-height: 1.5;">
      <strong>Title companies and closing agents must not disburse funds based on this document.</strong>
      It is an unsigned internal accounting summary prepared for the agent named below, and it carries
      no authorization to pay any party. Disbursement may only be made from a signed Commission
      Disbursement Authorization issued by Collective Realty Co. To request one, contact
      <a href="mailto:transactions@collectiverealtyco.com" style="color: #b42318;">transactions@collectiverealtyco.com</a>.
    </p>
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
      ${compensationSection}

      ${data.has_row_breakdown ? `
      <div style="margin: 8px 0 2px; padding: 8px 10px; background: #fafafa; border-radius: 4px;">
        <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px;">Breakdown by role</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <tr>
            <th style="text-align: left; font-weight: 500; color: #888; padding: 2px 0;">Role</th>
            <th style="text-align: right; font-weight: 500; color: #888; padding: 2px 0;">Compensation</th>
            <th style="text-align: right; font-weight: 500; color: #888; padding: 2px 0;">1099</th>
          </tr>
          ${data.row_breakdown.map((r: any) => `
          <tr>
            <td style="text-align: left; color: #666; padding: 2px 0; border-top: 1px dotted #ddd;">${r.role}</td>
            <td style="text-align: right; color: #333; padding: 2px 0; border-top: 1px dotted #ddd;">${r.disburse}</td>
            <td style="text-align: right; color: #333; padding: 2px 0; border-top: 1px dotted #ddd;">${r.amount_1099}</td>
          </tr>`).join('')}
          <tr>
            <td style="text-align: left; font-weight: 600; color: #333; padding: 4px 0 0; border-top: 1px solid #ccc;">Total</td>
            <td style="text-align: right; font-weight: 600; color: #333; padding: 4px 0 0; border-top: 1px solid #ccc;">${data.agent_split_amount}</td>
            <td style="text-align: right; font-weight: 600; color: #333; padding: 4px 0 0; border-top: 1px solid #ccc;">${data.amount_1099}</td>
          </tr>
        </table>
      </div>
      ` : ''}

      ${data.btsa_amount ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>+ BTSA <span style="color: #999; font-size: 9px; margin-left: 6px;">paid in addition to commission</span></span>
        <span style="font-weight: 500;">${data.btsa_amount}</span>
      </div>
      ` : ''}

      <!-- The deductions and the final figure continue in this same section,
           directly under the splits. The split on its own is not what anyone
           is paid, and when it was the last line here it could be read as a
           final amount. The three boxes below still carry the same numbers as
           a fuller explanation; this is the short version in one column. -->
      ${data.processing_fee ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid #ddd;">
        <span>Less Processing Fee</span>
        <span style="font-weight: 500;">- ${data.processing_fee}</span>
      </div>
      ` : ''}
      ${data.coaching_fee ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>Less Coaching Fee</span>
        <span style="font-weight: 500;">- ${data.coaching_fee}</span>
      </div>
      ` : ''}
      ${data.other_fees ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>Less Other Fees</span>
        <span style="font-weight: 500;">- ${data.other_fees}</span>
      </div>
      ` : ''}
      ${data.rebate_amount ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>Less Rebate</span>
        <span style="font-weight: 500;">- ${data.rebate_amount}</span>
      </div>
      ` : ''}
      ${data.calc_reconciles ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>Your 1099 income <span style="color: #999; font-size: 9px; margin-left: 6px;">taxable</span></span>
        <span style="font-weight: 500;">${data.amount_1099}</span>
      </div>
      ${data.has_debts ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px dotted #ddd;">
        <span>Less Amounts Withheld <span style="color: #999; font-size: 9px; margin-left: 6px;">balances owed</span></span>
        <span style="font-weight: 500;">- ${data.total_debts_deducted}</span>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 8px 0 0; margin-top: 4px; border-top: 2px solid #C5A278;">
        <span style="font-weight: 700; color: #333;">Amount paid to agent</span>
        <span style="font-weight: 700; color: #333;">${data.agent_net}</span>
      </div>
      ` : ''}
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
          <span style="color: #666;">${recapTopLine}</span>
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