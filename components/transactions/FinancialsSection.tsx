'use client'

/**
 * Financials section — broker and operations only.
 *
 * Renders the narrowing cash flow SVG (sale price → gross commission →
 * office gross → agent 1099 gross + brokerage 30% → cash out to agents +
 * brokerage net) and optionally a retainer mini-flow above it when the
 * transaction has a retainer.
 *
 * Retainer is separate from closing commission — paid to agent after
 * rep agreement and docs are reviewed, independent of whether the deal
 * ever closes. Retainer is NOT applied toward closing commission.
 *
 * Colors come strictly from the CRC palette defined in tailwind.config.mjs:
 * golds for agent side progression, grays for firm side, neutrals for
 * context. Orange-dashed arrows for fees/debts recovered to firm use
 * chart-gold-7 rather than an invented orange.
 */

import type { AppRole } from '@/lib/transactions/role'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

const fmt$ = (n: any): string => {
  const v = parseFloat(String(n ?? 0)) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v)
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return ''
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function FinancialsSection({
  transaction,
  agents,
  checks,
  role,
}: {
  transaction: any
  agents: any[]
  checks: any[]
  role: AppRole
}) {
  // Gate at the component level too — defense in depth
  const canSee = role === 'broker' || role === 'admin'
  if (!canSee) return null

  const isLease = isLeaseTransactionType(transaction?.transaction_type)

  // Retainer is stored on the transaction (no column yet — placeholder for
  // when we add it; for now, only renders if transaction.retainer_amount > 0)
  const retainerAmount = parseFloat(transaction?.retainer_amount || 0) || 0

  // Sales price / lease commission total
  const salePrice = isLease
    ? parseFloat(transaction?.monthly_rent || 0)
    : parseFloat(transaction?.sales_price || 0)

  // Commission rate
  const commissionRate = parseFloat(transaction?.commission_rate || 0)

  // Gross commission from existing transaction fields
  const grossCommission =
    parseFloat(transaction?.total_commission_amount || 0) ||
    (salePrice && commissionRate ? salePrice * (commissionRate / 100) : 0)

  // Office gross = agent_gross + brokerage split, summed across all TIAs
  // where this is a primary/listing/co row (not derived team_lead/momentum).
  // This is the CRC portion; external brokerage payouts are handled separately.
  const primaryRoles = new Set([
    'primary_agent',
    'listing_agent',
    'co_agent',
    'referral_agent',
  ])
  const officeGross = agents
    .filter((a: any) => primaryRoles.has(a.agent_role))
    .reduce((s: number, a: any) => {
      const gross = parseFloat(a.agent_gross || 0) || 0
      const pct = parseFloat(a.split_percentage || 0) || 0
      // If we know the agent's split and gross, derive the office gross
      // for this agent (gross divided by their split percent).
      if (pct > 0) return s + gross / (pct / 100)
      return s + gross
    }, 0)

  // Total agent payouts (cash out to agents) = sum of agent_net across
  // ALL TIAs (includes team leads and momentum partners)
  const totalAgentPayouts = agents.reduce(
    (s: number, a: any) => s + (parseFloat(a.agent_net || 0) || 0),
    0
  )

  // Agent 1099 gross total
  const total1099 = agents.reduce(
    (s: number, a: any) =>
      s + (parseFloat(a.amount_1099_reportable || 0) || 0),
    0
  )

  // Fees + debts recovered to firm
  const feesRecovered = agents.reduce(
    (s: number, a: any) =>
      s +
      (parseFloat(a.processing_fee || 0) || 0) +
      (parseFloat(a.coaching_fee || 0) || 0) +
      (parseFloat(a.other_fees || 0) || 0),
    0
  )
  const debtsRecovered = agents.reduce(
    (s: number, a: any) => s + (parseFloat(a.debts_deducted || 0) || 0),
    0
  )

  // Brokerage 30% (gross split before fees/debts add-back)
  const brokerage30 = Math.max(0, officeGross - total1099 - feesRecovered)
  // Brokerage net = 30% + fees + debts recovered
  const brokerageNet = brokerage30 + feesRecovered + debtsRecovered

  // Received vs pending
  const received = checks.reduce(
    (s: number, c: any) => s + (parseFloat(c.amount || c.check_amount || 0) || 0),
    0
  )
  const pending = Math.max(0, grossCommission - received)

  return (
    <div id="financials" className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="section-title mb-0">Financials</h2>
        <span className="inline-flex items-center gap-1 text-[10px] text-luxury-gray-2 bg-luxury-light px-2 py-0.5 rounded-full">
          <span className="w-[5px] h-[5px] rounded-full bg-chart-gold-5 inline-block" />
          Broker &amp; operations only
        </span>
      </div>

      <div className="container-card">
        {retainerAmount > 0 && (
          <RetainerFlow
            amount={retainerAmount}
            receivedDate={transaction?.retainer_received_date}
            docsReviewedDate={transaction?.retainer_docs_reviewed_date}
            reviewedBy={transaction?.retainer_reviewed_by_name}
            paidDate={transaction?.retainer_paid_date}
            paidMethod={transaction?.retainer_paid_method}
            paidToName={transaction?.retainer_paid_to_name}
          />
        )}

        <p className="field-label text-[10px] mb-2 mt-1">Closing commission</p>
        <NarrowingFlow
          salePrice={salePrice}
          isLease={isLease}
          commissionRate={commissionRate}
          grossCommission={grossCommission}
          received={received}
          pending={pending}
          officeGross={officeGross}
          agentNet={totalAgentPayouts}
          total1099={total1099}
          brokerage30={brokerage30}
          brokerageNet={brokerageNet}
          feesRecovered={feesRecovered}
          debtsRecovered={debtsRecovered}
        />
      </div>
    </div>
  )
}

/* ── Retainer mini-flow ──────────────────────────────────────────────── */

function RetainerFlow({
  amount,
  receivedDate,
  docsReviewedDate,
  reviewedBy,
  paidDate,
  paidMethod,
  paidToName,
}: {
  amount: number
  receivedDate: string | null | undefined
  docsReviewedDate: string | null | undefined
  reviewedBy: string | null | undefined
  paidDate: string | null | undefined
  paidMethod: string | null | undefined
  paidToName: string | null | undefined
}) {
  return (
    <div className="mb-4">
      <p className="field-label text-[10px] mb-2">
        Retainer · paid independent of closing
      </p>
      <div className="bg-luxury-light rounded-lg p-2.5 grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 items-center">
        <RetainerNode
          label="Retainer received"
          value={fmt$(amount)}
          sub={receivedDate ? fmtDate(receivedDate) : 'Not yet received'}
        />
        <ArrowText>→</ArrowText>
        <RetainerNode
          label="Docs reviewed"
          value={docsReviewedDate ? 'Complete' : 'Pending'}
          sub={
            docsReviewedDate
              ? `${fmtDate(docsReviewedDate)}${reviewedBy ? ` · ${reviewedBy}` : ''}`
              : ''
          }
        />
        <ArrowText>→</ArrowText>
        <RetainerNode
          label={paidDate ? `Paid to ${paidToName || 'agent'}` : 'Paid to agent'}
          value={paidDate ? fmt$(amount) : 'Pending'}
          sub={paidDate ? `${fmtDate(paidDate)}${paidMethod ? ` · ${paidMethod}` : ''}` : ''}
          highlight={!!paidDate}
        />
      </div>
    </div>
  )
}

function RetainerNode({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  highlight?: boolean
}) {
  if (highlight) {
    return (
      <div className="bg-chart-gold-5 border border-chart-gold-7 rounded-md p-2">
        <p className="text-[9px] uppercase tracking-wider text-chart-gold-1 mb-0.5">
          {label}
        </p>
        <p className="text-xs font-medium text-white">{value}</p>
        {sub && <p className="text-[10px] text-chart-gold-1 opacity-85 mt-0.5">{sub}</p>}
      </div>
    )
  }
  return (
    <div className="bg-luxury-white border border-luxury-gray-5 rounded-md p-2">
      <p className="text-[9px] uppercase tracking-wider text-luxury-gray-3 mb-0.5">
        {label}
      </p>
      <p className="text-xs font-medium text-luxury-gray-1">{value}</p>
      {sub && <p className="text-[10px] text-luxury-gray-3 mt-0.5">{sub}</p>}
    </div>
  )
}

function ArrowText({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="text-luxury-gray-3 text-sm text-center">
      {children}
    </span>
  )
}

/* ── Narrowing SVG flow ──────────────────────────────────────────────── */

function NarrowingFlow({
  salePrice,
  isLease,
  commissionRate,
  grossCommission,
  received,
  pending,
  officeGross,
  agentNet,
  total1099,
  brokerage30,
  brokerageNet,
  feesRecovered,
  debtsRecovered,
}: {
  salePrice: number
  isLease: boolean
  commissionRate: number
  grossCommission: number
  received: number
  pending: number
  officeGross: number
  agentNet: number
  total1099: number
  brokerage30: number
  brokerageNet: number
  feesRecovered: number
  debtsRecovered: number
}) {
  return (
    <svg
      viewBox="0 0 560 420"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: 'auto' }}
      role="img"
      aria-label="Narrowing commission cash flow"
    >
      <title>Closing commission cash flow</title>
      <desc>
        {isLease ? 'Lease commission' : 'Sale price'} narrows through the
        deal to what agents receive and what the firm keeps.
      </desc>

      <defs>
        <marker
          id="arF-fin"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#888780" />
        </marker>
        <marker
          id="arR-fin"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#A68552" />
        </marker>
      </defs>

      {/* Sale / lease price */}
      <rect
        x="10"
        y="10"
        width="540"
        height="38"
        rx="6"
        fill="#EBEBEB"
        stroke="#BEBEBE"
        strokeWidth="1"
      />
      <text x="24" y="26" fontSize="10.5" fill="#5f5e5a">
        {isLease ? 'Lease amount' : 'Sale price'}
      </text>
      <text
        x="542"
        y="34"
        textAnchor="end"
        fontSize="17"
        fontWeight="500"
        fill="#1a1a1a"
      >
        {fmt$(salePrice)}
      </text>

      <path d="M270,48 L240,64 L310,64 Z" fill="#BEBEBE" opacity="0.35" />
      <text x="320" y="62" fontSize="9.5" fill="#5f5e5a">
        × {commissionRate || '--'}% commission
      </text>

      {/* Gross commission */}
      <rect
        x="40"
        y="70"
        width="480"
        height="40"
        rx="6"
        fill="#E8D4B8"
        stroke="#A68552"
        strokeWidth="1"
      />
      <text x="54" y="87" fontSize="10.5" fill="#7A5F35">
        Gross commission
      </text>
      <text
        x="512"
        y="92"
        textAnchor="end"
        fontSize="15"
        fontWeight="500"
        fill="#7A5F35"
      >
        {fmt$(grossCommission)}
      </text>
      {(received > 0 || pending > 0) && (
        <text x="54" y="103" fontSize="9" fill="#7A5F35" opacity="0.75">
          {fmt$(received)} received · {fmt$(pending)} pending
        </text>
      )}

      <path d="M278,110 L248,128 L308,128 Z" fill="#BEBEBE" opacity="0.35" />

      {/* Office gross */}
      <rect
        x="76"
        y="134"
        width="408"
        height="38"
        rx="6"
        fill="#DCC49E"
        stroke="#A68552"
        strokeWidth="1"
      />
      <text x="90" y="150" fontSize="10.5" fill="#7A5F35">
        Office gross
      </text>
      <text
        x="476"
        y="158"
        textAnchor="end"
        fontSize="15"
        fontWeight="500"
        fill="#7A5F35"
      >
        {fmt$(officeGross)}
      </text>

      <path d="M196,172 L196,208" stroke="#888780" strokeWidth="1" fill="none" />
      <path d="M360,172 L360,208" stroke="#888780" strokeWidth="1" fill="none" />

      {/* Agent 1099 gross */}
      <rect
        x="40"
        y="212"
        width="300"
        height="38"
        rx="6"
        fill="#C5A278"
        stroke="#8B6D3F"
        strokeWidth="1"
      />
      <text x="54" y="229" fontSize="10.5" fill="#F5E6D3">
        Agent 1099 gross
      </text>
      <text
        x="332"
        y="236"
        textAnchor="end"
        fontSize="14"
        fontWeight="500"
        fill="white"
      >
        {fmt$(total1099)}
      </text>

      {/* Brokerage 30% */}
      <rect
        x="360"
        y="212"
        width="160"
        height="38"
        rx="6"
        fill="#D5D5D5"
        stroke="#888888"
        strokeWidth="1"
      />
      <text x="374" y="229" fontSize="10.5" fill="#1a1a1a">
        Brokerage split
      </text>
      <text
        x="512"
        y="236"
        textAnchor="end"
        fontSize="13"
        fontWeight="500"
        fill="#1a1a1a"
      >
        {fmt$(brokerage30)}
      </text>

      {/* Fees recovered */}
      {feesRecovered > 0 && (
        <>
          <path
            d="M332,230 C380,230 410,240 440,255 L440,265"
            stroke="#A68552"
            strokeWidth="1.2"
            fill="none"
            strokeDasharray="3,2"
            markerEnd="url(#arR-fin)"
          />
          <text x="350" y="246" fontSize="9.5" fill="#7A5F35">
            − {fmt$(feesRecovered)} fees
          </text>
        </>
      )}

      {/* Debts recovered */}
      {debtsRecovered > 0 && (
        <>
          <path
            d="M332,238 C390,238 430,262 440,275 L440,285"
            stroke="#A68552"
            strokeWidth="1.2"
            fill="none"
            strokeDasharray="3,2"
            markerEnd="url(#arR-fin)"
          />
          <text x="350" y="272" fontSize="9.5" fill="#7A5F35">
            − {fmt$(debtsRecovered)} debts
          </text>
        </>
      )}

      {/* Forward arrows to terminals */}
      <path
        d="M196,250 L196,306"
        stroke="#888780"
        strokeWidth="1"
        fill="none"
        markerEnd="url(#arF-fin)"
      />
      <path
        d="M440,294 L440,306"
        stroke="#888780"
        strokeWidth="1"
        fill="none"
        markerEnd="url(#arF-fin)"
      />

      {/* Cash out to agents terminal */}
      <rect
        x="40"
        y="310"
        width="300"
        height="48"
        rx="6"
        fill="#967545"
        stroke="#7A5F35"
        strokeWidth="1"
      />
      <text x="54" y="329" fontSize="10.5" fill="#F5E6D3">
        Cash out to agents
      </text>
      <text
        x="332"
        y="336"
        textAnchor="end"
        fontSize="17"
        fontWeight="500"
        fill="white"
      >
        {fmt$(agentNet)}
      </text>
      <text x="54" y="349" fontSize="9.5" fill="#F5E6D3" opacity="0.85">
        See Commissions for per-agent breakdown
      </text>

      {/* Brokerage net terminal */}
      <rect
        x="360"
        y="310"
        width="160"
        height="48"
        rx="6"
        fill="#888888"
        stroke="#5f5e5a"
        strokeWidth="1"
      />
      <text x="374" y="329" fontSize="10.5" fill="#EBEBEB">
        Brokerage net
      </text>
      <text
        x="512"
        y="336"
        textAnchor="end"
        fontSize="17"
        fontWeight="500"
        fill="white"
      >
        {fmt$(brokerageNet)}
      </text>
      <text x="374" y="349" fontSize="9.5" fill="#EBEBEB" opacity="0.85">
        Split + fees + debts
      </text>

      {/* Legend */}
      <line
        x1="14"
        y1="400"
        x2="32"
        y2="400"
        stroke="#888780"
        strokeWidth="1"
      />
      <text x="38" y="404" fontSize="9.5" fill="#5f5e5a">
        Forward flow
      </text>
      <line
        x1="142"
        y1="400"
        x2="160"
        y2="400"
        stroke="#A68552"
        strokeWidth="1.2"
        strokeDasharray="3,2"
      />
      <text x="166" y="404" fontSize="9.5" fill="#7A5F35">
        Recovered to firm
      </text>
    </svg>
  )
}
