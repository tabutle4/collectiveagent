'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Receipt, Search, ArrowLeft, Send, CheckCircle, Clock, AlertTriangle, DollarSign } from 'lucide-react'

interface Invoice {
  id: string
  period_month: number
  period_year: number
  rent_amount: number
  late_fee: number
  other_charges: number
  other_charges_description: string | null
  total_amount: number
  due_date: string
  status: string
  paid_at: string | null
  paid_amount: number | null
  payload_payment_link_url: string | null
  tenant_id: string
  landlord_id: string
  property_id: string
  lease_id: string
  tenants?: {
    first_name: string
    last_name: string
    email: string
  }
  managed_properties?: {
    property_address: string
    unit: string | null
    city: string
  }
  landlords?: {
    first_name: string
    last_name: string
  }
}

interface Stats {
  pending: number
  sent: number
  overdue: number
  paid: number
  totalOutstanding: number
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    sent: 0,
    overdue: 0,
    paid: 0,
    totalOutstanding: 0
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
    loadInvoices()
  }

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
        calculateStats(data.invoices || [])
      }
    } catch (err) {
      console.error('Failed to load invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (invoiceList: Invoice[]) => {
    const newStats: Stats = {
      pending: 0,
      sent: 0,
      overdue: 0,
      paid: 0,
      totalOutstanding: 0
    }
    
    invoiceList.forEach(inv => {
      if (inv.status === 'pending') newStats.pending++
      else if (inv.status === 'sent') newStats.sent++
      else if (inv.status === 'overdue') newStats.overdue++
      else if (inv.status === 'paid') newStats.paid++
      
      if (['pending', 'sent', 'overdue'].includes(inv.status)) {
        newStats.totalOutstanding += inv.total_amount
      }
    })
    
    setStats(newStats)
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadInvoices, 300)
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
      pending: { bg: 'bg-gray-100 text-gray-600', icon: <Clock className="w-3 h-3" /> },
      sent: { bg: 'bg-blue-100 text-blue-800', icon: <Send className="w-3 h-3" /> },
      overdue: { bg: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> },
      paid: { bg: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
      partial: { bg: 'bg-amber-100 text-amber-800', icon: <DollarSign className="w-3 h-3" /> },
      cancelled: { bg: 'bg-gray-100 text-gray-400', icon: null },
    }
    const style = styles[status] || styles.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
        {style.icon}
        {status}
      </span>
    )
  }

  const sendInvoice = async (invoiceId: string) => {
    if (sendingId) return
    setSendingId(invoiceId)
    
    try {
      const res = await fetch('/api/pm/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId })
      })
      
      if (res.ok) {
        loadInvoices()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to send invoice')
      }
    } catch (err) {
      console.error('Failed to send invoice:', err)
      alert('Failed to send invoice')
    } finally {
      setSendingId(null)
    }
  }

  const isOverdue = (invoice: Invoice) => {
    if (['paid', 'cancelled'].includes(invoice.status)) return false
    const dueDate = new Date(invoice.due_date)
    return dueDate < new Date()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Receipt className="w-6 h-6 text-luxury-accent" />
        <h1 className="page-title">Invoices</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Sent</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Overdue</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Paid</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-luxury-accent">{formatMoney(stats.totalOutstanding)}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Outstanding</div>
        </div>
      </div>

      {/* Filters */}
      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by tenant or property..."
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
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No invoices found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Invoices are auto-generated when leases are created
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="th-luxury">
                  <th className="text-left py-3 px-4">Period</th>
                  <th className="text-left py-3 px-4">Tenant</th>
                  <th className="text-left py-3 px-4">Property</th>
                  <th className="text-right py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Due Date</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="tr-luxury border-b border-luxury-gray-5 hover:bg-luxury-light/50"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">
                        {getMonthName(invoice.period_month)} {invoice.period_year}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {invoice.tenants ? (
                        <div>
                          <div className="font-medium text-luxury-gray-1">
                            {invoice.tenants.first_name} {invoice.tenants.last_name}
                          </div>
                          <div className="text-xs text-luxury-gray-3">{invoice.tenants.email}</div>
                        </div>
                      ) : (
                        <span className="text-luxury-gray-3">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-luxury-gray-1">
                        {invoice.managed_properties?.property_address}
                        {invoice.managed_properties?.unit && ` ${invoice.managed_properties.unit}`}
                      </div>
                      <div className="text-xs text-luxury-gray-3">
                        {invoice.managed_properties?.city}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-medium text-luxury-gray-1">
                        {formatMoney(invoice.total_amount)}
                      </div>
                      {invoice.late_fee > 0 && (
                        <div className="text-xs text-red-600">
                          incl. {formatMoney(invoice.late_fee)} late fee
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className={`text-sm ${isOverdue(invoice) ? 'text-red-600 font-medium' : 'text-luxury-gray-1'}`}>
                        {formatDate(invoice.due_date)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {invoice.status === 'pending' && (
                        <button
                          onClick={() => sendInvoice(invoice.id)}
                          disabled={sendingId === invoice.id}
                          className="btn btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          {sendingId === invoice.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      {invoice.status === 'sent' && invoice.payload_payment_link_url && (
                        <a
                          href={invoice.payload_payment_link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-luxury-accent hover:underline"
                        >
                          View Payment Link
                        </a>
                      )}
                      {invoice.status === 'paid' && invoice.paid_at && (
                        <span className="text-xs text-green-600">
                          Paid {formatDate(invoice.paid_at)}
                        </span>
                      )}
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
