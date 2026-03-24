'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Home, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  Calendar,
  Mail,
  Phone,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  LogOut,
  ArrowLeft,
  Eye,
  Wrench,
  X,
  Loader2,
  Plus
} from 'lucide-react'

interface Invoice {
  id: string
  period_month: number
  period_year: number
  rent_amount: number
  late_fee: number
  other_charges: number
  total_amount: number
  due_date: string
  status: string
  paid_at: string | null
  paid_amount: number | null
  payment_url: string | null
  property_address: string
}

interface Lease {
  id: string
  property_address: string
  unit: string
  city: string
  state: string
  zip: string
  monthly_rent: number
  rent_due_day: number
  lease_start: string
  lease_end: string
  security_deposit: number
}

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
}

interface Repair {
  id: string
  title: string
  category: string
  urgency: string
  status: string
  created_at: string
  description: string | null
  managed_properties?: {
    property_address: string
  }
}

interface DashboardData {
  tenant: Tenant
  lease: Lease | null
  invoices: Invoice[]
  repairs: Repair[]
  currentBalance: number
}

function TenantDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const previewId = searchParams.get('preview')
  
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [loggingOut, setLoggingOut] = useState(false)
  const [isAdminPreview, setIsAdminPreview] = useState(false)
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [submittingRepair, setSubmittingRepair] = useState(false)
  const [repairForm, setRepairForm] = useState({
    category: '',
    urgency: 'routine',
    title: '',
    description: ''
  })

  useEffect(() => {
    if (previewId) {
      checkAdminAndLoad(previewId)
    } else {
      checkSessionAndLoad()
    }
  }, [previewId])

  const checkAdminAndLoad = async (tenantId: string) => {
    try {
      const adminRes = await fetch('/api/pm/admin-check')
      const adminData = await adminRes.json()
      
      if (!adminData.isAdmin) {
        setError('Admin access required for preview mode')
        setLoading(false)
        return
      }

      setIsAdminPreview(true)

      const dashboardRes = await fetch(`/api/pm/dashboard/tenant?user_id=${tenantId}`)
      if (!dashboardRes.ok) {
        throw new Error('Tenant not found')
      }

      const dashboardData = await dashboardRes.json()
      setData(dashboardData)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const checkSessionAndLoad = async () => {
    try {
      const sessionRes = await fetch('/api/pm/auth/session')
      if (!sessionRes.ok) {
        router.push('/pm/login')
        return
      }

      const session = await sessionRes.json()
      if (!session.authenticated || session.user_type !== 'tenant') {
        router.push('/pm/login')
        return
      }

      const dashboardRes = await fetch(`/api/pm/dashboard/tenant?user_id=${session.user_id}`)
      if (!dashboardRes.ok) {
        throw new Error('Failed to load dashboard')
      }

      const dashboardData = await dashboardRes.json()
      setData(dashboardData)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (isAdminPreview) {
      router.push('/admin/pm/tenants')
      return
    }
    
    setLoggingOut(true)
    try {
      await fetch('/api/pm/auth/logout', { method: 'POST' })
      router.push('/pm/login')
    } catch (err) {
      console.error('Logout error:', err)
      router.push('/pm/login')
    }
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })
  }

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    )
  }

  const selectAllUnpaid = () => {
    if (!data) return
    const unpaidIds = data.invoices
      .filter(inv => !['paid', 'cancelled'].includes(inv.status))
      .map(inv => inv.id)
    setSelectedInvoices(unpaidIds)
  }

  const submitRepair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.tenant.id || !data?.lease) return
    
    setSubmittingRepair(true)
    try {
      alert('Repair request noted! Please contact pm@collectiverealtyco.com or call (281) 638-9407 to report your repair.')
      setShowRepairModal(false)
      setRepairForm({ category: '', urgency: 'routine', title: '', description: '' })
    } catch (err) {
      console.error('Failed to submit repair:', err)
      alert('Failed to submit repair request. Please contact property management directly.')
    } finally {
      setSubmittingRepair(false)
    }
  }

  const selectedTotal = data?.invoices
    .filter(inv => selectedInvoices.includes(inv.id))
    .reduce((sum, inv) => sum + inv.total_amount, 0) || 0

  const unpaidInvoices = data?.invoices.filter(inv => !['paid', 'cancelled'].includes(inv.status)) || []
  const paidInvoices = data?.invoices.filter(inv => inv.status === 'paid') || []

  const isOverdue = (dueDate: string, status: string) => {
    if (['paid', 'cancelled'].includes(status)) return false
    return new Date(dueDate) < new Date()
  }

  const getOrdinalSuffix = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-luxury-accent mx-auto mb-4"></div>
          <p className="text-luxury-gray-3">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-luxury-light flex items-center justify-center p-6">
        <div className="container-card max-w-md text-center">
          <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Error</h1>
          <p className="text-luxury-gray-3 mb-4">{error || 'Failed to load dashboard'}</p>
          {isAdminPreview ? (
            <Link href="/admin/pm/tenants" className="btn btn-primary">
              Back to Admin
            </Link>
          ) : (
            <button onClick={() => router.push('/pm/login')} className="btn btn-primary">
              Return to Login
            </button>
          )}
        </div>
      </div>
    )
  }

  const { tenant, lease, repairs, currentBalance } = data

  return (
    <div className="min-h-screen bg-luxury-light">
      {/* Admin Preview Banner */}
      {isAdminPreview && (
        <div className="bg-amber-500 text-white px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={16} />
              <span className="text-sm font-medium">
                Admin Preview — Viewing as {tenant.first_name} {tenant.last_name}
              </span>
            </div>
            <Link 
              href={`/admin/pm/tenants/${tenant.id}`}
              className="flex items-center gap-1 text-sm hover:underline"
            >
              <ArrowLeft size={16} />
              Back to Admin
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-luxury-gray-5 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/CRC-Luxury-Logo.png"
              alt="Collective Realty Co."
              className="h-10 object-contain"
            />
            <div>
              <h1 className="font-semibold text-luxury-gray-1">Tenant Portal</h1>
              <p className="text-sm text-luxury-gray-3">Collective Realty Co.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-luxury-gray-1">{tenant.first_name} {tenant.last_name}</p>
              <p className="text-sm text-luxury-gray-3">{tenant.email}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-2 rounded-lg hover:bg-luxury-light transition-colors text-luxury-gray-3 hover:text-luxury-gray-1"
              title={isAdminPreview ? 'Exit Preview' : 'Sign Out'}
            >
              {isAdminPreview ? <ArrowLeft size={20} /> : <LogOut size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Balance and Lease Info */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Current Balance */}
          <div className="container-card">
            <h2 className="field-label mb-2">Current Balance</h2>
            <p className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatMoney(currentBalance)}
            </p>
            {currentBalance > 0 && (
              <p className="text-sm text-luxury-gray-3 mt-1">
                Amount due across all unpaid invoices
              </p>
            )}
            {currentBalance === 0 && (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle size={16} />
                All paid up!
              </p>
            )}
          </div>

          {/* Lease Info */}
          {lease && (
            <div className="container-card">
              <h2 className="field-label mb-2 flex items-center gap-2">
                <Home size={16} />
                Your Rental
              </h2>
              <p className="font-semibold text-luxury-gray-1">
                {lease.property_address}
                {lease.unit && ` ${lease.unit}`}
              </p>
              <p className="text-sm text-luxury-gray-3">{lease.city}, {lease.state} {lease.zip}</p>
              <div className="mt-3 pt-3 border-t border-luxury-gray-5 grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-luxury-gray-3">Monthly Rent</span>
                  <span className="font-semibold text-luxury-accent">{formatMoney(lease.monthly_rent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-luxury-gray-3">Due Day</span>
                  <span className="text-luxury-gray-1">{lease.rent_due_day}{getOrdinalSuffix(lease.rent_due_day)} of each month</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-luxury-gray-3">Lease Dates</span>
                  <span className="text-luxury-gray-1">{formatDate(lease.lease_start)} — {formatDate(lease.lease_end)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unpaid Invoices */}
        {unpaidInvoices.length > 0 && (
          <div className="container-card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="field-label flex items-center gap-2">
                <DollarSign size={16} />
                Invoices Due
              </h2>
              {unpaidInvoices.length > 1 && (
                <button 
                  onClick={selectAllUnpaid}
                  className="text-sm text-luxury-accent hover:underline"
                >
                  Select All
                </button>
              )}
            </div>

            <div className="space-y-3">
              {unpaidInvoices.map((invoice) => {
                const overdue = isOverdue(invoice.due_date, invoice.status)
                return (
                  <div 
                    key={invoice.id} 
                    className={`inner-card cursor-pointer transition-all ${
                      selectedInvoices.includes(invoice.id) 
                        ? 'ring-2 ring-luxury-accent bg-luxury-accent/5' 
                        : ''
                    } ${overdue ? 'border-l-4 border-l-red-500' : ''}`}
                    onClick={() => toggleInvoice(invoice.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                          selectedInvoices.includes(invoice.id)
                            ? 'bg-luxury-accent border-luxury-accent'
                            : 'border-luxury-gray-4'
                        }`}>
                          {selectedInvoices.includes(invoice.id) && (
                            <CheckCircle size={16} className="text-white" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-luxury-gray-1">
                            {getMonthName(invoice.period_month)} {invoice.period_year}
                          </p>
                          <p className="text-sm text-luxury-gray-3">
                            Due: {formatDate(invoice.due_date)}
                          </p>
                          {overdue && (
                            <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                              <AlertTriangle size={16} />
                              Overdue
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-luxury-gray-1 text-lg">
                          {formatMoney(invoice.total_amount)}
                        </p>
                        {invoice.late_fee > 0 && (
                          <p className="text-xs text-red-600">
                            incl. {formatMoney(invoice.late_fee)} late fee
                          </p>
                        )}
                        {invoice.status === 'sent' && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">
                            <Clock size={12} />
                            Sent
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pay Selected */}
            {selectedInvoices.length > 0 && (
              <div className="mt-6 p-4 bg-luxury-accent/10 rounded-lg border border-luxury-accent/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-luxury-gray-3">
                      {selectedInvoices.length} invoice{selectedInvoices.length !== 1 ? 's' : ''} selected
                    </p>
                    <p className="text-2xl font-bold text-luxury-accent">
                      {formatMoney(selectedTotal)}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      const firstSelected = unpaidInvoices.find(inv => selectedInvoices.includes(inv.id))
                      if (firstSelected?.payment_url) {
                        window.open(firstSelected.payment_url, '_blank')
                      } else {
                        alert('Payment link not available. Please contact your property manager.')
                      }
                    }}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <CreditCard size={16} />
                    Pay Now
                    <ExternalLink size={16} />
                  </button>
                </div>
                <p className="text-xs text-luxury-gray-3 mt-2">
                  You will be redirected to our secure payment portal
                </p>
              </div>
            )}

            {/* Zelle Payment Option */}
            <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <DollarSign size={20} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-purple-900 mb-1">Pay with Zelle</h3>
                  <p className="text-sm text-purple-800 mb-2">
                    You can also pay via Zelle. Send payment to:
                  </p>
                  <p className="text-sm font-mono bg-white px-3 py-2 rounded border border-purple-200 text-purple-900">
                    info@collectiverealtyco.com
                  </p>
                  <p className="text-xs text-purple-700 mt-2">
                    Include your name and property address in the memo. Payments are typically processed within 1-2 business days.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment History */}
        {paidInvoices.length > 0 && (
          <div className="container-card">
            <h2 className="field-label mb-4 flex items-center gap-2">
              <Calendar size={16} />
              Payment History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-luxury-gray-5">
                    <th className="text-left py-2 px-3 text-luxury-gray-3 font-medium">Period</th>
                    <th className="text-right py-2 px-3 text-luxury-gray-3 font-medium">Amount</th>
                    <th className="text-left py-2 px-3 text-luxury-gray-3 font-medium">Paid On</th>
                    <th className="text-left py-2 px-3 text-luxury-gray-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paidInvoices.slice(0, 12).map((invoice) => (
                    <tr key={invoice.id} className="border-b border-luxury-gray-5 last:border-0">
                      <td className="py-3 px-3 font-medium text-luxury-gray-1">
                        {getMonthName(invoice.period_month)} {invoice.period_year}
                      </td>
                      <td className="py-3 px-3 text-right text-luxury-gray-1">
                        {formatMoney(invoice.paid_amount || invoice.total_amount)}
                      </td>
                      <td className="py-3 px-3 text-luxury-gray-3">
                        {invoice.paid_at ? formatDate(invoice.paid_at) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full">
                          <CheckCircle size={12} />
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Invoices State */}
        {data.invoices.length === 0 && (
          <div className="container-card text-center py-12">
            <Calendar size={64} className="text-luxury-gray-4 mx-auto mb-4" />
            <p className="text-luxury-gray-3">No invoices yet</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Your rent invoices will appear here once generated
            </p>
          </div>
        )}

        {/* Repairs Section */}
        <div className="container-card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="field-label flex items-center gap-2">
              <Wrench size={16} />
              Repair Requests
            </h2>
            <button
              onClick={() => setShowRepairModal(true)}
              className="btn btn-secondary text-sm flex items-center gap-2"
            >
              <Plus size={14} />
              Report Issue
            </button>
          </div>
          {repairs.length === 0 ? (
            <div className="text-center py-6">
              <Wrench size={32} className="mx-auto text-luxury-gray-4 mb-2" />
              <p className="text-sm text-luxury-gray-3">No repair requests</p>
              <p className="text-xs text-luxury-gray-3 mt-1">
                Click "Report Issue" to submit a maintenance request
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {repairs.map((repair) => (
                <div key={repair.id} className="inner-card">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-medium text-luxury-gray-1">{repair.title}</p>
                      <p className="text-xs text-luxury-gray-3">{repair.category}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      repair.status === 'completed' ? 'bg-green-50 text-green-700' :
                      repair.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                      repair.status === 'approved' ? 'bg-purple-50 text-purple-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {repair.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-luxury-gray-3">
                    Submitted {formatDate(repair.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact Info */}
        <div className="container-card mt-6">
          <h2 className="field-label mb-4">Your Contact Info</h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-luxury-gray-1">
              <Mail size={16} className="text-luxury-gray-3" />
              {tenant.email}
            </div>
            {tenant.phone && (
              <div className="flex items-center gap-2 text-luxury-gray-1">
                <Phone size={16} className="text-luxury-gray-3" />
                {tenant.phone}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Repair Request Modal */}
      {showRepairModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-luxury-gray-1">Report an Issue</h3>
                <button
                  onClick={() => setShowRepairModal(false)}
                  className="text-luxury-gray-3 hover:text-luxury-gray-1"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={submitRepair} className="space-y-4">
                <div>
                  <label className="field-label">Category</label>
                  <select
                    value={repairForm.category}
                    onChange={(e) => setRepairForm({ ...repairForm, category: e.target.value })}
                    className="select-luxury w-full"
                    required
                  >
                    <option value="">Select category...</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="hvac">HVAC / Heating / Cooling</option>
                    <option value="appliances">Appliances</option>
                    <option value="structural">Structural / Walls / Flooring</option>
                    <option value="pest_control">Pest Control</option>
                    <option value="locks_security">Locks / Security</option>
                    <option value="exterior">Exterior / Yard</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Urgency</label>
                  <select
                    value={repairForm.urgency}
                    onChange={(e) => setRepairForm({ ...repairForm, urgency: e.target.value })}
                    className="select-luxury w-full"
                  >
                    <option value="routine">Routine (within 1-2 weeks)</option>
                    <option value="urgent">Urgent (within 48 hours)</option>
                    <option value="emergency">Emergency (safety hazard)</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Title</label>
                  <input
                    type="text"
                    value={repairForm.title}
                    onChange={(e) => setRepairForm({ ...repairForm, title: e.target.value })}
                    className="input-luxury w-full"
                    placeholder="Brief description of the issue"
                    required
                  />
                </div>

                <div>
                  <label className="field-label">Details</label>
                  <textarea
                    value={repairForm.description}
                    onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                    className="input-luxury w-full h-24 resize-none"
                    placeholder="Provide as much detail as possible..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRepairModal(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRepair}
                    className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {submittingRepair && <Loader2 size={16} className="animate-spin" />}
                    {submittingRepair ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>

              <p className="text-xs text-luxury-gray-3 mt-4 text-center">
                For emergencies, please call (281) 638-9407 immediately
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-luxury-gray-5 mt-12 py-6 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center text-sm text-luxury-gray-3">
          <p className="mb-2">
            Questions about your lease or payment? Contact us at{' '}
            <a href="mailto:pm@collectiverealtyco.com" className="text-luxury-accent hover:underline">
              pm@collectiverealtyco.com
            </a>
            {' '}or call{' '}
            <a href="tel:+12816389407" className="text-luxury-accent hover:underline">
              (281) 638-9407
            </a>
          </p>
          <p>© {new Date().getFullYear()} Collective Realty Co. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-luxury-light flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-luxury-accent mx-auto mb-4"></div>
        <p className="text-luxury-gray-3">Loading dashboard...</p>
      </div>
    </div>
  )
}

export default function TenantDashboardPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TenantDashboardContent />
    </Suspense>
  )
}