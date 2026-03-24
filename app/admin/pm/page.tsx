'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw, Users, Building2, Key, FileText, Banknote, Wrench } from 'lucide-react'

const pmNavItems = [
  { href: '/admin/pm/landlords', label: 'Landlords', icon: Users },
  { href: '/admin/pm/properties', label: 'Properties', icon: Building2 },
  { href: '/admin/pm/tenants', label: 'Tenants', icon: Users },
  { href: '/admin/pm/leases', label: 'Leases', icon: Key },
  { href: '/admin/pm/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/pm/disbursements', label: 'Disbursements', icon: Banknote },
  { href: '/admin/pm/repairs', label: 'Repairs', icon: Wrench },
]

export default function PMDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalLandlords: 0,
    activeLandlords: 0,
    totalProperties: 0,
    activeLeases: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    pendingDisbursements: 0,
    pendingDisbursementAmount: 0,
    completedDisbursementAmount: 0,
    incompleteSetup: 0,
  })
  const [landlords, setLandlords] = useState<any[]>([])

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [landlordsRes, propertiesRes, leasesRes, invoicesRes, disbursementsRes] =
        await Promise.all([
          fetch('/api/pm/landlords'),
          fetch('/api/pm/properties'),
          fetch('/api/pm/leases'),
          fetch('/api/pm/invoices'),
          fetch('/api/pm/disbursements'),
        ])

      const [landlordsData, propertiesData, leasesData, invoicesData, disbursementsData] =
        await Promise.all([
          landlordsRes.json(),
          propertiesRes.json(),
          leasesRes.json(),
          invoicesRes.json(),
          disbursementsRes.json(),
        ])

      const landlordsList = landlordsData.landlords || []
      const propertiesList = propertiesData.properties || []
      const leasesList = leasesData.leases || []
      const invoicesList = invoicesData.invoices || []
      const disbursementsList = disbursementsData.disbursements || []

      const pendingDisb = disbursementsList.filter((d: any) => d.payment_status === 'pending')
      const completedDisb = disbursementsList.filter((d: any) => d.payment_status === 'completed')
      const incompleteSetup = landlordsList.filter(
        (l: any) => l.w9_status !== 'completed' || l.bank_status !== 'connected'
      ).length

      setStats({
        totalLandlords: landlordsList.length,
        activeLandlords: landlordsList.filter((l: any) => l.status === 'active').length,
        totalProperties: propertiesList.length,
        activeLeases: leasesList.filter((l: any) => l.status === 'active').length,
        pendingInvoices: invoicesList.filter((i: any) => ['pending', 'sent'].includes(i.status)).length,
        overdueInvoices: invoicesList.filter((i: any) => i.status === 'overdue').length,
        pendingDisbursements: pendingDisb.length,
        pendingDisbursementAmount: pendingDisb.reduce((sum: number, d: any) => sum + (d.net_amount || 0), 0),
        completedDisbursementAmount: completedDisb.reduce((sum: number, d: any) => sum + (d.net_amount || 0), 0),
        incompleteSetup,
      })

      setLandlords(landlordsList.slice(0, 5))
    } catch (err) {
      console.error('Error loading PM dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div className="space-y-6">
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

      {/* PM Navigation */}
      <div className="flex flex-wrap gap-2">
        {pmNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="btn btn-secondary flex items-center gap-2 text-sm"
          >
            <item.icon size={14} />
            {item.label}
          </Link>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Needs Attention */}
        <div className="lg:col-span-5">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Needs Attention
            </h2>
            <div className="space-y-3">
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Pending Invoices</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {stats.pendingInvoices}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {stats.pendingInvoices === 0 ? 'No invoices awaiting payment' : `${stats.pendingInvoices} invoice(s) awaiting payment`}
                </p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Overdue Invoices</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded ${stats.overdueInvoices > 0 ? 'bg-red-100 text-red-700' : 'bg-luxury-accent/10 text-luxury-accent'}`}>
                    {stats.overdueInvoices}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {stats.overdueInvoices === 0 ? 'No overdue invoices' : `${stats.overdueInvoices} invoice(s) past due`}
                </p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Pending Disbursements</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">
                    {stats.pendingDisbursements}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  {stats.pendingDisbursements === 0 
                    ? 'No disbursements ready' 
                    : `${formatCurrency(stats.pendingDisbursementAmount)} ready to disburse`}
                </p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Incomplete Setup</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded ${stats.incompleteSetup > 0 ? 'bg-amber-100 text-amber-700' : 'bg-luxury-accent/10 text-luxury-accent'}`}>
                    {stats.incompleteSetup}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3">
                  Landlords missing W9 or bank connection
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Overview */}
        <div className="lg:col-span-7">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Overview
            </h2>
            
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Landlords</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.activeLandlords}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Properties</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.totalProperties}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Active Leases</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.activeLeases}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Disbursed</p>
                <p className="text-xl font-semibold text-luxury-accent">
                  {stats.completedDisbursementAmount >= 1000 
                    ? `$${(stats.completedDisbursementAmount / 1000).toFixed(0)}K`
                    : `$${stats.completedDisbursementAmount.toFixed(0)}`}
                </p>
              </div>
            </div>

            {/* Recent Landlords */}
            <div className="inner-card">
              <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
                Recent Landlords
              </h3>
              {landlords.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">No landlords yet</p>
              ) : (
                <div>
                  {landlords.map(landlord => (
                    <div
                      key={landlord.id}
                      className="flex items-center justify-between py-2.5 border-b border-luxury-gray-5/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {landlord.first_name} {landlord.last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {new Date(landlord.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        href={`/admin/pm/landlords/${landlord.id}`}
                        className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-center mt-4">
                <Link href="/admin/pm/landlords" className="btn btn-secondary text-sm">
                  View All Landlords
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}