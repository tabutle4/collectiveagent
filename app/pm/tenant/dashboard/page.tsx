'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  LogOut
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

interface DashboardData {
  tenant: Tenant
  lease: Lease | null
  invoices: Invoice[]
  currentBalance: number
}

export default function TenantDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    checkSessionAndLoad()
  }, [])

  const checkSessionAndLoad = async () => {
    try {
      // Check session
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

      // Load dashboard data
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
          <p className="text-luxury-gray-3">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-luxury-light flex items-center justify-center p-6">
        <div className="container-card max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Error</h1>
          <p className="text-luxury-gray-3 mb-4">{error || 'Failed to load dashboard'}</p>
          <button onClick={() => router.push('/pm/login')} className="btn btn-primary">
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  const { tenant, lease, currentBalance } = data

  return (
    <div className="min-h-screen bg-luxury-light">
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
              title="Sign out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Balance Card */}
        <div className={`container-card mb-6 ${currentBalance > 0 ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-green-500'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-luxury-gray-3 uppercase tracking-wider mb-1">Current Balance</p>
              <p className={`text-3xl font-bold ${currentBalance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatMoney(currentBalance)}
              </p>
              {currentBalance > 0 && (
                <p className="text-sm text-luxury-gray-3 mt-1">
                  {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {currentBalance === 0 && (
              <div className="text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <p className="text-sm text-green-600 mt-1">All paid up!</p>
              </div>
            )}
          </div>
        </div>

        {/* Property Info */}
        {lease && (
          <div className="container-card mb-6">
            <h2 className="field-label mb-4 flex items-center gap-2">
              <Home className="w-4 h-4" />
              Your Property
            </h2>
            <div className="inner-card">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-luxury-gray-1 text-lg">
                    {lease.property_address}
                    {lease.unit && ` ${lease.unit}`}
                  </h3>
                  <p className="text-luxury-gray-3">
                    {lease.city}, {lease.state} {lease.zip}
                  </p>
                </div>
                <div className="text-sm space-y-2">
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
            </div>
          </div>
        )}

        {/* Unpaid Invoices */}
        {unpaidInvoices.length > 0 && (
          <div className="container-card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="field-label flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
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
                            <CheckCircle className="w-4 h-4 text-white" />
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
                              <AlertTriangle className="w-4 h-4" />
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
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            <Clock className="w-3 h-3" />
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
                    <CreditCard className="w-4 h-4" />
                    Pay Now
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-luxury-gray-3 mt-2">
                  You will be redirected to our secure payment portal
                </p>
              </div>
            )}
          </div>
        )}

        {/* Payment History */}
        {paidInvoices.length > 0 && (
          <div className="container-card">
            <h2 className="field-label mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                          <CheckCircle className="w-3 h-3" />
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
            <Calendar className="w-16 h-16 text-luxury-gray-4 mx-auto mb-4" />
            <p className="text-luxury-gray-3">No invoices yet</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Your rent invoices will appear here once generated
            </p>
          </div>
        )}

        {/* Contact Info */}
        <div className="container-card mt-6">
          <h2 className="field-label mb-4">Your Contact Info</h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-luxury-gray-1">
              <Mail className="w-4 h-4 text-luxury-gray-3" />
              {tenant.email}
            </div>
            {tenant.phone && (
              <div className="flex items-center gap-2 text-luxury-gray-1">
                <Phone className="w-4 h-4 text-luxury-gray-3" />
                {tenant.phone}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-luxury-gray-5 mt-12 py-6 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center text-sm text-luxury-gray-3">
          <p className="mb-2">
            Questions about your lease or payment? Contact us at{' '}
            <a href="mailto:pm@collectiverealtyco.com" className="text-luxury-accent hover:underline">
              pm@collectiverealtyco.com
            </a>
          </p>
          <p>© {new Date().getFullYear()} Collective Realty Co. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
