'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ListingCoordination, Listing } from '@/types/listing-coordination'
import { Send, Trash2, X } from 'lucide-react'

interface CoordinationWithListing extends ListingCoordination {
  listing?: Listing
  agent_name?: string
  transaction_type?: string
}

export default function AdminCoordinationDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
        const data = await response.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    if (!user) fetchUser()
  }, [router, user])
  const [coordinations, setCoordinations] = useState<CoordinationWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [activeTab, setActiveTab] = useState<'list' | 'emails'>('list')
  const [showSendReportsModal, setShowSendReportsModal] = useState(false)
  const [sendingReports, setSendingReports] = useState(false)

  useEffect(() => {
    loadCoordinations()
  }, [filter])

  const loadCoordinations = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/coordination/list?filter=${filter}`)
      const data = await response.json()
      if (data.success) {
        setCoordinations(data.coordinations)
      }
    } catch (error) {
      console.error('Error loading coordinations:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCoordinations = coordinations.filter(c => {
    if (filter === 'active') return c.is_active
    if (filter === 'inactive') return !c.is_active
    return true
  })

  const handleDeleteCoordination = async (coordinationId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this coordination? This will permanently delete:\n\n- The coordination record\n- All email history\n- All weekly reports\n\nThis action cannot be undone.'
      )
    ) {
      return
    }
    try {
      const response = await fetch('/api/coordination/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId, userId: user?.id }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Coordination deleted successfully')
        loadCoordinations()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error deleting coordination:', error)
      alert('Failed to delete coordination')
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleSendAllReports = async () => {
    setSendingReports(true)
    try {
      const response = await fetch('/api/coordination/send-all-weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      })
      const data = await response.json()
      if (data.success) {
        alert(`Successfully sent ${data.sent} report(s).`)
        setShowSendReportsModal(false)
        loadCoordinations()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error sending reports:', error)
      alert('Failed to send reports')
    } finally {
      setSendingReports(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">LISTINGS</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowSendReportsModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Send size={14} /> Send All Reports
          </button>
          <button
            onClick={() => router.push('/admin/coordination/activate')}
            className="btn btn-secondary"
          >
            Activate Coordination
          </button>
        </div>
      </div>

      <div className="container-card">
        {/* Tabs */}
        <div className="flex space-x-2 border-b border-luxury-gray-5/50 mb-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-xs transition-colors ${
              activeTab === 'list'
                ? 'border-b-2 border-luxury-accent text-luxury-gray-1 font-semibold'
                : 'text-luxury-gray-3 hover:text-luxury-gray-1'
            }`}
          >
            Coordinations
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`px-4 py-2 text-xs transition-colors flex items-center gap-1.5 ${
              activeTab === 'emails'
                ? 'border-b-2 border-luxury-accent text-luxury-gray-1 font-semibold'
                : 'text-luxury-gray-3 hover:text-luxury-gray-1'
            }`}
          >
            <Send size={13} />
            Sent Emails ({coordinations.filter(c => c.last_email_sent_at).length})
          </button>
        </div>

        {/* Status Filter */}
        {activeTab === 'list' && (
          <div className="flex gap-2 mb-4">
            {(['active', 'inactive', 'all'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`btn text-sm capitalize ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
              >
                {status} (
                {status === 'active'
                  ? coordinations.filter(c => c.is_active).length
                  : status === 'inactive'
                    ? coordinations.filter(c => !c.is_active).length
                    : coordinations.length}
                )
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading...</p>
          </div>
        ) : filteredCoordinations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No coordinations found</p>
            {filter === 'active' && (
              <button
                onClick={() => router.push('/admin/coordination/activate')}
                className="btn btn-primary"
              >
                Activate First Coordination
              </button>
            )}
          </div>
        ) : activeTab === 'list' ? (
          <div className="space-y-3">
            {filteredCoordinations.map(coordination => (
              <div key={coordination.id} className="inner-card">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">
                      {coordination.listing?.property_address || 'Unknown Address'}
                    </h3>
                    <p className="text-xs text-luxury-gray-3 mb-3">
                      Seller: {coordination.seller_name} · Agent:{' '}
                      {coordination.agent_name || 'Unknown'}
                      {coordination.transaction_type ? ` · ${coordination.transaction_type}` : ''}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-luxury-gray-3">Status</p>
                        <p className="text-xs font-medium">
                          {coordination.is_active ? (
                            <span className="text-green-700">Active</span>
                          ) : (
                            <span className="text-luxury-gray-3">Inactive</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Start Date</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {formatDate(coordination.start_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Service Fee</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          ${coordination.service_fee}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Payment</p>
                        <p className="text-xs font-medium">
                          {coordination.service_paid ? (
                            <span className="text-green-700">Paid</span>
                          ) : (
                            <span className="text-red-600">Unpaid</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Emails Sent</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {coordination.total_emails_sent}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Last Email</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {formatDate(coordination.last_email_sent_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Next Scheduled</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {coordination.next_email_scheduled_for
                            ? new Date(coordination.next_email_scheduled_for).toLocaleString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }
                              )
                            : 'Not scheduled'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Welcome Email</p>
                        <p className="text-xs font-medium">
                          {coordination.welcome_email_sent ? (
                            <span className="text-green-700">Sent</span>
                          ) : (
                            <span className="text-luxury-gray-3">Not Sent</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/admin/coordination/${coordination.id}`)}
                      className="btn btn-primary text-xs"
                    >
                      Manage
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleDeleteCoordination(coordination.id)
                      }}
                      className="btn text-xs bg-white border border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Emails Tab */
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {coordinations
                .filter(c => c.last_email_sent_at)
                .sort((a, b) =>
                  new Date(b.last_email_sent_at || 0).getTime() -
                  new Date(a.last_email_sent_at || 0).getTime()
                )
                .map(coordination => (
                  <div
                    key={coordination.id}
                    className="inner-card cursor-pointer"
                    onClick={() => router.push(`/admin/coordination/${coordination.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-luxury-gray-1 truncate flex-1">
                        {coordination.listing?.property_address || 'N/A'}
                      </p>
                      <span className={`badge ${coordination.is_active ? 'badge-success' : 'badge-neutral'}`}>
                        {coordination.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-luxury-gray-3 mb-2">
                      {coordination.seller_name} · {coordination.agent_name || 'Unknown'}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-luxury-gray-3">{coordination.total_emails_sent || 0} sent</span>
                        <span className={coordination.welcome_email_sent ? 'text-green-700' : 'text-luxury-gray-3'}>
                          {coordination.welcome_email_sent ? 'Welcome sent' : 'No welcome'}
                        </span>
                      </div>
                      <span className="text-luxury-gray-3">
                        {coordination.last_email_sent_at
                          ? new Date(coordination.last_email_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                ))}
              {coordinations.filter(c => c.last_email_sent_at).length === 0 && (
                <p className="text-center py-12 text-sm text-luxury-gray-3">No emails sent yet</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Property</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Seller</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Agent</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Last Sent</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Total</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Welcome</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Status</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {coordinations
                    .filter(c => c.last_email_sent_at)
                    .sort((a, b) =>
                      new Date(b.last_email_sent_at || 0).getTime() -
                      new Date(a.last_email_sent_at || 0).getTime()
                    )
                    .map(coordination => (
                      <tr
                        key={coordination.id}
                        className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/admin/coordination/${coordination.id}`)}
                      >
                        <td className="py-3 px-4 text-sm font-medium text-luxury-gray-1">{coordination.listing?.property_address || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-luxury-gray-2">{coordination.seller_name}</td>
                        <td className="py-3 px-4 text-sm text-luxury-gray-2">{coordination.agent_name || 'Unknown'}</td>
                        <td className="py-3 px-4 text-xs text-luxury-gray-3">
                          {coordination.last_email_sent_at
                            ? new Date(coordination.last_email_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-sm text-luxury-gray-2">{coordination.total_emails_sent || 0}</td>
                        <td className="py-3 px-4 text-xs">
                          {coordination.welcome_email_sent ? <span className="text-green-700">Sent</span> : <span className="text-luxury-gray-3">No</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`badge ${coordination.is_active ? 'badge-success' : 'badge-neutral'}`}>
                            {coordination.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleDeleteCoordination(coordination.id)} className="text-red-600 hover:text-red-800 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {coordinations.filter(c => c.last_email_sent_at).length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-luxury-gray-3">No emails sent yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Send All Reports Modal */}
      {showSendReportsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Send All Weekly Reports</h2>
              <button
                onClick={() => setShowSendReportsModal(false)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-luxury-gray-3 mb-5">
              This will send weekly reports to all active coordinations now.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSendReportsModal(false)}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSendAllReports}
                disabled={sendingReports}
                className="flex-1 btn btn-primary disabled:opacity-50"
              >
                {sendingReports ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
