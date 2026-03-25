'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Wrench, Search, ArrowLeft, Clock, CheckCircle, AlertTriangle, 
  XCircle, Loader2, DollarSign, Plus, Building2
} from 'lucide-react'

interface Repair {
  id: string
  category: string
  urgency: string
  title: string
  description: string | null
  status: string
  vendor_name: string | null
  estimated_cost: number | null
  actual_cost: number | null
  payment_status: string
  created_at: string
  completed_at: string | null
  managed_properties?: {
    id: string
    property_address: string
    unit: string | null
    city: string
    state: string
  }
  tenants?: {
    id: string
    first_name: string
    last_name: string
    email: string
  }
  landlords?: {
    id: string
    first_name: string
    last_name: string
  }
}

interface Stats {
  submitted: number
  approved: number
  in_progress: number
  completed: number
  totalCost: number
}

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'structural', label: 'Structural' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'other', label: 'Other' },
]

const URGENCIES = [
  { value: 'emergency', label: 'Emergency', color: 'text-red-600' },
  { value: 'urgent', label: 'Urgent', color: 'text-amber-600' },
  { value: 'routine', label: 'Routine', color: 'text-gray-600' },
]

export default function RepairsPage() {
  const router = useRouter()
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stats, setStats] = useState<Stats>({
    submitted: 0,
    approved: 0,
    in_progress: 0,
    completed: 0,
    totalCost: 0
  })

  useEffect(() => {
    loadRepairs()
  }, [])

  const loadRepairs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/repair-requests?${params}`)
      if (res.ok) {
        const data = await res.json()
        let filteredRepairs = data.repairs || []
        
        // Client-side category filter
        if (categoryFilter !== 'all') {
          filteredRepairs = filteredRepairs.filter((r: Repair) => r.category === categoryFilter)
        }
        
        setRepairs(filteredRepairs)
        calculateStats(data.repairs || [])
      }
    } catch (err) {
      console.error('Failed to load repairs:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (repairList: Repair[]) => {
    const newStats: Stats = {
      submitted: 0,
      approved: 0,
      in_progress: 0,
      completed: 0,
      totalCost: 0
    }
    
    repairList.forEach(r => {
      if (r.status === 'submitted') newStats.submitted++
      else if (r.status === 'approved') newStats.approved++
      else if (r.status === 'in_progress') newStats.in_progress++
      else if (r.status === 'completed') newStats.completed++
      
      if (r.actual_cost) {
        newStats.totalCost += r.actual_cost
      }
    })
    
    setStats(newStats)
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadRepairs, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter, categoryFilter])

  const formatDate = (date: string) => {
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      submitted: { bg: 'bg-blue-50 text-blue-700', icon: <Clock size={12} /> },
      approved: { bg: 'bg-purple-50 text-purple-700', icon: <CheckCircle size={12} /> },
      in_progress: { bg: 'bg-amber-50 text-amber-700', icon: <Loader2 size={12} /> },
      completed: { bg: 'bg-green-50 text-green-700', icon: <CheckCircle size={12} /> },
      cancelled: { bg: 'bg-gray-50 text-gray-500', icon: <XCircle size={12} /> },
    }
    const style = styles[status] || styles.submitted
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
        {style.icon}
        {status.replace('_', ' ')}
      </span>
    )
  }

  const getUrgencyBadge = (urgency: string) => {
    const styles: Record<string, string> = {
      emergency: 'bg-red-50 text-red-700',
      urgent: 'bg-amber-50 text-amber-700',
      routine: 'bg-gray-50 text-gray-600',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${styles[urgency] || styles.routine}`}>
        {urgency}
      </span>
    )
  }

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category
  }

  const getPaymentStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'text-gray-500',
      landlord_paid: 'text-green-600',
      deducted_from_rent: 'text-blue-600',
      not_applicable: 'text-gray-400',
    }
    const labels: Record<string, string> = {
      pending: 'Pending',
      landlord_paid: 'Landlord Paid',
      deducted_from_rent: 'Deducted',
      not_applicable: 'N/A',
    }
    return (
      <span className={`text-xs ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <Wrench size={24} className="text-luxury-accent" />
          <h1 className="page-title">Repair Requests</h1>
        </div>
        <Link href="/admin/pm/repairs/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Request
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.submitted}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Submitted</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.approved}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Approved</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.in_progress}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">In Progress</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Completed</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-luxury-accent">{formatMoney(stats.totalCost)}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Total Cost</div>
        </div>
      </div>

      {/* Filters */}
      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by title, property, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-luxury pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-luxury w-full sm:w-40"
          >
            <option value="all">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="select-luxury w-full sm:w-40"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Repairs Table */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading repair requests...</div>
        ) : repairs.length === 0 ? (
          <div className="text-center py-12">
            <Wrench size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No repair requests found</p>
            <Link href="/admin/pm/repairs/new" className="btn btn-secondary mt-4 flex items-center gap-2 mx-auto w-fit">
              <Plus size={16} />
              Create First Request
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-luxury-gray-5/50">
                  <th className="th-luxury">Request</th>
                  <th className="th-luxury">Property</th>
                  <th className="th-luxury">Category</th>
                  <th className="th-luxury">Urgency</th>
                  <th className="th-luxury">Cost</th>
                  <th className="th-luxury">Payment</th>
                  <th className="th-luxury">Status</th>
                  <th className="th-luxury">Created</th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((repair) => (
                  <tr
                    key={repair.id}
                    onClick={() => router.push(`/admin/pm/repairs/${repair.id}`)}
                    className="tr-luxury-clickable"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">{repair.title}</div>
                      {repair.vendor_name && (
                        <div className="text-xs text-luxury-gray-3">Vendor: {repair.vendor_name}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {repair.managed_properties ? (
                        <div>
                          <div className="text-sm text-luxury-gray-1">
                            {repair.managed_properties.property_address}
                            {repair.managed_properties.unit && ` ${repair.managed_properties.unit}`}
                          </div>
                          <div className="text-xs text-luxury-gray-3">
                            {repair.managed_properties.city}, {repair.managed_properties.state}
                          </div>
                        </div>
                      ) : (
                        <span className="text-luxury-gray-3">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-luxury-gray-1">{getCategoryLabel(repair.category)}</span>
                    </td>
                    <td className="py-3 px-4">
                      {getUrgencyBadge(repair.urgency)}
                    </td>
                    <td className="py-3 px-4">
                      {repair.actual_cost ? (
                        <span className="text-xs font-medium text-luxury-gray-1">{formatMoney(repair.actual_cost)}</span>
                      ) : repair.estimated_cost ? (
                        <span className="text-xs text-luxury-gray-3">~{formatMoney(repair.estimated_cost)}</span>
                      ) : (
                        <span className="text-xs text-luxury-gray-3">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {getPaymentStatusBadge(repair.payment_status)}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(repair.status)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-luxury-gray-1">{formatDate(repair.created_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}