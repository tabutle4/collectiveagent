'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

interface EnrichedProperty {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  unit_count: number | null
  landlord_id: string | null
  landlordName: string
  tenantName: string
  monthlyRent: number | null
  leaseEnd: string | null
  lastNetDisbursed: number | null
  heldInTrust: number
}

interface DashboardStats {
  activeLandlords: number
  activeProperties: number
  activeTenants: number
  activeLeases: number
  overdueInvoices: number
  tenantOverdueInvoices: number
  landlordOverdueInvoices: number
  pendingDisbursements: number
  pendingDisbursementAmount: number
  pendingStatements: number
  activeRepairs: number
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (s: string | null) => {
  if (!s) return '--'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PMDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    activeLandlords: 0,
    activeProperties: 0,
    activeTenants: 0,
    activeLeases: 0,
    overdueInvoices: 0,
    tenantOverdueInvoices: 0,
    landlordOverdueInvoices: 0,
    pendingDisbursements: 0,
    pendingDisbursementAmount: 0,
    pendingStatements: 0,
    activeRepairs: 0,
  })
  const [properties, setProperties] = useState<EnrichedProperty[]>([])
  const [recentLandlords, setRecentLandlords] = useState<any[]>([])
  const [recentTenants, setRecentTenants] = useState<any[]>([])

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [
        propertiesRes, landlordsRes, tenantsRes, leasesRes,
        invoicesRes, landlordInvoicesRes, disbursementsRes,
        statementsRes, repairsRes,
      ] = await Promise.all([
        fetch('/api/pm/properties'),
        fetch('/api/pm/landlords'),
        fetch('/api/pm/tenants'),
        fetch('/api/pm/leases'),
        fetch('/api/pm/invoices'),
        fetch('/api/pm/landlord-invoices'),
        fetch('/api/pm/disbursements'),
        fetch('/api/pm/statements'),
        fetch('/api/pm/repair-requests'),
      ])

      const [
        propertiesData, landlordsData, tenantsData, leasesData,
        invoicesData, landlordInvoicesData, disbursementsData,
        statementsData, repairsData,
      ] = await Promise.all([
        propertiesRes.json(), landlordsRes.json(), tenantsRes.json(), leasesRes.json(),
        invoicesRes.json(), landlordInvoicesRes.json(), disbursementsRes.json(),
        statementsRes.json(), repairsRes.json(),
      ])

      const propertiesList: any[] = propertiesData.properties || []
      const landlordsList: any[] = landlordsData.landlords || []
      const tenantsList: any[] = tenantsData.tenants || []
      const leasesList: any[] = leasesData.leases || []
      const invoicesList: any[] = invoicesData.invoices || []
      const landlordInvoicesStats = landlordInvoicesData.stats || {}
      const disbursementsList: any[] = disbursementsData.disbursements || []
      const statementsList: any[] = statementsData.statements || []
      const repairsList: any[] = repairsData.repairs || []

      // Last statement per property
      const lastStatementByProperty: Record<string, any> = {}
      statementsList.forEach((s: any) => {
        const pid = s.property_id
        if (!pid) return
        const cur = lastStatementByProperty[pid]
        if (!cur || new Date(s.statement_date) > new Date(cur.statement_date)) {
          lastStatementByProperty[pid] = s
        }
      })

      // Overdue invoices
      // Tenant invoices: status is stored as 'overdue'
      // Landlord invoices: overdue is pre-computed server-side (not a stored status)
      const tenantOverdue = invoicesList.filter((i: any) => i.status === 'overdue').length
      const landlordOverdue = Number(landlordInvoicesStats.overdue ?? 0)

      // Pending disbursements
      const pendingDisb = disbursementsList.filter((d: any) => d.payment_status === 'pending')

      setStats({
        activeLandlords: landlordsList.filter((l: any) => l.status === 'active').length,
        activeProperties: propertiesList.filter((p: any) => p.status === 'active').length,
        activeTenants: tenantsList.filter((t: any) => t.status === 'active').length,
        activeLeases: leasesList.filter((l: any) => l.status === 'active').length,
        overdueInvoices: tenantOverdue + landlordOverdue,
        tenantOverdueInvoices: tenantOverdue,
        landlordOverdueInvoices: landlordOverdue,
        pendingDisbursements: pendingDisb.length,
        pendingDisbursementAmount: pendingDisb.reduce((sum: number, d: any) => sum + Number(d.net_amount || 0), 0),
        pendingStatements: statementsList.filter((s: any) => !s.sent_at).length,
        // Terminal statuses are 'completed' and 'cancelled' per STATUS_OPTIONS in repairs/[id]/page.tsx
        activeRepairs: repairsList.filter((r: any) => !['completed', 'cancelled'].includes(r.status)).length,
      })

      // Recent landlords and tenants (5 most recent each)
      setRecentLandlords(
        [...landlordsList]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
      )
      setRecentTenants(
        [...tenantsList]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
      )

      // Enriched properties (active only)
      // Properties API joins landlords and pm_leases[tenants] -- no extra lookups needed
      const activeProps = propertiesList.filter((p: any) => p.status === 'active')

      // Batch held-in-trust calls in parallel
      const trustResults = await Promise.all(
        activeProps.map(async (p: any) => {
          if (!p.landlord_id) return { propertyId: p.id, heldInTrust: 0 }
          try {
            const r = await fetch(`/api/pm/held-in-trust?landlord_id=${p.landlord_id}&property_id=${p.id}`)
            const d = await r.json()
            return { propertyId: p.id, heldInTrust: Number(d.heldInTrust ?? 0) }
          } catch {
            return { propertyId: p.id, heldInTrust: 0 }
          }
        })
      )
      const trustMap: Record<string, number> = {}
      trustResults.forEach(t => { trustMap[t.propertyId] = t.heldInTrust })

      const enriched: EnrichedProperty[] = activeProps.map((p: any) => {
        const activeLease = (p.pm_leases || []).find((l: any) => l.status === 'active')
        const tenant = activeLease?.tenants
        const lastStatement = lastStatementByProperty[p.id]
        return {
          id: p.id,
          property_address: p.property_address,
          unit: p.unit || null,
          city: p.city || '',
          state: p.state || '',
          unit_count: p.unit_count || null,
          landlord_id: p.landlord_id,
          landlordName: p.landlords
            ? `${p.landlords.first_name} ${p.landlords.last_name}`
            : '--',
          tenantName: tenant
            ? `${tenant.first_name} ${tenant.last_name}`
            : '--',
          monthlyRent: activeLease ? Number(activeLease.monthly_rent) : null,
          leaseEnd: activeLease?.lease_end || null,
          lastNetDisbursed: lastStatement ? Number(lastStatement.total_net_disbursed) : null,
          heldInTrust: trustMap[p.id] ?? 0,
        }
      })

      setProperties(enriched)
    } catch (err) {
      console.error('Error loading PM dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">Property Management</h1>
        <button
          onClick={loadDashboard}
          className="btn btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Section 1: Properties */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Properties
        </h2>
        {loading ? (
          <p className="text-sm text-luxury-gray-3 text-center py-8">Loading...</p>
        ) : properties.length === 0 ? (
          <p className="text-sm text-luxury-gray-3 text-center py-8">No active properties</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {properties.map(p => (
              <Link
                key={p.id}
                href={`/admin/pm/properties/${p.id}`}
                className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
              >
                {/* Address row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 leading-tight">
                      {p.property_address}{p.unit ? ` ${p.unit}` : ''}
                    </p>
                    <p className="text-xs text-luxury-gray-3 mt-0.5">
                      {p.city}{p.state ? `, ${p.state}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {p.unit_count !== null && (
                      <span className="text-xs text-luxury-gray-3">
                        {p.unit_count} {p.unit_count === 1 ? 'unit' : 'units'}
                      </span>
                    )}
                    <span className="badge badge-accent">Active</span>
                  </div>
                </div>

                {/* Data grid: 2 columns, 3 rows */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <p className="text-xs text-luxury-gray-3">Landlord</p>
                    <p className="text-xs font-medium text-luxury-gray-1 truncate">{p.landlordName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Tenant</p>
                    <p className="text-xs font-medium text-luxury-gray-1 truncate">{p.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Monthly Rent</p>
                    <p className="text-xs font-medium text-luxury-gray-1">
                      {p.monthlyRent !== null ? formatCurrency(p.monthlyRent) : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Lease Ends</p>
                    <p className="text-xs font-medium text-luxury-gray-1">{fmtDate(p.leaseEnd)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Last Net</p>
                    <p className="text-xs font-medium text-luxury-accent">
                      {p.lastNetDisbursed !== null ? formatCurrency(p.lastNetDisbursed) : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Held in Trust</p>
                    <p className="text-xs font-medium text-luxury-gray-1">{formatCurrency(p.heldInTrust)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-luxury-gray-5/50">
          <Link
            href="/admin/pm/properties"
            className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
          >
            View All Properties
          </Link>
        </div>
      </div>

      {/* Section 2: Needs Attention */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Needs Attention
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/admin/pm/invoices"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-luxury-gray-1">Overdue Invoices</p>
              <span className={`badge ${stats.overdueInvoices > 0 ? 'badge-error' : 'badge-accent'}`}>
                {stats.overdueInvoices}
              </span>
            </div>
            <p className="text-xs text-luxury-gray-3">
              {stats.overdueInvoices === 0
                ? 'No overdue invoices'
                : [
                    stats.tenantOverdueInvoices > 0 ? `${stats.tenantOverdueInvoices} tenant` : null,
                    stats.landlordOverdueInvoices > 0 ? `${stats.landlordOverdueInvoices} landlord` : null,
                  ].filter(Boolean).join(' · ')}
            </p>
          </Link>

          <Link
            href="/admin/pm/disbursements"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-luxury-gray-1">Pending Disbursements</p>
              <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                {stats.pendingDisbursements}
              </span>
            </div>
            <p className="text-xs text-luxury-gray-3">
              {stats.pendingDisbursements === 0
                ? 'No disbursements pending'
                : `${formatCurrency(stats.pendingDisbursementAmount)} ready to disburse`}
            </p>
          </Link>

          <Link
            href="/admin/pm/statements"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-luxury-gray-1">Pending Statements</p>
              <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                {stats.pendingStatements}
              </span>
            </div>
            <p className="text-xs text-luxury-gray-3">
              {stats.pendingStatements === 0
                ? 'All statements sent'
                : `${stats.pendingStatements} draft statement(s) not yet sent`}
            </p>
          </Link>

          <Link
            href="/admin/pm/repairs"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-luxury-gray-1">Active Repairs</p>
              <span className={`badge ${stats.activeRepairs > 0 ? 'badge-warning' : 'badge-accent'}`}>
                {stats.activeRepairs}
              </span>
            </div>
            <p className="text-xs text-luxury-gray-3">
              {stats.activeRepairs === 0
                ? 'No open repair requests'
                : `${stats.activeRepairs} repair request(s) open`}
            </p>
          </Link>
        </div>
      </div>

      {/* Section 3: Overview */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Overview
        </h2>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Link
            href="/admin/pm/landlords"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Landlords</p>
            <p className="text-2xl font-semibold text-luxury-accent">{stats.activeLandlords}</p>
          </Link>
          <Link
            href="/admin/pm/properties"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Properties</p>
            <p className="text-2xl font-semibold text-luxury-accent">{stats.activeProperties}</p>
          </Link>
          <Link
            href="/admin/pm/tenants"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Tenants</p>
            <p className="text-2xl font-semibold text-luxury-accent">{stats.activeTenants}</p>
          </Link>
          <Link
            href="/admin/pm/leases"
            className="inner-card block hover:border-luxury-accent/40 active:opacity-90 transition-colors"
          >
            <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Leases</p>
            <p className="text-2xl font-semibold text-luxury-accent">{stats.activeLeases}</p>
          </Link>
        </div>

        {/* Recent Landlords + Tenants side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Recent Landlords */}
          <div className="inner-card">
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
              Recent Landlords
            </h3>
            {recentLandlords.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-4">No landlords yet</p>
            ) : (
              recentLandlords.map(l => (
                <Link
                  key={l.id}
                  href={`/admin/pm/landlords/${l.id}`}
                  className="flex items-center justify-between py-3 border-b border-luxury-gray-5/50 last:border-0 hover:bg-luxury-light active:opacity-80 transition-colors rounded-sm -mx-1 px-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {l.first_name} {l.last_name}
                    </p>
                    <p className="text-xs text-luxury-gray-3 truncate">
                      {l.email || new Date(l.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="btn btn-secondary text-xs py-1.5 px-3 ml-3 flex-shrink-0">
                    View
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Recent Tenants */}
          <div className="inner-card">
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
              Recent Tenants
            </h3>
            {recentTenants.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-4">No tenants yet</p>
            ) : (
              recentTenants.map(t => (
                <Link
                  key={t.id}
                  href={`/admin/pm/tenants/${t.id}`}
                  className="flex items-center justify-between py-3 border-b border-luxury-gray-5/50 last:border-0 hover:bg-luxury-light active:opacity-80 transition-colors rounded-sm -mx-1 px-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {t.first_name} {t.last_name}
                    </p>
                    <p className="text-xs text-luxury-gray-3 truncate">
                      {t.email || new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="btn btn-secondary text-xs py-1.5 px-3 ml-3 flex-shrink-0">
                    View
                  </span>
                </Link>
              ))
            )}
          </div>

        </div>
      </div>

    </div>
  )
}