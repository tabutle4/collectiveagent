'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Building2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  FileText, 
  CreditCard,
  Home,
  Calendar,
  User,
  Mail,
  Phone,
  MapPin
} from 'lucide-react'

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  zip: string
  status: string
  pm_leases?: {
    id: string
    lease_start: string
    lease_end: string
    monthly_rent: number
    status: string
    tenants?: {
      id: string
      first_name: string
      last_name: string
      email: string
    }
  }[]
}

interface Agreement {
  id: string
  management_fee_pct: number
  commencement_date: string
  expiration_date: string | null
  status: string
}

interface Disbursement {
  id: string
  gross_rent: number
  management_fee: number
  net_amount: number
  period_month: number
  period_year: number
  payment_status: string
  managed_properties?: {
    id: string
    property_address: string
    city: string
  }
}

interface Activity {
  type: string
  description: string
  date: string | null
  amount: number
  status: string
}

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  status: string
}

interface SetupStatus {
  w9Complete: boolean
  bankConnected: boolean
}

interface DashboardData {
  landlord: Landlord
  properties: Property[]
  agreements: Agreement[]
  pendingDisbursements: Disbursement[]
  recentActivity: Activity[]
  setupStatus: SetupStatus
}

export default function LandlordDashboardPage() {
  const params = useParams()
  const token = params.token as string
  
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      loadDashboard()
    }
  }, [token])

  const loadDashboard = async () => {
    try {
      const res = await fetch(`/api/pm/dashboard/landlord?token=${token}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Invalid or expired link')
        return
      }
      const result = await res.json()
      setData(result)
    } catch (err) {
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date: string) => {
    // Append T12:00:00 to date-only strings to prevent timezone shift
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })
  }

  const totalPending = data?.pendingDisbursements?.reduce((sum, d) => sum + d.net_amount, 0) || 0

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
          <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Access Denied</h1>
          <p className="text-luxury-gray-3 mb-4">{error || 'Invalid or expired link'}</p>
          <p className="text-sm text-luxury-gray-3">
            Please contact Collective Realty Co. for assistance.
          </p>
        </div>
      </div>
    )
  }

  const { landlord, properties, agreements, pendingDisbursements, recentActivity, setupStatus } = data

  return (
    <div className="min-h-screen bg-luxury-light">
      {/* Header */}
      <header className="bg-white border-b border-luxury-gray-5 py-4 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="CRC Property Management"
              className="h-12 sm:h-14 w-auto object-contain"
            />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-luxury-gray-1">Property Management</h1>
              <p className="text-sm text-luxury-gray-3">Landlord Portal</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="font-medium text-luxury-gray-1">{landlord.first_name} {landlord.last_name}</p>
            <p className="text-sm text-luxury-gray-3">{landlord.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Setup Alert */}
        {(!setupStatus.w9Complete || !setupStatus.bankConnected) && (
          <div className="alert-warning mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Complete Your Setup</p>
              <p className="text-sm mt-1">
                To receive rent disbursements, please complete the following:
              </p>
              <ul className="text-sm mt-2 space-y-1">
                {!setupStatus.w9Complete && (
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center text-xs">1</span>
                    <FileText size={16} />
                    Submit your W9 form
                  </li>
                )}
                {!setupStatus.bankConnected && (
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center text-xs">{setupStatus.w9Complete ? '1' : '2'}</span>
                    <CreditCard size={16} />
                    Connect your bank account for ACH deposits
                  </li>
                )}
              </ul>
              <p className="text-sm mt-3">
                Contact your property manager for setup links.
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="container-card text-center">
            <Building2 size={24} className="text-luxury-accent mx-auto mb-2" />
            <div className="text-2xl font-bold text-luxury-gray-1">{properties.length}</div>
            <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Properties</div>
          </div>
          <div className="container-card text-center">
            <User size={24} className="text-luxury-accent mx-auto mb-2" />
            <div className="text-2xl font-bold text-luxury-gray-1">
              {properties.reduce((sum, p) => sum + (p.pm_leases?.filter(l => l.status === 'active')?.length || 0), 0)}
            </div>
            <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Active Tenants</div>
          </div>
          <div className="container-card text-center">
            <Clock size={24} className="text-amber-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-600">{pendingDisbursements.length}</div>
            <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending Payouts</div>
          </div>
          <div className="container-card text-center">
            <DollarSign size={24} className="text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">{formatMoney(totalPending)}</div>
            <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">To Be Paid</div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Properties - 2 columns */}
          <div className="md:col-span-2">
            <div className="container-card">
              <h2 className="field-label mb-4 flex items-center gap-2">
                <Home size={16} />
                Your Properties
              </h2>
              
              {properties.length === 0 ? (
                <div className="text-center py-8 text-luxury-gray-3">
                  <Building2 size={48} className="mx-auto mb-3 text-luxury-gray-4" />
                  <p>No properties on file yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {properties.map((property) => {
                    const activeLease = property.pm_leases?.find(l => l.status === 'active')
                    return (
                      <div key={property.id} className="inner-card">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-luxury-gray-1">
                              {property.property_address}
                              {property.unit && ` ${property.unit}`}
                            </h3>
                            <p className="text-sm text-luxury-gray-3">
                              {property.city}, {property.state} {property.zip}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            property.status === 'active' 
                              ? 'bg-green-50 text-green-700' 
                              : 'bg-gray-50 text-gray-600'
                          }`}>
                            {property.status}
                          </span>
                        </div>
                        
                        {activeLease ? (
                          <div className="bg-luxury-light rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-luxury-gray-3 uppercase tracking-wider">Current Tenant</span>
                              <span className="text-sm font-semibold text-luxury-accent">
                                {formatMoney(activeLease.monthly_rent)}/mo
                              </span>
                            </div>
                            <p className="font-medium text-luxury-gray-1">
                              {activeLease.tenants?.first_name} {activeLease.tenants?.last_name}
                            </p>
                            <p className="text-sm text-luxury-gray-3">
                              Lease: {formatDate(activeLease.lease_start)} - {formatDate(activeLease.lease_end)}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
                            <Clock size={16} className="inline mr-1" />
                            No active lease - property is vacant
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Setup Status */}
            <div className="container-card">
              <h2 className="field-label mb-4">Account Setup</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-luxury-gray-1 flex items-center gap-2">
                    <FileText size={16} />
                    W9 Form
                  </span>
                  {setupStatus.w9Complete ? (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <CheckCircle size={16} />
                      Complete
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 text-sm">
                      <AlertCircle size={16} />
                      Pending
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-luxury-gray-1 flex items-center gap-2">
                    <CreditCard size={16} />
                    Bank Account
                  </span>
                  {setupStatus.bankConnected ? (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <CheckCircle size={16} />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 text-sm">
                      <AlertCircle size={16} />
                      Not Connected
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Pending Disbursements */}
            {pendingDisbursements.length > 0 && (
              <div className="container-card">
                <h2 className="field-label mb-4 flex items-center gap-2">
                  <DollarSign size={16} />
                  Pending Disbursements
                </h2>
                <div className="space-y-3">
                  {pendingDisbursements.map((d) => (
                    <div key={d.id} className="inner-card">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-luxury-gray-1">
                          {getMonthName(d.period_month)} {d.period_year}
                        </span>
                        <span className="font-semibold text-green-600">
                          {formatMoney(d.net_amount)}
                        </span>
                      </div>
                      <p className="text-xs text-luxury-gray-3">
                        {d.managed_properties?.property_address}
                      </p>
                      <p className="text-xs text-luxury-gray-3">
                        Gross: {formatMoney(d.gross_rent)} - Fee: {formatMoney(d.management_fee)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Management Agreement */}
            {agreements.length > 0 && (
              <div className="container-card">
                <h2 className="field-label mb-4 flex items-center gap-2">
                  <Calendar size={16} />
                  Agreement
                </h2>
                {agreements.map((a) => (
                  <div key={a.id} className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-luxury-gray-3">Management Fee</span>
                      <span className="font-medium text-luxury-gray-1">{a.management_fee_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-luxury-gray-3">Start Date</span>
                      <span className="text-luxury-gray-1">{formatDate(a.commencement_date)}</span>
                    </div>
                    {a.expiration_date && (
                      <div className="flex justify-between">
                        <span className="text-luxury-gray-3">Expires</span>
                        <span className="text-luxury-gray-1">{formatDate(a.expiration_date)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Contact Info */}
            <div className="container-card">
              <h2 className="field-label mb-4">Your Contact Info</h2>
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2 text-luxury-gray-1">
                  <Mail size={16} className="text-luxury-gray-3" />
                  {landlord.email}
                </div>
                {landlord.phone && (
                  <div className="flex items-center gap-2 text-luxury-gray-1">
                    <Phone size={16} className="text-luxury-gray-3" />
                    {landlord.phone}
                  </div>
                )}
                {landlord.mailing_address && (
                  <div className="flex items-start gap-2 text-luxury-gray-1">
                    <MapPin size={16} className="text-luxury-gray-3 mt-0.5" />
                    <div>
                      {landlord.mailing_address}<br />
                      {landlord.mailing_city}, {landlord.mailing_state} {landlord.mailing_zip}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="container-card mt-6">
            <h2 className="field-label mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((activity, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-luxury-gray-5 last:border-0">
                  <div className="flex items-center gap-3">
                    {activity.status === 'completed' ? (
                      <CheckCircle size={20} className="text-green-600" />
                    ) : (
                      <Clock size={20} className="text-amber-500" />
                    )}
                    <span className="text-sm text-luxury-gray-1">{activity.description}</span>
                  </div>
                  {activity.date && (
                    <span className="text-xs text-luxury-gray-3">{formatDate(activity.date)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-luxury-gray-5 mt-12 py-6 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center text-sm text-luxury-gray-3">
          <p className="mb-2">
            Questions? Contact us at{' '}
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
