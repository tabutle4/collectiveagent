import { supabaseAdmin } from '@/lib/supabase'

/**
 * Shared CDA data loader + computation.
 *
 * This is the SINGLE source of truth for every number and label that appears
 * on a Commission Disbursement Authorization. Both the web CDA (the HTML route
 * at /api/admin/transactions/[id]/cda/[tia_id]) and the CDA PDF that gets
 * emailed to title render from the object this returns, so the two can never
 * drift. All the fetching and math here was lifted verbatim from the HTML
 * route; the route now destructures this model and keeps its HTML template
 * unchanged.
 */

function fmtDate(d: string | null | undefined): string {
  if (!d) return '--'
  const ds = d.includes('T') ? d : `${d}T12:00:00`
  const dt = new Date(ds)
  if (isNaN(dt.getTime())) return '--'
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '--'
  const map: Record<string, string> = {
    primary_agent: 'Primary Agent',
    listing_agent: 'Listing Agent',
    co_agent: 'Co-Agent',
    team_lead: 'Team Lead',
    referral_agent: 'Referral Agent',
    momentum_partner: 'Momentum Partner',
  }
  return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export interface CdaContact {
  contact_type: string
  name: string | null
  email: any
  phone: string | null
  company: string | null
}

export interface CdaModel {
  agentName: string
  agencyName: string
  propertyAddr: string
  role: string
  logoUrl: string
  generatedDate: string
  // Commission figures
  listingSide: number
  buyingSide: number
  btsaTotal: number
  officeGross: number
  totalGrossCommission: number
  officeNet: number
  officeLineLabel: string
  agentNetPay: number
  rebateAmount: number
  rebateLabel: string | null
  priceForDisplay: number
  priceLabel: string
  salesPricePct: string | null
  extraRows: { side: string; label: string; amount: number }[]
  notes: string | null
  brokerageLines: string[]
  // Related records used by the renderers
  titleContact: CdaContact | undefined
  buyerContact: CdaContact | undefined
  sellerContact: CdaContact | undefined
  agent: any
  txn: any
  settings: any
}

export type LoadCdaResult =
  | { ok: true; model: CdaModel; tia: any; agent: any; txn: any }
  | { ok: false; status: number; error: string }

/**
 * Loads every record a CDA needs and computes the disbursement figures.
 * Does NOT enforce auth — callers must have already authorized the request
 * (the HTML route checks can_view_all_transactions / TIA ownership; the
 * title send route requires an admin permission). Returns the raw tia so the
 * caller can run its own ownership check.
 */
export async function loadCdaData(id: string, tia_id: string): Promise<LoadCdaResult> {
  // Fetch TIA
  const { data: tia } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select(`
      id, agent_id, agent_role, agent_basis, split_percentage,
      agent_gross, processing_fee, brokerage_split,
      btsa_amount, rebate_amount, rebate_type, adjustment_notes
    `)
    .eq('id', tia_id)
    .eq('transaction_id', id)
    .single()

  if (!tia) return { ok: false, status: 404, error: 'Agent row not found' }

  // Fetch agent
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, license_number')
    .eq('id', tia.agent_id)
    .single()

  if (!agent) return { ok: false, status: 404, error: 'Agent not found' }

  // Fetch transaction
  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select(`
      id, property_address, transaction_type, sales_price, monthly_rent,
      closing_date, closed_date, office_gross,
      listing_side_commission, buying_side_commission,
      listing_base_commission, buying_base_commission,
      gross_commission, broker_approved_at, cda_status
    `)
    .eq('id', id)
    .single()

  if (!txn) return { ok: false, status: 404, error: 'Transaction not found' }

  // Fetch contacts -- title company, buyer/seller
  const { data: contacts } = await supabaseAdmin
    .from('transaction_contacts')
    .select('contact_type, name, email, phone, company')
    .eq('transaction_id', id)

  const titleContact = (contacts || []).find(c => c.contact_type === 'title_company')
  const buyerContact = (contacts || []).find(c => c.contact_type === 'buyer' || c.contact_type === 'tenant')
  const sellerContact = (contacts || []).find(c => c.contact_type === 'seller' || c.contact_type === 'landlord')

  // Fetch additional income rows
  const { data: additionalIncomeRows } = await supabaseAdmin
    .from('transaction_additional_income')
    .select('side, label, amount')
    .eq('transaction_id', id)
    .order('created_at', { ascending: true })

  // Fetch company settings
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('agency_name, brokerage_address_line1, brokerage_address_line2, brokerage_city, brokerage_state, brokerage_zip, brokerage_main_email')
    .limit(1)
    .maybeSingle()

  const agentName = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
  const agencyName = settings?.agency_name || 'Collective Realty Co.'
  const propertyAddr = txn.property_address || '--'

  // A CDA must show the total we pay each party on the deal, not just the
  // clicked card. The additional-comp flow creates extra co_agent rows (same
  // agent_id) that carry agent_net only. Gather every row for this agent,
  // anchor role/BTSA/rebate on the primary row, and total the agent payout.
  const CDA_ROLE_PRIORITY: Record<string, number> = { primary_agent: 0, listing_agent: 1, co_agent: 2 }
  const PRODUCING_ROLES = ['primary_agent', 'listing_agent', 'co_agent']
  const { data: allTiaRowsRaw } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('id, agent_id, agent_role, agent_gross, agent_net, amount_1099_reportable, btsa_amount, rebate_amount, rebate_type, brokerage_split')
    .eq('transaction_id', id)
  const allTiaRows = (allTiaRowsRaw && allTiaRowsRaw.length > 0) ? allTiaRowsRaw : [tia]
  const agentTiaRows = allTiaRows.filter(r => r.agent_id === tia.agent_id)
  const primaryTiaRow = [...agentTiaRows].sort(
    (a, b) => (CDA_ROLE_PRIORITY[a.agent_role] ?? 9) - (CDA_ROLE_PRIORITY[b.agent_role] ?? 9)
  )[0]
  // What the agent is actually disbursed. Base rows pay amount_1099 (the split
  // AFTER processing/coaching/other fees, BTSA and rebate) - NOT agent_gross,
  // which is the raw split before fees. Debts are subtracted separately below
  // and moved to the office line, so we use the pre-debt 1099 here (1099 minus
  // debts = agent_net). Additional co_agent rows carry their net amount
  // directly. Fall back to agent_net only if 1099 wasn't stored.
  const rowAgentDisburse = (r: any): number => {
    const g = Number(r.agent_gross || 0)
    if (g <= 0) return Number(r.agent_net || 0)
    return r.amount_1099_reportable != null ? Number(r.amount_1099_reportable) : Number(r.agent_net || 0)
  }
  const agentDisburseTotal = agentTiaRows.reduce((s, r) => s + rowAgentDisburse(r), 0)
  // Office net = the office side commission minus every producing agent's
  // payout minus anything paid to outside brokerages. Because additional
  // income is already folded into the side commissions, this figure includes
  // the office's share of it automatically.
  const producingRows = allTiaRows.filter(r => PRODUCING_ROLES.includes(r.agent_role))
  const allAgentsDisburseTotal = producingRows.reduce((s, r) => s + rowAgentDisburse(r), 0)
  const { data: externalBrokerages } = await supabaseAdmin
    .from('transaction_external_brokerages')
    .select('amount_1099_reportable')
    .eq('transaction_id', id)
  const externalTotal = (externalBrokerages || []).reduce(
    (s, e) => s + Number(e.amount_1099_reportable || 0), 0
  )
  // Amounts withheld from agents on this deal (e.g. a monthly brokerage fee
  // recovered from the check). These reduce the agent's disbursement and are
  // kept by the brokerage, so they move from the agent line to the office
  // line on the CDA.
  const producingTiaIds = producingRows.map(r => r.id)
  const { data: appliedDebtRows } = producingTiaIds.length > 0
    ? await supabaseAdmin
        .from('agent_debts')
        .select('amount_paid, offset_transaction_agent_id')
        .in('offset_transaction_agent_id', producingTiaIds)
    : { data: [] as any[] }
  const agentTiaIdSet = new Set(agentTiaRows.map(r => r.id))
  const thisAgentDebts = (appliedDebtRows || []).reduce(
    (s, d) => agentTiaIdSet.has(d.offset_transaction_agent_id) ? s + Number(d.amount_paid || 0) : s, 0
  )
  const allAgentsDebts = (appliedDebtRows || []).reduce(
    (s, d) => s + Number(d.amount_paid || 0), 0
  )
  // What this agent actually receives after withholdings.
  const agentNetPay = Math.max(0, Math.round((agentDisburseTotal - thisAgentDebts) * 100) / 100)

  const role = formatRole(primaryTiaRow.agent_role)
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'}/logo.png`
  const generatedDate = fmtDate(new Date().toISOString())

  // Commission breakdown
  const listingSide = Number(txn.listing_side_commission || 0)
  const buyingSide = Number(txn.buying_side_commission || 0)
  const btsaTotal = Number(primaryTiaRow.btsa_amount || 0)
  const officeGross = Number(txn.office_gross || 0)
  const totalGrossCommission = Number(txn.gross_commission || officeGross + btsaTotal)
  const extraRows = (additionalIncomeRows || []) as { side: string; label: string; amount: number }[]
  // Office net for the payees table: office side minus all agents (net of
  // their withholdings) minus outside brokerages. Withholdings kept by the
  // brokerage stay on the office line. Never negative.
  const officeNet = Math.max(
    0,
    // BTSA passes through to the agent (it's inside each agent's amount_1099),
    // so it must be added into the office pool too, or it gets subtracted from
    // the brokerage line without ever being added -- zeroing the office row.
    Math.round((officeGross + btsaTotal - (allAgentsDisburseTotal - allAgentsDebts) - externalTotal) * 100) / 100
  )
  const officeSideLabel = buyingSide > 0 && listingSide === 0
    ? 'Buying'
    : listingSide > 0 && buyingSide === 0
      ? 'Listing'
      : 'Office'
  const officeLineLabel = officeSideLabel === 'Office' ? 'Office commission' : `${officeSideLabel} office commission`
  // Sale price for display; leases use monthly rent.
  const priceForDisplay = Number(txn.sales_price || 0) || Number(txn.monthly_rent || 0)
  const priceLabel = Number(txn.sales_price || 0) > 0 ? 'Sales price' : 'Monthly rent'
  const salesPricePct = priceForDisplay && officeGross
    ? ((officeGross / priceForDisplay) * 100).toFixed(2) + '%'
    : null

  // Rebate (reduces agent payout)
  const rebateAmount = Number(primaryTiaRow.rebate_amount || 0)
  const rebateLabel = primaryTiaRow.rebate_type === 'buyer' ? 'Buyer Rebate' : primaryTiaRow.rebate_type === 'seller' ? 'Seller Rebate' : rebateAmount > 0 ? 'Client Rebate' : null

  // Notes
  const notes: string | null = null

  // Brokerage address
  const brokerageLines = [
    settings?.brokerage_address_line1,
    settings?.brokerage_address_line2,
    settings?.brokerage_city && settings?.brokerage_state
      ? `${settings.brokerage_city}, ${settings.brokerage_state} ${settings.brokerage_zip || ''}`.trim()
      : null,
  ].filter(Boolean) as string[]

  const model: CdaModel = {
    agentName, agencyName, propertyAddr, role, logoUrl, generatedDate,
    listingSide, buyingSide, btsaTotal, officeGross, totalGrossCommission,
    officeNet, officeLineLabel, agentNetPay, rebateAmount, rebateLabel,
    priceForDisplay, priceLabel, salesPricePct, extraRows, notes, brokerageLines,
    titleContact, buyerContact, sellerContact, agent, txn, settings,
  }

  return { ok: true, model, tia, agent, txn }
}

/** Resolve the title officer's email address from a title_company contact. */
export function titleContactEmail(c: CdaContact | undefined): string | null {
  if (!c || !c.email) return null
  if (Array.isArray(c.email)) {
    const first = c.email[0]
    if (!first) return null
    return typeof first === 'string' ? first : (first.value || null)
  }
  return typeof c.email === 'string' ? c.email : null
}
