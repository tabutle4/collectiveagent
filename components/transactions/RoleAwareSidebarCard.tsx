'use client'

/**
 * Role-aware sidebar card that sits above the existing Primary Agent card.
 * Four variants based on the viewer's role:
 *
 *   admin / operations → "Processing"   (debts, CDA, compliance, statements)
 *   broker             → "Approvals"    (CDA sign, exceptions, broker reviews)
 *   tc                 → "Compliance"   (docs awaiting review, queue)
 *   agent              → "Your payout"  (amount or pending broker review)
 *
 * This is a display-only card — all actions live on the main page in their
 * proper sections. The card summarizes state so the viewer knows at a
 * glance what needs attention on this deal.
 */

import type { AppRole } from '@/lib/transactions/role'

const fmt$ = (n: any): string => {
  const v = parseFloat(String(n ?? 0)) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v)
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '--'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '--'
  }
}

export default function RoleAwareSidebarCard({
  role,
  transaction,
  agents,
  checks,
  currentUserId,
}: {
  role: AppRole
  transaction: any
  agents: any[]
  checks: any[]
  currentUserId: string | null
}) {
  if (role === 'agent') {
    return <YourPayoutCard transaction={transaction} agents={agents} currentUserId={currentUserId} />
  }
  if (role === 'tc') {
    return <ComplianceCard transaction={transaction} />
  }
  if (role === 'broker') {
    return <ApprovalsCard transaction={transaction} />
  }
  return <ProcessingCard transaction={transaction} agents={agents} checks={checks} />
}

/* ── Admin / operations: Processing ──────────────────────────────────── */

function ProcessingCard({
  transaction,
  agents,
  checks,
}: {
  transaction: any
  agents: any[]
  checks: any[]
}) {
  const debtsToRecover = agents.reduce(
    (s: number, a: any) => s + (parseFloat(a.debts_deducted || 0) || 0),
    0
  )
  const totalExpected = checks.reduce(
    (s: number, c: any) => s + (parseFloat(c.amount || c.check_amount || 0) || 0),
    0
  )
  const totalReceived = checks.reduce(
    (s: number, c: any) =>
      s +
      (c.deposited_date || c.cleared_date
        ? parseFloat(c.amount || c.check_amount || 0) || 0
        : 0),
    0
  )
  const checkBalance = totalExpected - totalReceived
  const released = !!transaction?.released_to_agent_at

  return (
    <SidebarCardShell title="Processing">
      <StatHeader
        value={fmt$(debtsToRecover)}
        sub="debts to recover"
      />
      <Row
        label="CDA"
        value={transaction?.cda_sent_date ? `Sent ${fmtDate(transaction.cda_sent_date)}` : 'Not sent'}
      />
      <Row
        label="Compliance"
        value={
          transaction?.compliance_complete_date
            ? 'Complete'
            : transaction?.compliance_status || 'Not requested'
        }
      />
      <Row label="Statements" value={released ? 'Released' : 'Not released'} />
      <Row
        label="CRC transfer"
        value={checks.some((c: any) => c.crc_transferred) ? 'Yes' : 'No'}
      />
      <Row label="Check balance" value={fmt$(checkBalance)} />
    </SidebarCardShell>
  )
}

/* ── Broker: Approvals ───────────────────────────────────────────────── */

function ApprovalsCard({ transaction }: { transaction: any }) {
  return (
    <SidebarCardShell title="Approvals">
      <Row
        label="CDA signature"
        value={
          transaction?.cda_broker_signed_at
            ? `Signed ${fmtDate(transaction.cda_broker_signed_at)}`
            : transaction?.cda_sent_date
            ? 'Awaiting'
            : 'Not requested'
        }
      />
      <Row
        label="Broker review"
        value={
          transaction?.compliance_status === 'broker_review'
            ? 'Pending'
            : transaction?.compliance_status === 'approved'
            ? 'Approved'
            : 'Not pending'
        }
      />
      <Row
        label="Exceptions"
        value={transaction?.exception_flagged ? 'Flagged' : 'None'}
      />
    </SidebarCardShell>
  )
}

/* ── TC: Compliance ──────────────────────────────────────────────────── */

function ComplianceCard({ transaction }: { transaction: any }) {
  return (
    <SidebarCardShell title="Compliance">
      <Row
        label="Status"
        value={
          transaction?.compliance_complete_date
            ? 'Complete'
            : transaction?.compliance_status || 'Not requested'
        }
      />
      <Row
        label="Submitted"
        value={transaction?.compliance_submitted_date ? fmtDate(transaction.compliance_submitted_date) : '--'}
      />
      <Row
        label="Complete"
        value={transaction?.compliance_complete_date ? fmtDate(transaction.compliance_complete_date) : '--'}
      />
    </SidebarCardShell>
  )
}

/* ── Agent: Your payout ──────────────────────────────────────────────── */

function YourPayoutCard({
  transaction,
  agents,
  currentUserId,
}: {
  transaction: any
  agents: any[]
  currentUserId: string | null
}) {
  const mine = currentUserId
    ? agents.find((a: any) => a.agent_id === currentUserId)
    : null
  const released = !!transaction?.released_to_agent_at
  const paid = mine?.payment_status === 'paid'

  if (!released) {
    return (
      <SidebarCardShell title="Your payout">
        <div className="py-1">
          <p className="text-sm font-medium text-luxury-gray-1">Pending broker review</p>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Your commission statement and CDA will be available once your broker releases the transaction.
          </p>
        </div>
      </SidebarCardShell>
    )
  }

  if (!mine) {
    return (
      <SidebarCardShell title="Your payout">
        <p className="text-xs text-luxury-gray-3">You are not a paid agent on this transaction.</p>
      </SidebarCardShell>
    )
  }

  return (
    <SidebarCardShell title="Your payout">
      <StatHeader
        value={fmt$(mine.agent_net)}
        sub={paid ? `Paid ${fmtDate(mine.payment_date)}` : 'Pending payment'}
      />
      <Row label="Role" value={(mine.agent_role || '').replace(/_/g, ' ')} />
      <Row label="1099" value={fmt$(mine.amount_1099_reportable)} />
      {mine.payment_method && <Row label="Method" value={mine.payment_method} />}
    </SidebarCardShell>
  )
}

/* ── Shared building blocks ──────────────────────────────────────────── */

function SidebarCardShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="container-card">
      <p className="field-label mb-2 flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full bg-chart-gold-5 inline-block" />
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function StatHeader({ value, sub }: { value: React.ReactNode; sub: string }) {
  return (
    <div className="mb-2 pb-2 border-b border-luxury-gray-5">
      <p className="text-lg font-medium text-luxury-gray-1">{value}</p>
      <p className="text-[10px] text-luxury-gray-3">{sub}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-luxury-gray-3 text-[10.5px] capitalize">{label}</span>
      <span className="text-luxury-gray-1 text-[10.5px] font-medium text-right">
        {value}
      </span>
    </div>
  )
}
