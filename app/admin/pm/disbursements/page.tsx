'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Banknote, Search, ArrowLeft, Send, CheckCircle, Clock, AlertCircle, Building2 } from 'lucide-react'

interface Disbursement {
  id: string
  gross_rent: number
  management_fee: number
  other_deductions: number
  other_deductions_description: string | null
  net_amount: number
  payment_status: string
  payment_date: string | null
  payload_payout_id: string | null
  period_month: number
  period_year: number
  landlord_id: string
  tenant_invoice_id: string
  property_id: string
  landlords?: {
    id: string
    first_name: string
    last_name: string
    email: string
    bank_status: string
    payload_payment_method_id: string | null
  }
  managed_properties?: {
    property_address: string
    unit: string | null
    city: string
  }
  tenant_invoices?: {
    status: string
    paid_at: string | null
  }
}

interface Stats {
  pending: number
  processing: number
  completed: number
  failed: number
  totalPending: number
}

export default function DisbursementsPage() {
  const router = useRouter()
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    totalPending: 0
  })

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadDisbursements()
  }

  const loadDisbursements = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/disbursements?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDisbursements(data.disbursements || [])
        calculateStats(data.disbursements || [])
      }
    } catch (err) {
      console.error('Failed to load disbursements:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (disbursementList: Disbursement[]) => {
    const newStats: Stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalPending: 0
    }
    
    disbursementList.forEach(d => {
      if (d.payment_status === 'pending') {
        newStats.pending++
        newStats.totalPending += d.net_amount
      }
      else if (d.payment_status === 'processing') newStats.processing++
      else if (d.payment_status === 'completed') newStats.completed++
      else if (d.payment_status === 'failed') newStats.failed++
    })
    
    setStats(newStats)
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadDisbursements, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      pending: { bg: 'bg-amber-100 text-amber-800', icon: <Clock className="w-3 h-3" /> },
      processing: { bg: 'bg-blue-100 text-blue-800', icon: <Send className="w-3 h-3" /> },
      completed: { bg: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
      failed: { bg: 'bg-red-100 text-red-800', icon: <AlertCircle className="w-3 h-3" /> },
    }
    const style = styles[status] || styles.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
        {style.icon}
        {status}
      </span>
    )
  }

  const processDisbursement = async (disbursementId: string) => {
    if (processingId) return
    
    const disbursement = disbursements.find(d => d.id === disbursementId)
    if (!disbursement) return
    
    // Check if landlord has bank connected
    if (!disbursement.landlords?.payload_payment_method_id) {
      alert('Landlord has not connected their bank account. Send them an activation link first.')
      return
    }
    
    if (!confirm(`Process ACH payout of ${formatMoney(disbursement.net_amount)} to ${disbursement.landlords.first_name} ${disbursement.landlords.last_name}?`)) {
      return
    }
    
    setProcessingId(disbursementId)
    
    try {
      const res = await fetch('/api/pm/disbursements/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disbursement_id: disbursementId })
      })
      
      if (res.ok) {
        loadDisbursements()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to process disbursement')
      }
    } catch (err) {
      console.error('Failed to process disbursement:', err)
      alert('Failed to process disbursement')
    } finally {
      setProcessingId(null)
    }
  }

  const canProcess = (disbursement: Disbursement) => {
    return (
      disbursement.payment_status === 'pending' &&
      disbursement.landlords?.bank_status === 'connected' &&
      disbursement.landlords?.payload_payment_method_id
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Banknote className="w-6 h-6 text-luxury-accent" />
        <h1 className="page-title">Disbursements</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Processing</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Completed</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Failed</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-luxury-accent">{formatMoney(stats.totalPending)}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">To Disburse</div>
        </div>
      </div>

      {/* Filters */}
      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by landlord or property..."
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
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Disbursements Table */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading disbursements...</div>
        ) : disbursements.length === 0 ? (
          <div className="text-center py-12">
            <Banknote className="w-12 h-12 mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No disbursements found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Disbursements are created automatically when tenants pay rent
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="th-luxury">
                  <th className="text-left py-3 px-4">Period</th>
                  <th className="text-left py-3 px-4">Landlord</th>
                  <th className="text-left py-3 px-4">Property</th>
                  <th className="text-right py-3 px-4">Gross Rent</th>
                  <th className="text-right py-3 px-4">Mgmt Fee</th>
                  <th className="text-right py-3 px-4">Net Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {disbursements.map((disbursement) => (
                  <tr
                    key={disbursement.id}
                    className="tr-luxury border-b border-luxury-gray-5 hover:bg-luxury-light/50"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">
                        {getMonthName(disbursement.period_month)} {disbursement.period_year}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {disbursement.landlords ? (
                        <div>
                          <div className="font-medium text-luxury-gray-1">
                            {disbursement.landlords.first_name} {disbursement.landlords.last_name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {disbursement.landlords.bank_status === 'connected' ? (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Bank connected
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Bank not connected
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-luxury-gray-3">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-luxury-gray-1">
                        {disbursement.managed_properties?.property_address}
                        {disbursement.managed_properties?.unit && ` ${disbursement.managed_properties.unit}`}
                      </div>
                      <div className="text-xs text-luxury-gray-3">
                        {disbursement.managed_properties?.city}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm text-luxury-gray-1">
                        {formatMoney(disbursement.gross_rent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm text-red-600">
                        -{formatMoney(disbursement.management_fee)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-luxury-gray-1">
                        {formatMoney(disbursement.net_amount)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(disbursement.payment_status)}
                      {disbursement.payment_date && (
                        <div className="text-xs text-luxury-gray-3 mt-0.5">
                          {formatDate(disbursement.payment_date)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {disbursement.payment_status === 'pending' && (
                        <>
                          {canProcess(disbursement) ? (
                            <button
                              onClick={() => processDisbursement(disbursement.id)}
                              disabled={processingId === disbursement.id}
                              className="btn btn-primary text-xs py-1 px-3 inline-flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              {processingId === disbursement.id ? 'Processing...' : 'Process ACH'}
                            </button>
                          ) : (
                            <Link
                              href={`/admin/pm/landlords/${disbursement.landlord_id}`}
                              className="text-xs text-luxury-accent hover:underline"
                            >
                              Setup Bank First
                            </Link>
                          )}
                        </>
                      )}
                      {disbursement.payment_status === 'completed' && (
                        <span className="text-xs text-green-600">
                          ACH Complete
                        </span>
                      )}
                      {disbursement.payment_status === 'failed' && (
                        <button
                          onClick={() => processDisbursement(disbursement.id)}
                          disabled={processingId === disbursement.id}
                          className="btn btn-secondary text-xs py-1 px-3"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="container-card mt-6">
        <div className="inner-card">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-luxury-accent mt-0.5" />
            <div>
              <h3 className="font-semibold text-luxury-gray-1 mb-1">How Disbursements Work</h3>
              <ul className="text-sm text-luxury-gray-3 space-y-1">
                <li>• Disbursements are auto-created when a tenant pays rent</li>
                <li>• Management fee is automatically deducted from gross rent</li>
                <li>• Landlords must connect their bank before receiving ACH payouts</li>
                <li>• Processing typically takes 1-3 business days</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
