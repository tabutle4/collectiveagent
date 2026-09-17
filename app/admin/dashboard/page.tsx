'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'
import OwnerDashboard from '@/components/dashboard/OwnerDashboard'
import ProductionCharts from '@/components/dashboard/ProductionCharts'

export default function AdminDashboard() {
  const router = useRouter()
  const { user, hasPermission } = useAuth()

  // ── View resolver ─────────────────────────────────────────────────────
  // Three registered views: owner (Courtney's queue-first page), ops, and
  // admin (ops/admin are today's dashboard, registered as two views —
  // identical until designed apart). Default by role: broker → owner,
  // everyone else → ops (falling back to admin when ops isn't held).
  // ?view=owner|ops|admin overrides, but only into views the user holds
  // permission for.
  type DashboardView = 'owner' | 'ops' | 'admin'
  const heldViews: DashboardView[] = ([
    hasPermission('can_view_owner_dashboard') ? 'owner' : null,
    hasPermission('can_view_ops_dashboard') ? 'ops' : null,
    hasPermission('can_view_admin_dashboard') ? 'admin' : null,
  ].filter(Boolean) as DashboardView[])
  const defaultView: DashboardView =
    (user?.role || '').toLowerCase() === 'broker' && heldViews.includes('owner')
      ? 'owner'
      : heldViews.includes('ops')
        ? 'ops'
        : heldViews.includes('admin')
          ? 'admin'
          : heldViews[0] || 'admin'
  const [view, setView] = useState<DashboardView | null>(null)
  useEffect(() => {
    if (!user) return
    const param = new URLSearchParams(window.location.search).get('view')
    if (
      (param === 'owner' || param === 'ops' || param === 'admin') &&
      heldViews.includes(param)
    ) {
      setView(param)
    } else {
      setView(defaultView)
    }
    // Resolve once the auth context has the user; heldViews derives from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  const switchView = (v: DashboardView) => {
    setView(v)
    const params = new URLSearchParams(window.location.search)
    params.set('view', v)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }
  const VIEW_LABELS: Record<DashboardView, string> = {
    owner: 'Broker view',
    ops: 'Ops view',
    admin: 'Admin view',
  }
  const viewPill =
    heldViews.length > 1 ? (
      <button
        onClick={() => {
          const idx = heldViews.indexOf((view || defaultView) as DashboardView)
          switchView(heldViews[(idx + 1) % heldViews.length])
        }}
        className="flex items-center gap-1.5 text-xs font-medium bg-[#F5EDE2] text-luxury-accent px-2.5 py-1 rounded-full flex-shrink-0"
        title="Switch dashboard view"
      >
        <Crown size={12} /> {VIEW_LABELS[(view || defaultView) as DashboardView]}
      </button>
    ) : null

  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAttention, setNeedsAttention] = useState({ complianceRequested: 0, cdaNeeded: 0, brokerApprovalPending: 0, eligibleForPayout: 0 })
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [allAgentRows, setAllAgentRows] = useState<any[]>([])
  const [complianceRequestTxnIds, setComplianceRequestTxnIds] = useState<string[]>([])

  const canViewFinancials = hasPermission('can_view_dashboard_financials')

  useEffect(() => {
    fetchProspects()
    fetchTransactionData()
  }, [])

  const fetchProspects = async () => {
    try {
      const response = await fetch('/api/prospects')
      const data = await response.json()
      setProspects(data.prospects || [])
    } catch (error) {
      console.error('Error fetching prospects:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactionData = async () => {
    try {
      const res = await fetch('/api/dashboard/transactions')
      if (!res.ok) throw new Error('Failed to fetch transaction data')
      const data = await res.json()
      setAllTransactions(data.transactions || [])
      setAllAgentRows(data.agentRows || [])
      setNeedsAttention(data.needsAttention || { complianceRequested: 0, cdaNeeded: 0, brokerApprovalPending: 0, eligibleForPayout: 0 })
      setComplianceRequestTxnIds(data.complianceRequestTxnIds || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  // prospect_status, not status. /api/prospects returns only rows where
  // status='prospect', so every row matched neither 'new' nor 'contacted' and
  // both tiles read zero from the day they shipped. prospect_status is the
  // real column (default 'new') and is what /admin/prospects already reads.
  const stats = {
    new: prospects.filter(p => (p.prospect_status || 'new') === 'new').length,
    contacted: prospects.filter(p => p.prospect_status === 'contacted').length,
    total: prospects.length,
  }

  const recentProspects = prospects.slice(0, 5)

  if (loading || view === null) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  // Owner view — Courtney's queue-first page. Ops and admin fall through to
  // today's dashboard content below (registered as two views, identical
  // until designed apart).
  if (view === 'owner') {
    return (
      <OwnerDashboard
        firstName={user?.preferred_first_name || user?.first_name || ''}
        viewPill={viewPill}
        userId={user?.id}
        canViewFinancials={canViewFinancials}
      />
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <h1 className="page-title">DASHBOARD</h1>
        {viewPill}
      </div>

      {/* Production charts - shared with the broker dashboard so the two
          views cannot disagree about the same quarter. */}
      <ProductionCharts
        transactions={allTransactions}
        agentRows={allAgentRows}
        complianceRequestTxnIds={complianceRequestTxnIds}
        canViewFinancials={canViewFinancials}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Needs Attention
            </h2>
            <div className="space-y-3">
              <div className="inner-card cursor-pointer hover:border-luxury-gray-3" onClick={() => router.push('/admin/compliance')}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Compliance Requested</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {needsAttention.complianceRequested}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {needsAttention.complianceRequested === 0
                    ? 'No transactions awaiting compliance review'
                    : `${needsAttention.complianceRequested} transaction${needsAttention.complianceRequested === 1 ? '' : 's'} awaiting compliance review`}
                </p>
              </div>
              <div className="inner-card cursor-pointer hover:border-luxury-gray-3" onClick={() => router.push('/admin/compliance')}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Approved - CDA Needed</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {needsAttention.cdaNeeded}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {needsAttention.cdaNeeded === 0
                    ? 'No transactions ready for CDA'
                    : `${needsAttention.cdaNeeded} sale${needsAttention.cdaNeeded === 1 ? '' : 's'} with compliance complete, CDA not sent`}
                </p>
              </div>
              <div className="inner-card cursor-pointer hover:border-luxury-gray-3" onClick={() => router.push('/transactions?funding=matched')}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Eligible for Payout</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {needsAttention.eligibleForPayout}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {needsAttention.eligibleForPayout === 0
                    ? 'No transactions eligible for payout'
                    : `${needsAttention.eligibleForPayout} deal${needsAttention.eligibleForPayout === 1 ? '' : 's'} with check received, compliance complete, checklist done`}
                </p>
              </div>
              <div className="inner-card cursor-pointer hover:border-luxury-gray-3" onClick={() => router.push('/admin/compliance')}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">
                    Broker Approval Pending
                  </p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {needsAttention.brokerApprovalPending}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {needsAttention.brokerApprovalPending === 0
                    ? 'No CDAs awaiting broker approval'
                    : `${needsAttention.brokerApprovalPending} CDA${needsAttention.brokerApprovalPending === 1 ? '' : 's'} sent for approval, not yet approved`}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">New Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.new}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Contacted</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.contacted}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Total Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
              </div>
            </div>
            <div className="inner-card mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-luxury-gray-1">Contact Submissions</p>
                <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                  0
                </span>
              </div>
              <p className="text-xs text-luxury-gray-3 mb-2">No new contact submissions</p>
              <Link
                href="/admin/contact-submissions"
                className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
              >
                View all submissions
              </Link>
            </div>
            <div className="inner-card">
              <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
                Recent Activity
              </h3>
              {recentProspects.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">No prospects yet</p>
              ) : (
                <div>
                  {recentProspects.map(prospect => (
                    <div
                      key={prospect.id}
                      className="flex items-center justify-between py-2.5 border-b border-luxury-gray-5/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {prospect.preferred_first_name} {prospect.preferred_last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {new Date(prospect.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        href={`/admin/prospects/${prospect.id}`}
                        className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-center mt-4">
                <Link href="/admin/prospects" className="btn btn-secondary text-sm">
                  View All Prospects
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}