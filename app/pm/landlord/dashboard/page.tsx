'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Mail,
  Phone,
  MapPin,
  LogOut,
  ArrowLeft,
  Eye,
  Wrench,
  Loader2
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

interface Repair {
  id: string
  title: string
  category: string
  urgency: string
  status: string
  created_at: string
  actual_cost: number | null
  managed_properties?: {
    property_address: string
  }
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
  w9_status: string
  bank_status: string
}

interface DashboardData {
  landlord: Landlord
  properties: Property[]
  agreements: Agreement[]
  pendingDisbursements: Disbursement[]
  repairs: Repair[]
  recentActivity: Activity[]
  setupStatus: {
    w9Complete: boolean
    bankConnected: boolean
  }
}

function LandlordDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const previewId = searchParams.get('preview')
  
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [isAdminPreview, setIsAdminPreview] = useState(false)
  const [requestingW9, setRequestingW9] = useState(false)
  const [requestingBank, setRequestingBank] = useState(false)

  useEffect(() => {
    if (previewId) {
      checkAdminAndLoad(previewId)
    } else {
      checkSessionAndLoad()
    }
  }, [previewId])

  const checkAdminAndLoad = async (landlordId: string) => {
    try {
      const adminRes = await fetch('/api/pm/admin-check')
      const adminData = await adminRes.json()
      
      if (!adminData.isAdmin) {
        setError('Admin access required for preview mode')
        setLoading(false)
        return
      }

      setIsAdminPreview(true)

      const dashboardRes = await fetch(`/api/pm/dashboard/landlord?user_id=${landlordId}`)
      if (!dashboardRes.ok) {
        throw new Error('Landlord not found')
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
      if (!session.authenticated || session.user_type !== 'landlord') {
        router.push('/pm/login')
        return
      }

      const dashboardRes = await fetch(`/api/pm/dashboard/landlord?user_id=${session.user_id}`)
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
      router.push('/admin/pm/landlords')
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

  const requestW9Form = async () => {
    if (!data?.landlord.id) return
    setRequestingW9(true)
    try {
      const res = await fetch('/api/pm/track1099/create-form-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlord_id: data.landlord.id })
      })
      const result = await res.json()
      if (res.ok && result.form_url) {
        window.open(result.form_url, '_blank')
      } else {
        alert(result.error || 'Failed to create W9 request')
      }
    } catch (err) {
      console.error('W9 request error:', err)
      alert('Failed to request W9 form')
    } finally {
      setRequestingW9(false)
    }
  }

  const requestBankActivation = async () => {
    if (!data?.landlord.id) return
    setRequestingBank(true)
    try {
      const res = await fetch(`/api/pm/landlords/${data.landlord.id}/send-bank-activation`, {
        method: 'POST'
      })
      const result = await res.json()
      if (res.ok) {
        alert('Bank activation link has been sent to your email!')
      } else {
        alert(result.error || 'Failed to send bank activation')
      }
    } catch (err) {
      console.error('Bank activation error:', err)
      alert('Failed to request bank activation')
    } finally {
      setRequestingBank(false)
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
            <Link href="/admin/pm/landlords" className="btn btn-primary">
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

  const { landlord, properties, agreements, pendingDisbursements, repairs, recentActivity, setupStatus } = data

  return (
    <div className="min-h-screen bg-luxury-light">
      {/* Admin Preview Banner */}
      {isAdminPreview && (
        <div className="bg-amber-500 text-white px-6 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={16} />
              <span className="text-sm font-medium">
                Admin Preview — Viewing as {landlord.first_name} {landlord.last_name}
              </span>
            </div>
            <Link 
              href={`/admin/pm/landlords/${landlord.id}`}
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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/CRC-Luxury-Logo.png"
              alt="Collective Realty Co."
              className="h-10 object-contain"
            />
            <div>
              <h1 className="font-semibold text-luxury-gray-1">Landlord Portal</h1>
              <p className="text-sm text-luxury-gray-3">Collective Realty Co.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-luxury-gray-1">{landlord.first_name} {landlord.last_name}</p>
              <p className="text-sm text-luxury-gray-3">{landlord.email}</p>
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
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Setup Warning Banner */}
        {(!setupStatus.w9Complete || !setupStatus.bankConnected) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800">Complete Your Account Setup</h3>
                <p className="text-sm text-amber-700 mt-1">
                  To receive disbursements, please complete the following:
                </p>
                <ul className="text-sm text-amber-700 mt-2 space-y-1">
                  {!setupStatus.w9Complete && (
                    <li className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      Submit your W9 form
                    </li>
                  )}
                  {!setupStatus.bankConnected && (
                    <li className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      Connect your bank account for ACH deposits
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Properties */}
          <div className="lg:col-span-2">
            <div className="container-card">
              <h2 className="field-label mb-4 flex items-center gap-2">
                <Home size={16} />
                Your Properties
              </h2>

              {properties.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 size={48} className="text-luxury-gray-4 mx-auto mb-3" />
                  <p className="text-luxury-gray-3">No properties yet</p>
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
                              Lease: {formatDate(activeLease.lease_start)} — {formatDate(activeLease.lease_end)}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
                            <Clock size={16} className="inline mr-1" />
                            No active lease — property is vacant
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
                    <button
                      onClick={requestW9Form}
                      disabled={requestingW9}
                      className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1"
                    >
                      {requestingW9 ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      {requestingW9 ? 'Loading...' : 'Submit W9'}
                    </button>
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
                    <button
                      onClick={requestBankActivation}
                      disabled={requestingBank}
                      className="btn btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                    >
                      {requestingBank ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                      {requestingBank ? 'Sending...' : 'Connect Bank'}
                    </button>
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
                        Gross: {formatMoney(d.gross_rent)} — Fee: {formatMoney(d.management_fee)}
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

        {/* Repairs Section */}
        <div className="container-card mt-6">
          <h2 className="field-label mb-4 flex items-center gap-2">
            <Wrench size={16} />
            Repair Requests
          </h2>
          {repairs.length === 0 ? (
            <div className="text-center py-6">
              <Wrench size={32} className="mx-auto text-luxury-gray-4 mb-2" />
              <p className="text-sm text-luxury-gray-3">No repair requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {repairs.slice(0, 5).map((repair) => (
                <div key={repair.id} className="inner-card">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-medium text-luxury-gray-1">{repair.title}</p>
                      <p className="text-xs text-luxury-gray-3">
                        {repair.managed_properties?.property_address} • {repair.category}
                      </p>
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
                  <div className="flex items-center justify-between text-xs text-luxury-gray-3">
                    <span>{formatDate(repair.created_at)}</span>
                    {repair.actual_cost && (
                      <span className="font-medium text-luxury-gray-1">{formatMoney(repair.actual_cost)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {recentActivity && recentActivity.length > 0 && (
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

export default function LandlordDashboardPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LandlordDashboardContent />
    </Suspense>
  )
}