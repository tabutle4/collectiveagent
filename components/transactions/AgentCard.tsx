'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import InlineField from './InlineField'
import LeadSourceField from './LeadSourceField'
import MarkPaidPanel from './MarkPaidPanel'
import EmailPreviewModal from './EmailPreviewModal'
import { LEAD_SOURCES } from '@/lib/transactions/constants'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

const fmt$ = (n: any): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(parseFloat(String(n ?? 0)) || 0)

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${
        u.preferred_last_name || u.last_name || ''
      }`.trim()
    : ''

type Plan = { id: string; plan_code: string; plan_name: string }

// Agent roles that use the full math tree (primary/listing/co + referral)
const FULL_TREE_ROLES = new Set([
  'primary_agent',
  'listing_agent',
  'co_agent',
  'referral_agent',
])

// Agent roles that are derived from a primary/listing/co via source_tia_id
const DERIVED_ROLES = new Set(['team_lead', 'momentum_partner'])

export default function AgentCard({
  tia,
  transactionId,
  transaction,
  onRefresh,
  recentlyUpdated = false,
}: {
  tia: any
  transactionId: string
  transaction: any
  onRefresh: () => void
  recentlyUpdated?: boolean
}) {
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePreview, setDeletePreview] = useState<any[]>([])
  const [deleting, setDeleting] = useState(false)
  const [unmarking, setUnmarking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [emailPreview, setEmailPreview] = useState<'statement' | 'cda' | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [showSentToast, setShowSentToast] = useState(false)

  const user = tia.user
  const membership = tia.team_membership
  const paid = tia.payment_status === 'paid'
  const role = tia.agent_role as string

  const isFullTree = FULL_TREE_ROLES.has(role)
  const isDerived = DERIVED_ROLES.has(role)
  const isLease = isLeaseTransactionType(transaction?.transaction_type)

  // Load available commission plans (for the Plan inline-edit dropdown)
  useEffect(() => {
    if (!isFullTree) return
    fetch('/api/admin/commission-plans', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => setPlans(d.plans || []))
      .catch(() => {})
  }, [isFullTree])

  const hasAllDrivers =
    (tia.agent_basis && parseFloat(tia.agent_basis) > 0) &&
    tia.commission_plan &&
    tia.lead_source

  const updateTia = useCallback(
    async (updates: Record<string, any>) => {
      setActionError(null)
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_internal_agent',
          internal_agent_id: tia.id,
          updates,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setActionError(d.error || 'Update failed')
        throw new Error(d.error || 'Update failed')
      }
      onRefresh()
    },
    [tia.id, transactionId, onRefresh]
  )

  const saveBasis = (v: string) =>
    updateTia({ agent_basis: parseFloat(v.replace(/[^0-9.-]/g, '')) || 0 })

  const savePlan = (v: string) => updateTia({ commission_plan: v })

  const saveLeadSource = async (v: {
    lead_source: string
    referred_agent_id: string | null
  }) => {
    await updateTia({
      lead_source: v.lead_source,
      referred_agent_id: v.referred_agent_id,
    })
  }

  const unmarkPaid = async () => {
    setUnmarking(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unmark_paid',
          internal_agent_id: tia.id,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Unmark failed')
      }
      onRefresh()
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setUnmarking(false)
    }
  }

  const loadDeletePreview = async () => {
    setShowDeleteConfirm(true)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_internal_agent_cascade',
          internal_agent_id: tia.id,
          preview: true,
        }),
      })
      const d = await res.json()
      setDeletePreview(d.linked_rows || [])
    } catch {
      setDeletePreview([])
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_internal_agent_cascade',
          internal_agent_id: tia.id,
          preview: false,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Delete failed')
      }
      onRefresh()
    } catch (e: any) {
      setActionError(e.message)
      setDeleting(false)
    }
  }

  const planOptions = plans.map((p) => ({
    value: p.plan_code || p.plan_name,
    label: p.plan_name,
  }))

  const displayName = fmtName(user)
  const team = membership?.team
  const teamLead = team?.team_lead
  const teamLeadName = fmtName(teamLead)
  const teamLine = team
    ? `${team.team_name || ''}${teamLeadName ? ` · lead ${teamLeadName}` : ''}`
    : null

  // Header right side — big dollar + status text
  const headerRight = () => {
    if (isDerived) {
      // derived cards show payout (agent_gross)
      return (
        <>
          <p
            className="text-xl font-semibold text-luxury-gray-1"
            style={{ lineHeight: 1 }}
          >
            {fmt$(tia.agent_gross || tia.agent_net)}
          </p>
          <p className="text-xs mt-1" style={{ color: paid ? '#3B6D11' : '#854F0B', fontWeight: 500 }}>
            {paid ? `Paid ${fmtDate(tia.payment_date)}` : 'Pending payment'}
          </p>
        </>
      )
    }

    if (!hasAllDrivers) {
      return (
        <p className="text-xs italic text-luxury-gray-3">
          Fill in the 3 fields to calculate
        </p>
      )
    }

    return (
      <>
        <p
          className="text-xl font-semibold text-luxury-gray-1"
          style={{ lineHeight: 1 }}
        >
          {fmt$(tia.agent_net)}
        </p>
        <p className="text-xs mt-1" style={{ color: paid ? '#3B6D11' : '#854F0B', fontWeight: 500 }}>
          {paid ? `Paid ${fmtDate(tia.payment_date)}` : 'Pending payment'}
        </p>
      </>
    )
  }

  // Role subtitle line
  const subtitle = () => {
    const roleLabel = String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const officeLabel = user?.office ? ` · ${user.office}` : ''
    return `${roleLabel}${officeLabel}`
  }

  // Third line: team info OR "From X · Updated"
  const tertiary = () => {
    if (isDerived && tia.source_tia_name) {
      return (
        <p className="text-xs text-luxury-gray-3 mt-1">
          From {tia.source_tia_name}
          {recentlyUpdated && (
            <span className="ml-1" style={{ color: '#854F0B', fontWeight: 600 }}>
              · Updated
            </span>
          )}
        </p>
      )
    }
    if (teamLine) {
      return <p className="text-xs text-luxury-gray-3 mt-1">{teamLine}</p>
    }
    return null
  }

  return (
    <div className="container-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-semibold text-luxury-gray-1" style={{ fontSize: '15px' }}>
            {displayName}
          </p>
          <p className="text-xs text-luxury-gray-2 mt-1">{subtitle()}</p>
          {tertiary()}
        </div>
        <div className="text-right" style={{ minWidth: '140px' }}>
          {headerRight()}
        </div>
      </div>

      {/* Body varies by role */}
      {isFullTree && <FullTreeBody
        tia={tia}
        transaction={transaction}
        paid={paid}
        hasAllDrivers={hasAllDrivers}
        planOptions={planOptions}
        saveBasis={saveBasis}
        savePlan={savePlan}
        saveLeadSource={saveLeadSource}
        updateTia={updateTia}
      />}
      {isDerived && <DerivedBody tia={tia} />}

      {/* Action row */}
      {!showMarkPaid && !showDeleteConfirm && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-luxury-gray-5">
          {/* Left cluster: Send statement / Send CDA on full-tree roles */}
          {isFullTree ? (
            <div className="flex gap-2">
              <button
                onClick={() => setEmailPreview('statement')}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
              >
                <Send size={12} />
                Send statement
              </button>
              <button
                onClick={() => setEmailPreview('cda')}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
              >
                <Send size={12} />
                Send CDA
              </button>
            </div>
          ) : (
            <p className="text-xs text-luxury-gray-3">
              {isDerived && tia.source_tia_name
                ? `Auto-calculated from ${tia.source_tia_name}.`
                : ''}
            </p>
          )}

          {/* Right cluster: destructive + edit + paid */}
          <div className="flex gap-2">
            {!isDerived && (
              <button
                onClick={loadDeletePreview}
                className="btn text-xs"
                style={{
                  background: 'white',
                  border: '1px solid #b91c1c',
                  color: '#b91c1c',
                }}
              >
                Delete
              </button>
            )}
            {paid ? (
              <button
                onClick={unmarkPaid}
                disabled={unmarking}
                className="btn btn-secondary text-xs"
              >
                {unmarking ? 'Working...' : 'Unmark paid'}
              </button>
            ) : (
              <button
                onClick={() => setShowMarkPaid(true)}
                disabled={!hasAllDrivers && isFullTree}
                className="btn btn-primary text-xs"
              >
                Mark paid
              </button>
            )}
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-xs text-red-600 mt-2">{actionError}</p>
      )}

      {showMarkPaid && (
        <MarkPaidPanel
          transactionId={transactionId}
          tia={{ ...tia, transaction_type: transaction?.transaction_type }}
          onCancel={() => setShowMarkPaid(false)}
          onMarked={() => {
            setShowMarkPaid(false)
            onRefresh()
          }}
        />
      )}

      {showDeleteConfirm && (
        <div className="inner-card mt-4">
          <p className="field-label mb-2">Confirm delete</p>
          <p className="text-xs text-luxury-gray-2 mb-2">
            This will remove {displayName} from the transaction.
          </p>
          {deletePreview.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-luxury-gray-3 mb-1">
                Also removes {deletePreview.length} linked row
                {deletePreview.length === 1 ? '' : 's'}:
              </p>
              <ul className="text-xs text-luxury-gray-3 list-disc pl-5">
                {deletePreview.map((r: any) => (
                  <li key={r.id}>
                    {String(r.agent_role).replace(/_/g, ' ')} · {fmt$(r.agent_net)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-secondary text-xs"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="btn text-xs"
              style={{
                background: '#b91c1c',
                border: '1px solid #b91c1c',
                color: 'white',
              }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {emailPreview && (
        <EmailPreviewModal
          transactionId={transactionId}
          internalAgentId={tia.id}
          emailType={emailPreview}
          onClose={() => setEmailPreview(null)}
          onSent={() => {
            setShowSentToast(true)
            setTimeout(() => setShowSentToast(false), 3000)
          }}
        />
      )}

      {showSentToast && (
        <p className="text-xs mt-2" style={{ color: '#3B6D11', fontWeight: 500 }}>
          Email sent.
        </p>
      )}
    </div>
  )
}

/* ─── Full tree body (primary / listing / co / referral) ────────────────── */

function FullTreeBody({
  tia,
  transaction,
  paid,
  hasAllDrivers,
  planOptions,
  saveBasis,
  savePlan,
  saveLeadSource,
  updateTia,
}: {
  tia: any
  transaction: any
  paid: boolean
  hasAllDrivers: boolean
  planOptions: { value: string; label: string }[]
  saveBasis: (v: string) => Promise<void>
  savePlan: (v: string) => Promise<void>
  saveLeadSource: (v: { lead_source: string; referred_agent_id: string | null }) => Promise<void>
  updateTia: (updates: Record<string, any>) => Promise<void>
}) {
  const saveFee = (field: string) => async (v: string) => {
    const n = parseFloat(v.replace(/[^0-9.-]/g, '')) || 0
    await updateTia({ [field]: n })
  }

  const leadSourceLabel =
    LEAD_SOURCES.find((s) => s.value === tia.lead_source)?.label || ''

  return (
    <div className="border-t border-luxury-gray-5 pt-3">
      {/* Driver fields */}
      <table style={{ width: '100%', fontSize: '13px', borderSpacing: 0 }}>
        <tbody>
          <tr>
            <td className="field-label" style={{ padding: '4px 0', width: '55%' }}>
              Commission basis
            </td>
            <td style={{ textAlign: 'right', padding: '4px 0' }}>
              <InlineField
                value={tia.agent_basis || 0}
                displayValue={fmt$(tia.agent_basis || 0)}
                type="currency"
                onSave={saveBasis}
                locked={paid}
                placeholder="$0.00"
              />
            </td>
          </tr>
          <tr>
            <td className="field-label" style={{ padding: '4px 0' }}>
              Commission plan
            </td>
            <td style={{ textAlign: 'right', padding: '4px 0' }}>
              <InlineField
                value={tia.commission_plan || ''}
                displayValue={tia.commission_plan || '--'}
                type="select"
                options={planOptions}
                onSave={savePlan}
                locked={paid}
                width="200px"
              />
            </td>
          </tr>
          <tr>
            <td className="field-label" style={{ padding: '4px 0' }}>
              Lead source
            </td>
            <td style={{ textAlign: 'right', padding: '4px 0' }}>
              <LeadSourceField
                leadSource={tia.lead_source}
                referredAgentId={tia.referred_agent_id}
                locked={paid}
                onSave={saveLeadSource}
                excludeAgentId={tia.agent_id}
              />
            </td>
          </tr>

          {hasAllDrivers && (
            <>
              <tr>
                <td className="field-label" style={{ padding: '4px 0' }}>
                  Split
                </td>
                <td style={{ textAlign: 'right', padding: '4px 0', color: '#555' }}>
                  {tia.split_percentage || 0}%
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0 4px', fontWeight: 600, color: '#333' }}>
                  Agent gross
                </td>
                <td style={{ textAlign: 'right', padding: '10px 0 4px', fontWeight: 600, color: '#333' }}>
                  {fmt$(tia.agent_gross)}
                </td>
              </tr>

              {parseFloat(tia.btsa_amount || 0) > 0 && (
                <tr>
                  <td className="pl-4" style={{ padding: '3px 0 3px 14px', color: '#999', fontSize: '12px' }}>
                    + BTSA from buyer
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', color: '#999', fontSize: '12px' }}>
                    <InlineField
                      value={tia.btsa_amount || 0}
                      displayValue={`+${fmt$(tia.btsa_amount || 0)}`}
                      type="currency"
                      onSave={saveFee('btsa_amount')}
                      locked={paid}
                    />
                  </td>
                </tr>
              )}
              {parseFloat(tia.processing_fee || 0) > 0 && (
                <tr>
                  <td style={{ padding: '3px 0 3px 14px', color: '#999', fontSize: '12px' }}>
                    − Processing fee
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', color: '#999', fontSize: '12px' }}>
                    <InlineField
                      value={tia.processing_fee || 0}
                      displayValue={`−${fmt$(tia.processing_fee || 0)}`}
                      type="currency"
                      onSave={saveFee('processing_fee')}
                      locked={paid}
                    />
                  </td>
                </tr>
              )}
              {parseFloat(tia.coaching_fee || 0) > 0 && (
                <tr>
                  <td style={{ padding: '3px 0 3px 14px', color: '#999', fontSize: '12px' }}>
                    − Coaching fee
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', color: '#999', fontSize: '12px' }}>
                    <InlineField
                      value={tia.coaching_fee || 0}
                      displayValue={`−${fmt$(tia.coaching_fee || 0)}`}
                      type="currency"
                      onSave={saveFee('coaching_fee')}
                      locked={paid}
                    />
                  </td>
                </tr>
              )}
              {parseFloat(tia.other_fees || 0) > 0 && (
                <tr>
                  <td style={{ padding: '3px 0 3px 14px', color: '#999', fontSize: '12px' }}>
                    − {tia.other_fees_description || 'Other fees'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', color: '#999', fontSize: '12px' }}>
                    <InlineField
                      value={tia.other_fees || 0}
                      displayValue={`−${fmt$(tia.other_fees || 0)}`}
                      type="currency"
                      onSave={saveFee('other_fees')}
                      locked={paid}
                    />
                  </td>
                </tr>
              )}
              {parseFloat(tia.team_lead_commission || 0) > 0 && (
                <tr>
                  <td style={{ padding: '3px 0 3px 14px', color: '#999', fontSize: '12px', fontStyle: 'italic' }}>
                    Team lead payout (informational)
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', color: '#999', fontSize: '12px', fontStyle: 'italic' }}>
                    {fmt$(tia.team_lead_commission)}
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>

      {hasAllDrivers && (
        <>
          <div className="flex justify-between pt-3 mt-3 border-t border-luxury-gray-5">
            <span className="text-sm font-semibold text-luxury-gray-1">Agent net</span>
            <span className="text-sm font-semibold text-luxury-gray-1">{fmt$(tia.agent_net)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-xs text-luxury-gray-2">1099 reportable</span>
            <span className="text-xs text-luxury-gray-2">
              {fmt$(tia.amount_1099_reportable)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Derived body (team_lead / momentum_partner) ──────────────────────── */

function DerivedBody({ tia }: { tia: any }) {
  const isTL = tia.agent_role === 'team_lead'
  return (
    <div className="border-t border-luxury-gray-5 pt-3">
      <table style={{ width: '100%', fontSize: '13px', borderSpacing: 0 }}>
        <tbody>
          {isTL ? (
            <>
              <tr>
                <td className="field-label" style={{ padding: '4px 0', width: '55%' }}>
                  Primary's basis
                </td>
                <td style={{ textAlign: 'right', padding: '4px 0', color: '#333' }}>
                  {fmt$(tia.agent_basis || 0)}
                </td>
              </tr>
              <tr>
                <td className="field-label" style={{ padding: '4px 0' }}>
                  Team lead %
                </td>
                <td style={{ textAlign: 'right', padding: '4px 0', color: '#555' }}>
                  {tia.split_percentage || 0}%
                </td>
              </tr>
            </>
          ) : (
            <tr>
              <td className="field-label" style={{ padding: '4px 0', width: '55%' }}>
                Momentum referral fee
              </td>
              <td style={{ textAlign: 'right', padding: '4px 0', color: '#333' }}>
                {fmt$(tia.agent_gross || tia.agent_net)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex justify-between pt-3 mt-3 border-t border-luxury-gray-5">
        <span className="text-sm font-semibold text-luxury-gray-1">Payout</span>
        <span className="text-sm font-semibold text-luxury-gray-1">
          {fmt$(tia.agent_gross || tia.agent_net)}
        </span>
      </div>
      <div className="flex justify-between pt-1">
        <span className="text-xs text-luxury-gray-2">1099 reportable</span>
        <span className="text-xs text-luxury-gray-2">
          {fmt$(tia.amount_1099_reportable || tia.agent_gross || tia.agent_net)}
        </span>
      </div>
    </div>
  )
}
