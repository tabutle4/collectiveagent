'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ListingCoordination, Listing } from '@/types/listing-coordination'
import { Send, Mail, Trash2, Calendar, Clock, X } from 'lucide-react'

interface CoordinationWithListing extends ListingCoordination {
  listing?: Listing
  agent_name?: string
}

export default function AdminCoordinationDashboard() {
  const router = useRouter()
  const [coordinations, setCoordinations] = useState<CoordinationWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [activeTab, setActiveTab] = useState<'list' | 'emails'>('list')
  const [showSendReportsModal, setShowSendReportsModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [sendingReports, setSendingReports] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('18:00')
  const [applyToAll, setApplyToAll] = useState(true)
  
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
    if (!confirm('Are you sure you want to delete this coordination? This will permanently delete:\n\n- The coordination record\n- All email history\n- All weekly reports\n\nThis action cannot be undone.')) {
      return
    }

    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        alert('You must be logged in to delete')
        return
      }

      const user = JSON.parse(userStr)
      
      const response = await fetch('/api/coordination/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinationId,
          userId: user.id,
        }),
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
      year: 'numeric'
    })
  }
  
  const handleSendAllReports = async (sendNow: boolean) => {
    setSendingReports(true)
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        alert('You must be logged in')
        return
      }
      
      const user = JSON.parse(userStr)
      
      const response = await fetch('/api/coordination/send-all-weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          send_now: sendNow,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(`Successfully ${sendNow ? 'sent' : 'scheduled'} ${data.sent || data.scheduled} report(s).`)
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
  
  const handleScheduleEmails = async () => {
    if (!scheduleDate || !scheduleTime) {
      alert('Please select both date and time')
      return
    }
    
    setScheduling(true)
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        alert('You must be logged in')
        return
      }
      
      const user = JSON.parse(userStr)
      
      const response = await fetch('/api/coordination/update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          scheduleDate,
          scheduleTime,
          applyToAll,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(data.message || 'Schedule updated successfully')
        setShowScheduleModal(false)
        loadCoordinations()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error scheduling emails:', error)
      alert('Failed to schedule emails')
    } finally {
      setScheduling(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="card-section mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h1 className="text-2xl font-light tracking-luxury mb-4 md:mb-0">
              Listing Coordination Management
            </h1>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowSendReportsModal(true)}
                className="px-4 py-2 text-sm rounded transition-colors bg-blue-600 text-white hover:opacity-90 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send All Weekly Reports
              </button>
              <button
                onClick={() => {
                  const now = new Date()
                  setScheduleDate(now.toISOString().split('T')[0])
                  setScheduleTime('18:00')
                  setShowScheduleModal(true)
                }}
                className="px-4 py-2 text-sm rounded transition-colors bg-green-600 text-white hover:opacity-90 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Schedule Emails
              </button>
              <button
                onClick={() => router.push('/admin/coordination/activate')}
                className="px-4 py-2 text-sm rounded transition-colors btn-primary"
              >
                Activate Coordination
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-2 border-b border-luxury-gray-5 mb-4">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'list'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              Coordinations
            </button>
            <button
              onClick={() => setActiveTab('emails')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'emails'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              <Send className="w-4 h-4 inline mr-2" />
              Sent Emails ({coordinations.filter(c => c.last_email_sent_at).length})
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="flex space-x-2 border-b border-luxury-gray-5 mb-4">
              <button
                onClick={() => setFilter('active')}
                className={`px-4 py-2 text-sm transition-colors ${
                  filter === 'active'
                    ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                    : 'text-luxury-gray-2 hover:text-luxury-black'
                }`}
              >
                Active ({coordinations.filter(c => c.is_active).length})
              </button>
              <button
                onClick={() => setFilter('inactive')}
                className={`px-4 py-2 text-sm transition-colors ${
                  filter === 'inactive'
                    ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                    : 'text-luxury-gray-2 hover:text-luxury-black'
                }`}
              >
                Inactive ({coordinations.filter(c => !c.is_active).length})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 text-sm transition-colors ${
                  filter === 'all'
                    ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                    : 'text-luxury-gray-2 hover:text-luxury-black'
                }`}
              >
                All ({coordinations.length})
              </button>
            </div>
          )}
        </div>
        
        {loading ? (
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        ) : filteredCoordinations.length === 0 ? (
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2 mb-4">No coordinations found</p>
            {filter === 'active' && (
              <button
                onClick={() => router.push('/admin/coordination/activate')}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-primary"
              >
                Activate First Coordination
              </button>
            )}
          </div>
        ) : activeTab === 'list' ? (
          <div className="space-y-4">
            {filteredCoordinations.map((coordination) => (
              <div key={coordination.id} className="card-section">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium mb-1">
                      {coordination.listing?.property_address || 'Unknown Address'}
                    </h3>
                    <p className="text-sm text-luxury-gray-2 mb-2">
                      Seller: {coordination.seller_name} • Agent: {coordination.agent_name || 'Unknown'}
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-luxury-gray-2">Status</p>
                        <p className="text-sm font-medium">
                          {coordination.is_active ? (
                            <span className="text-green-600">Active</span>
                          ) : (
                            <span className="text-luxury-gray-2">Inactive</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Start Date</p>
                        <p className="text-sm">{formatDate(coordination.start_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Service Fee</p>
                        <p className="text-sm">${coordination.service_fee} <span className="text-xs text-luxury-gray-2">(one time)</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Payment Status</p>
                        <p className="text-sm">
                          {coordination.service_paid ? (
                            <span className="text-green-600">Paid</span>
                          ) : (
                            <span className="text-red-600">Unpaid</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Emails Sent</p>
                        <p className="text-sm">{coordination.total_emails_sent}</p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Last Email</p>
                        <p className="text-sm">{formatDate(coordination.last_email_sent_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Next Scheduled</p>
                        <p className="text-sm">
                          {coordination.next_email_scheduled_for ? (
                            new Date(coordination.next_email_scheduled_for).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          ) : (
                            <span className="text-luxury-gray-2">Not scheduled</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-2">Welcome Email</p>
                        <p className="text-sm">
                          {coordination.welcome_email_sent ? (
                            <span className="text-green-600">Sent</span>
                          ) : (
                            <span className="text-luxury-gray-2">Not Sent</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 md:mt-0 md:ml-4 flex flex-col space-y-2">
                    <button
                      onClick={() => router.push(`/admin/coordination/${coordination.id}`)}
                      className="px-4 py-2 text-sm rounded transition-colors btn-primary"
                    >
                      Manage
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCoordination(coordination.id)
                      }}
                      className="px-4 py-2 text-sm rounded transition-colors bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-section">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5">
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Property</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Seller</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Agent</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Last Email Sent</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Total Emails</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Welcome Sent</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinations
                    .filter(c => c.last_email_sent_at)
                    .sort((a, b) => new Date(b.last_email_sent_at || 0).getTime() - new Date(a.last_email_sent_at || 0).getTime())
                    .map((coordination) => (
                      <tr key={coordination.id} className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer" onClick={() => router.push(`/admin/coordination/${coordination.id}`)}>
                        <td className="py-3 px-4 text-sm">
                          {coordination.listing?.property_address || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {coordination.seller_name}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {coordination.agent_name || 'Unknown'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {coordination.last_email_sent_at ? new Date(coordination.last_email_sent_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }) : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {coordination.total_emails_sent || 0}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {coordination.welcome_email_sent ? (
                            <span className="text-green-600">✓ Sent</span>
                          ) : (
                            <span className="text-luxury-gray-2">Not Sent</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 text-xs rounded ${
                            coordination.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {coordination.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteCoordination(coordination.id)
                            }}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {coordinations.filter(c => c.last_email_sent_at).length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-luxury-gray-2">
                        No emails sent yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Send All Reports Modal */}
        {showSendReportsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-medium">Send All Weekly Reports</h2>
                <button
                  onClick={() => setShowSendReportsModal(false)}
                  className="text-luxury-gray-2 hover:text-luxury-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-luxury-gray-2 mb-6">
                Choose when to send all weekly reports for active coordinations:
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSendAllReports(true)}
                  disabled={sendingReports}
                  className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-blue-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingReports ? 'Sending...' : 'Send Now'}
                </button>
                <button
                  onClick={() => handleSendAllReports(false)}
                  disabled={sendingReports}
                  className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-green-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingReports ? 'Scheduling...' : 'Schedule for Next Monday'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Schedule Emails Modal */}
        {showScheduleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-medium">Schedule Emails</h2>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-luxury-gray-2 hover:text-luxury-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="input-luxury w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="input-luxury w-full"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Apply to all coordinations</span>
                  </label>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowScheduleModal(false)}
                    className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleScheduleEmails}
                    disabled={scheduling}
                    className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-green-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scheduling ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

