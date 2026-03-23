'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  Users,
  Home,
  FileText,
  DollarSign,
  AlertCircle,
  Plus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

interface DashboardStats {
  totalLandlords: number
  activeLandlords: number
  totalTenants: number
  totalProperties: number
  activeLeases: number
  pendingInvoices: number
  overdueInvoices: number
  pendingDisbursements: number
  pendingDisbursementAmount: number
}

interface RecentActivity {
  id: string
  type: 'landlord' | 'tenant' | 'lease' | 'invoice' | 'disbursement'
  description: string
  date: string
}

export default function PMDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    totalLandlords: 0,
    activeLandlords: 0,
    totalTenants: 0,
    totalProperties: 0,
    activeLeases: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    pendingDisbursements: 0,
    pendingDisbursementAmount: 0,
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      // Load all stats in parallel
      const [
        landlordsRes,
        tenantsRes,
        propertiesRes,
        leasesRes,
        invoicesRes,
        disbursementsRes,
      ] = await Promise.all([
        fetch('/api/pm/landlords'),
        fetch('/api/pm/tenants'),
        fetch('/api/pm/properties'),
        fetch('/api/pm/leases'),
        fetch('/api/pm/invoices'),
        fetch('/api/pm/disbursements'),
      ])

      const [landlords, tenants, properties, leases, invoices, disbursements] =
        await Promise.all([
          landlordsRes.json(),
          tenantsRes.json(),
          propertiesRes.json(),
          leasesRes.json(),
          invoicesRes.json(),
          disbursementsRes.json(),
        ])

      const landlordsList = landlords.landlords || []
      const tenantsList = tenants.tenants || []
      const propertiesList = properties.properties || []
      const leasesList = leases.leases || []
      const invoicesList = invoices.invoices || []
      const disbursementsList = disbursements.disbursements || []

      setStats({
        totalLandlords: landlordsList.length,
        activeLandlords: landlordsList.filter((l: any) => l.status === 'active').length,
        totalTenants: tenantsList.length,
        totalProperties: propertiesList.length,
        activeLeases: leasesList.filter((l: any) => l.status === 'active').length,
        pendingInvoices: invoicesList.filter(
          (i: any) => i.status === 'pending' || i.status === 'sent'
        ).length,
        overdueInvoices: invoicesList.filter((i: any) => i.status === 'overdue').length,
        pendingDisbursements: disbursementsList.filter(
          (d: any) => d.payment_status === 'pending'
        ).length,
        pendingDisbursementAmount: disbursementsList
          .filter((d: any) => d.payment_status === 'pending')
          .reduce((sum: number, d: any) => sum + (d.net_amount || 0), 0),
      })

      // Build recent activity from the most recent items
      const activities: RecentActivity[] = []

      landlordsList.slice(0, 3).forEach((l: any) => {
        activities.push({
          id: l.id,
          type: 'landlord',
          description: `Landlord: ${l.first_name} ${l.last_name}`,
          date: l.created_at,
        })
      })

      invoicesList
        .filter((i: any) => i.status === 'paid')
        .slice(0, 3)
        .forEach((i: any) => {
          activities.push({
            id: i.id,
            type: 'invoice',
            description: `Payment received: $${i.paid_amount?.toFixed(2) || i.total_amount?.toFixed(2)}`,
            date: i.paid_at || i.created_at,
          })
        })

      disbursementsList
        .filter((d: any) => d.payment_status === 'completed')
        .slice(0, 3)
        .forEach((d: any) => {
          activities.push({
            id: d.id,
            type: 'disbursement',
            description: `Disbursement sent: $${d.net_amount?.toFixed(2)}`,
            date: d.payment_date || d.created_at,
          })
        })

      // Sort by date and take top 5
      activities.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      setRecentActivity(activities.slice(0, 5))
    } catch (err) {
      console.error('Error loading PM dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'landlord':
        return <Users size={14} />
      case 'tenant':
        return <Users size={14} />
      case 'lease':
        return <FileText size={14} />
      case 'invoice':
        return <DollarSign size={14} />
      case 'disbursement':
        return <DollarSign size={14} />
      default:
        return <FileText size={14} />
    }
  }

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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/admin/pm/landlords" className="container-card hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Users size={16} className="text-blue-600" />
            </div>
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Landlords</p>
          </div>
          <p className="text-2xl font-semibold text-luxury-gray-1">{stats.totalLandlords}</p>
          <p className="text-xs text-luxury-gray-3 mt-1">{stats.activeLandlords} active</p>
        </Link>

        <Link href="/admin/pm/properties" className="container-card hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Home size={16} className="text-green-600" />
            </div>
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Properties</p>
          </div>
          <p className="text-2xl font-semibold text-luxury-gray-1">{stats.totalProperties}</p>
          <p className="text-xs text-luxury-gray-3 mt-1">{stats.activeLeases} active leases</p>
        </Link>

        <Link href="/admin/pm/invoices" className="container-card hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
              <FileText size={16} className="text-yellow-600" />
            </div>
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending Invoices</p>
          </div>
          <p className="text-2xl font-semibold text-luxury-gray-1">{stats.pendingInvoices}</p>
          {stats.overdueInvoices > 0 && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle size={12} />
              {stats.overdueInvoices} overdue
            </p>
          )}
        </Link>

        <Link href="/admin/pm/disbursements" className="container-card hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <DollarSign size={16} className="text-purple-600" />
            </div>
            <p className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending Payouts</p>
          </div>
          <p className="text-2xl font-semibold text-luxury-gray-1">
            {formatCurrency(stats.pendingDisbursementAmount)}
          </p>
          <p className="text-xs text-luxury-gray-3 mt-1">
            {stats.pendingDisbursements} disbursements
          </p>
        </Link>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="container-card">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Quick Actions
          </h2>
          <div className="space-y-2">
            <Link
              href="/admin/pm/landlords/new"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
            >
              <div className="flex items-center gap-3">
                <Plus size={16} className="text-luxury-accent" />
                <span className="text-sm text-luxury-gray-1">Add Landlord</span>
              </div>
              <ArrowRight size={14} className="text-luxury-gray-3" />
            </Link>
            <Link
              href="/admin/pm/properties/new"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
            >
              <div className="flex items-center gap-3">
                <Plus size={16} className="text-luxury-accent" />
                <span className="text-sm text-luxury-gray-1">Add Property</span>
              </div>
              <ArrowRight size={14} className="text-luxury-gray-3" />
            </Link>
            <Link
              href="/admin/pm/leases/new"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
            >
              <div className="flex items-center gap-3">
                <Plus size={16} className="text-luxury-accent" />
                <span className="text-sm text-luxury-gray-1">Create Lease</span>
              </div>
              <ArrowRight size={14} className="text-luxury-gray-3" />
            </Link>
            <Link
              href="/admin/pm/disbursements"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
            >
              <div className="flex items-center gap-3">
                <DollarSign size={16} className="text-luxury-accent" />
                <span className="text-sm text-luxury-gray-1">Process Disbursements</span>
              </div>
              <ArrowRight size={14} className="text-luxury-gray-3" />
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="container-card">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-luxury-light transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-luxury-gray-5/50 flex items-center justify-center text-luxury-gray-3">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-luxury-gray-1 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-luxury-gray-3">{formatDate(activity.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Link
          href="/admin/pm/landlords"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <Users size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Landlords</p>
        </Link>
        <Link
          href="/admin/pm/tenants"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <Users size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Tenants</p>
        </Link>
        <Link
          href="/admin/pm/properties"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <Home size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Properties</p>
        </Link>
        <Link
          href="/admin/pm/leases"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <FileText size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Leases</p>
        </Link>
        <Link
          href="/admin/pm/invoices"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <FileText size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Invoices</p>
        </Link>
        <Link
          href="/admin/pm/disbursements"
          className="container-card text-center hover:shadow-xl transition-shadow py-6"
        >
          <DollarSign size={24} className="mx-auto mb-2 text-luxury-accent" />
          <p className="text-sm font-medium text-luxury-gray-1">Disbursements</p>
        </Link>
      </div>
    </div>
  )
}
