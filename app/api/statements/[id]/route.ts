import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'
import { getTransactionTypeLabel } from '@/lib/transactions/transactionTypes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatType = (type: string | null): string => {
  return getTransactionTypeLabel(type)
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

    const { data: tia, error: tiaError } = await supabase
      .from('transaction_internal_agents')
      .select(`
        *,
        transaction:transactions(*),
        agent:users(
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          commission_plan, office, qualifying_transaction_count
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
    const plan = tia.commission_plan || agent?.commission_plan || '--'

    const currentYear = new Date().getFullYear()
    const { data: ytdData } = await supabase
      .from('transaction_internal_agents')
      .select('sales_volume, agent_net')
      .eq('agent_id', tia.agent_id)
      .eq('payment_status', 'paid')
      .gte('payment_date', `${currentYear}-01-01`)
      .lte('payment_date', `${currentYear}-12-31`)

    const ytdVolume = (ytdData || []).reduce((s, r) => s + parseFloat(r.sales_volume || 0), 0)
    const ytdNet = (ytdData || []).reduce((s, r) => s + parseFloat(r.agent_net || 0), 0)

    // Calculate YTD cap progress from TIA
    const { data: capData } = await supabase
      .from('transaction_internal_agents')
      .select('brokerage_split, transactions!inner(status, closing_date)')
      .eq('agent_id', tia.agent_id)
      .eq('counts_toward_progress', true)
      .eq('transactions.status', 'closed')
      .gte('transactions.closing_date', `${currentYear}-01-01`)
    
    const calculatedCapProgress = (capData || []).reduce(
      (sum, r) => sum + parseFloat(r.brokerage_split || 0), 0
    )

    const { data: appliedDebts } = await supabase
      .from('agent_debts')
      .select('debt_type, description, amount_paid, date_incurred')
      .eq('offset_transaction_agent_id', internalAgentId)

    const agentGross = parseFloat(tia.agent_gross || 0)
    const processingFee = parseFloat(tia.processing_fee || 0)
    const coachingFee = parseFloat(tia.coaching_fee || 0)
    const otherFees = parseFloat(tia.other_fees || 0)
    const totalFees = processingFee + coachingFee + otherFees
    const amount1099 = tia.amount_1099_reportable || (agentGross - totalFees)
    const debtsDeducted = parseFloat(tia.debts_deducted || 0)
    const agentNet = parseFloat(tia.agent_net || 0)
    const brokerageSplit = parseFloat(tia.brokerage_split || 0)
    const agentBasis = parseFloat(tia.agent_basis || 0)
    const splitPct = parseFloat(tia.split_percentage || 0)
    const brokerageSplitPct = 100 - splitPct

    const showCapProgress = isCapPlan(plan)
    const showNewAgentProgress = isNewAgentPlan(plan)
    const capProgress = calculatedCapProgress
    const capAmount = 18000
    const qualifyingCount = agent?.qualifying_transaction_count || 0

    const agentName = agent
      ? `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
      : '--'

    const grossCommission = parseFloat(txn?.gross_commission || tia.agent_basis || 0)
    const commissionPct = txn?.sales_price
      ? ((grossCommission / parseFloat(txn.sales_price)) * 100).toFixed(2)
      : '0'

    const debts = (appliedDebts || []).map(d => ({
      description: d.description || d.debt_type?.replace(/_/g, ' ') || 'Balance owed',
      amount: fmt$(d.amount_paid),
    }))

    const html = generateStatementHTML({
      logo_url: '/logo-dark.png',
      agent_name: agentName,
      representation: formatType(txn?.transaction_type),
      transaction_number: `TR-${txn?.id?.slice(0, 8).toUpperCase() || 'N/A'}`,
      property_address: txn?.property_address || '--',
      closing_date: fmtDate(txn?.closing_date || txn?.move_in_date),
      sales_price: fmt$(txn?.sales_price || txn?.monthly_rent),
      commission_plan: plan,
      gross_commission: fmt$(grossCommission),
      commission_pct: commissionPct,
      payment_date: fmtDate(tia.payment_date),
      payment_method: tia.payment_method || 'ACH',
      ytd_volume: fmt$(ytdVolume),
      ytd_net: fmt$(ytdNet),
      agent_basis: fmt$(agentBasis),
      split_percentage: splitPct.toString(),
      brokerage_split_pct: brokerageSplitPct.toString(),
      agent_gross: fmt$(agentGross),
      brokerage_split: fmt$(brokerageSplit),
      processing_fee: processingFee > 0 ? fmt$(processingFee) : null,
      coaching_fee: coachingFee > 0 ? fmt$(coachingFee) : null,
      other_fees: otherFees > 0 ? fmt$(otherFees) : null,
      amount_1099: fmt$(amount1099),
      has_debts: debtsDeducted > 0,
      total_debts_deducted: fmt$(debtsDeducted),
      debts,
      agent_net: fmt$(agentNet),
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
    })

    if (format === 'pdf') {
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'X-PDF-Filename': `${agentName.replace(/\s+/g, '_')}_${fmtDate(tia.payment_date)}_STATEMENT.pdf`,
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
      <div style="font-size: 13px; color: #333;">After 5 qualifying sales, you'll upgrade to the <strong>85/15 plan</strong></div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 24px; font-weight: 600; color: #333;">${data.qualifying_count} <span style="font-size: 14px; font-weight: 400; color: #666;">of 5</span></div>
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
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #C5A278;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <img src="${data.logo_url}" alt="CRC" style="height: 48px; width: auto;" onerror="this.style.display='none'">
      <span style="font-size: 13px; font-weight: 500; letter-spacing: 1px; color: #333;">COLLECTIVE REALTY CO</span>
    </div>
    <span style="font-size: 18px; font-weight: 300; letter-spacing: 2px; color: #333;">COMMISSION STATEMENT</span>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <div style="background: #fafafa; padding: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Prepared for</span>
        <span style="font-weight: 500; color: #333;">${data.agent_name}</span>
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
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">Payment Date</span>
        <span style="font-weight: 500; color: #333;">${data.payment_date}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;">
        <span style="color: #888; text-transform: uppercase; font-size: 9px;">YTD Net</span>
        <span style="font-weight: 500; color: #333;">${data.ytd_net}</span>
      </div>
    </div>
  </div>

  <div style="margin-bottom: 20px;">
    <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #333;">Commission calculation</div>
    <div style="font-size: 11px; color: #333;">
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Gross Commission <span style="color: #999; font-size: 9px; margin-left: 6px;">CRC's side</span></span>
        <span style="font-weight: 500;">${data.gross_commission}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ddd;">
        <span>Your Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.split_percentage}% of basis</span></span>
        <span style="font-weight: 500;">${data.agent_gross}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Brokerage Split <span style="color: #999; font-size: 9px; margin-left: 6px;">${data.brokerage_split_pct}%${brokerageSplitNote}</span></span>
        <span style="font-weight: 500;">${data.brokerage_split}</span>
      </div>
    </div>
  </div>

  ${newAgentProgressSection}
  ${capProgressSection}

  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
    <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 14px;">
      <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px;">Your 1099 income</div>
      <div style="font-size: 22px; font-weight: 600; color: #333; margin-bottom: 8px;">${data.amount_1099}</div>
      <div style="font-size: 9px; color: #666; line-height: 1.4;">This is your <strong>taxable income</strong>. It goes on your 1099 at year end.</div>
      <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 10px; font-size: 9px;">
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #666;">Your Split (${data.split_percentage}%)</span>
          <span style="font-weight: 500; color: #333;">${data.agent_gross}</span>
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