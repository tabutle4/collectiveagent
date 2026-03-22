'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ListingCoordination, Listing } from '@/types/listing-coordination'
import { Send, Mail, Trash2, Loader2, Check } from 'lucide-react'

export default function CoordinationDetailPage() {
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
  const params = useParams()
  const coordinationId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingEmail, setSendingEmail] = useState<'welcome' | 'weekly' | null>(null)
  const [coordination, setCoordination] = useState<ListingCoordination | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentSearch, setAgentSearch] = useState<string>('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [emailHistory, setEmailHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [hasWelcomeEmailInHistory, setHasWelcomeEmailInHistory] = useState(false)
  const [weeklyReports, setWeeklyReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  const [editData, setEditData] = useState({
    // Coordination fields
    seller_name: '',
    seller_email: '',
    listing_website_url: '',
    service_paid: false,
    onedrive_folder_url: '',
    // Listing fields
    agent_name: '',
    property_address: '',
    transaction_type: 'sale' as 'sale' | 'lease',
    client_names: '',
    client_phone: '',
    client_email: '',
    mls_link: '',
    estimated_launch_date: '',
    actual_launch_date: '',
    lead_source: '',
    status: 'pre-listing' as
      | 'pre-listing'
      | 'active'
      | 'pending'
      | 'sold'
      | 'expired'
      | 'cancelled',
  })

  useEffect(() => {
    loadCoordination()
    loadAgents()
    loadEmailHistory()
    loadWeeklyReports()

    // Close dropdown when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.agent-selector')) {
        setAgentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [coordinationId])

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/agents/list?licensed_only=true')
      const agentsData = await res.json()
      
      if (res.ok && agentsData.agents) {
        // API already returns { id, name, displayName } - just sort
        const agentsList = agentsData.agents
          .map((agent: any) => ({
            id: agent.id,
            name: agent.name || agent.displayName || 'Unknown',
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
        setAgents(agentsList)
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    }
  }

  const filteredAgents = () => {
    const search = agentSearch.toLowerCase()
    return agents.filter(agent => agent.name.toLowerCase().includes(search))
  }

  const selectAgent = (agentName: string, agentId: string) => {
    setEditData({ ...editData, agent_name: agentName })
    setAgentSearch('')
    setAgentDropdownOpen(false)
  }

  const loadEmailHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=email_history`)
      const historyData = await res.json()

      if (res.ok && historyData.emailHistory) {
        setEmailHistory(historyData.emailHistory)
        // Check if welcome email exists in history
        const welcomeEmail = historyData.emailHistory.find((email: any) => email.email_type === 'welcome')
        setHasWelcomeEmailInHistory(!!welcomeEmail)
      }
    } catch (error) {
      console.error('Error loading email history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadWeeklyReports = async () => {
    setLoadingReports(true)
    try {
      const res = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=weekly_reports`)
      const reportsData = await res.json()

      if (res.ok && reportsData.weeklyReports) {
        setWeeklyReports(reportsData.weeklyReports)
      }
    } catch (error) {
      console.error('Error loading weekly reports:', error)
    } finally {
      setLoadingReports(false)
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    if (
      !confirm('Are you sure you want to delete this weekly report? This action cannot be undone.')
    ) {
      return
    }

    setDeletingReportId(reportId)
    try {
      const response = await fetch('/api/coordination/delete-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, userId: user?.id }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert('Weekly report deleted successfully!')
        loadWeeklyReports() // Reload reports
      } else {
        alert(`Error deleting report: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting report:', error)
      alert('Failed to delete report.')
    } finally {
      setDeletingReportId(null)
    }
  }

  // FIX: Added showLoading parameter to avoid loading flash after save
  const loadCoordination = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const response = await fetch(`/api/coordination/get?id=${coordinationId}`)
      const data = await response.json()

      if (data.success) {
        setCoordination(data.coordination)
        setListing(data.listing)

        setEditData({
          seller_name: data.coordination.seller_name || '',
          seller_email: data.coordination.seller_email || '',
          listing_website_url: data.listing?.listing_website_url || '',
          service_paid: data.coordination.service_paid || false,
          onedrive_folder_url: data.coordination.onedrive_folder_url || '',
          agent_name: data.listing?.agent_name || '',
          property_address: data.listing?.property_address || '',
          transaction_type: data.listing?.transaction_type || 'sale',
          client_names: data.listing?.client_names || '',
          client_phone: data.listing?.client_phone || '',
          client_email: data.listing?.client_email || '',
          mls_link: data.listing?.mls_link || '',
          estimated_launch_date: data.listing?.estimated_launch_date
            ? data.listing.estimated_launch_date.split('T')[0]
            : '',
          actual_launch_date: data.listing?.actual_launch_date
            ? data.listing.actual_launch_date.split('T')[0]
            : '',
          lead_source: data.listing?.lead_source || '',
          status: data.listing?.status || 'pre-listing',
        })
      } else {
        console.error('Failed to load coordination:', data.error)
      }
    } catch (error) {
      console.error('Error loading coordination:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!coordination || !listing) return

    setSaving(true)
    try {
      // Find the agent ID from the selected name
      const selectedAgent = agents.find(a => a.name === editData.agent_name)

      const response = await fetch('/api/coordination/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinationId: coordination.id,
          listingId: listing.id,
          coordinationData: {
            seller_name: editData.seller_name,
            seller_email: editData.seller_email,
            service_paid: editData.service_paid,
            onedrive_folder_url: editData.onedrive_folder_url,
          },
          listingData: {
            agent_id: selectedAgent?.id || listing.agent_id,
            agent_name: editData.agent_name,
            listing_website_url: editData.listing_website_url,
            property_address: editData.property_address,
            transaction_type: editData.transaction_type,
            client_names: editData.client_names,
            client_phone: editData.client_phone,
            client_email: editData.client_email,
            mls_link: editData.mls_link,
            estimated_launch_date: editData.estimated_launch_date || null,
            actual_launch_date: editData.actual_launch_date || null,
            lead_source: editData.lead_source,
            status: editData.status,
          },
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Changes saved successfully!')
        // FIX: Reload without showing loading state to avoid flash
        await loadCoordination(false)
      } else {
        alert(`Error saving changes: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!coordination || !listing) return

    if (editData.onedrive_folder_url) {
      if (
        !confirm(
          'A OneDrive folder URL already exists. Do you want to create a new folder and replace the link?'
        )
      ) {
        return
      }
    }

    try {
      const response = await fetch('/api/coordination/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinationId: coordination.id,
          propertyAddress: editData.property_address,
          agentName: editData.agent_name,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('OneDrive folder created successfully!')
        loadCoordination() // Reload to get updated link
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating folder:', error)
      alert('Failed to create OneDrive folder.')
    }
  }

  const handleSendWelcomeEmail = async () => {
    if (!coordination || !listing) return

    // Check if welcome email was already sent
    if (hasWelcomeEmailInHistory) {
      if (!confirm('A welcome email was already sent. Do you want to send another one?')) {
        return
      }
    }

    setSendingEmail('welcome')
    try {
      const response = await fetch('/api/coordination/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinationId: coordination.id,
          listingId: listing.id,
          sellerName: editData.seller_name,
          sellerEmail: editData.seller_email,
          propertyAddress: editData.property_address,
          agentName: editData.agent_name,
          onedriveFolderUrl: editData.onedrive_folder_url || null,
          userId: user?.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Welcome email sent successfully!')
        loadEmailHistory() // Reload email history
        loadCoordination()
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error sending welcome email:', error)
      alert('Failed to send welcome email.')
    } finally {
      setSendingEmail(null)
    }
  }

  const handleSendWeeklyEmail = async () => {
    if (!coordination || !listing) return

    setSendingEmail('weekly')
    try {
      const response = await fetch('/api/coordination/send-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinationId: coordination.id,
          listingId: listing.id,
          sellerName: editData.seller_name,
          sellerEmail: editData.seller_email,
          propertyAddress: editData.property_address,
          agentName: editData.agent_name,
          userId: user?.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Weekly report email sent successfully!')
        loadEmailHistory() // Reload email history
        loadCoordination()
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error sending weekly email:', error)
      alert('Failed to send weekly email.')
    } finally {
      setSendingEmail(null)
    }
  }

  const handleDeactivate = async () => {
    if (!coordination) return

    if (
      !confirm(
        'Are you sure you want to deactivate this coordination? The weekly report cron will skip it.'
      )
    ) {
      return
    }

    try {
      const response = await fetch('/api/coordination/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId: coordination.id }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Coordination deactivated.')
        loadCoordination()
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deactivating:', error)
      alert('Failed to deactivate.')
    }
  }

  const handleReactivate = async () => {
    if (!coordination) return

    try {
      const response = await fetch('/api/coordination/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId: coordination.id }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Coordination reactivated.')
        loadCoordination()
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error reactivating:', error)
      alert('Failed to reactivate.')
    }
  }

  const handleDeleteCoordination = async () => {
    if (!coordination) return

    if (
      !confirm(
        'Are you sure you want to DELETE this coordination? This will also delete the associated listing record. This action cannot be undone.'
      )
    ) {
      return
    }

    try {
      const response = await fetch('/api/coordination/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId: coordination.id }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Coordination deleted.')
        router.push('/admin/coordination')
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting:', error)
      alert('Failed to delete.')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light flex items-center justify-center">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  if (!coordination || !listing) {
    return (
      <div className="min-h-screen bg-luxury-light flex items-center justify-center">
        <p className="text-luxury-gray-2">Coordination not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-light p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.back()} className="text-sm text-luxury-gray-2 hover:underline">
            ← Back
          </button>
          <div className="flex items-center gap-2">
            {coordination.is_active ? (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Active</span>
            ) : (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Inactive</span>
            )}
            {editData.service_paid && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded flex items-center gap-1">
                <Check className="w-3 h-3" /> Paid
              </span>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-luxury-gray-1 mb-6">
          {editData.property_address || 'No Address'}
        </h1>

        {/* Edit Form */}
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Listing Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Agent Name - Dropdown Search */}
            <div className="agent-selector relative">
              <label className="text-xs text-luxury-gray-3 block mb-1">Agent Name</label>
              <input
                className="input-luxury w-full"
                value={agentDropdownOpen ? agentSearch : editData.agent_name}
                onChange={e => {
                  setAgentSearch(e.target.value)
                  setAgentDropdownOpen(true)
                }}
                onFocus={() => {
                  setAgentSearch('')
                  setAgentDropdownOpen(true)
                }}
                placeholder="Search agents..."
              />
              {agentDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filteredAgents().length === 0 ? (
                    <div className="px-3 py-2 text-sm text-luxury-gray-3">No agents found</div>
                  ) : (
                    filteredAgents().map(agent => (
                      <div
                        key={agent.id}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-luxury-light"
                        onClick={() => selectAgent(agent.name, agent.id)}
                      >
                        {agent.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Property Address</label>
              <input
                className="input-luxury w-full"
                value={editData.property_address}
                onChange={e => setEditData({ ...editData, property_address: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Transaction Type</label>
              <select
                className="input-luxury w-full"
                value={editData.transaction_type}
                onChange={e =>
                  setEditData({ ...editData, transaction_type: e.target.value as 'sale' | 'lease' })
                }
              >
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Status</label>
              <select
                className="input-luxury w-full"
                value={editData.status}
                onChange={e =>
                  setEditData({
                    ...editData,
                    status: e.target.value as
                      | 'pre-listing'
                      | 'active'
                      | 'pending'
                      | 'sold'
                      | 'expired'
                      | 'cancelled',
                  })
                }
              >
                <option value="pre-listing">Pre-Listing</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="sold">Sold</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Client Name(s)</label>
              <input
                className="input-luxury w-full"
                value={editData.client_names}
                onChange={e => setEditData({ ...editData, client_names: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Client Phone</label>
              <input
                className="input-luxury w-full"
                value={editData.client_phone}
                onChange={e => setEditData({ ...editData, client_phone: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Client Email</label>
              <input
                className="input-luxury w-full"
                value={editData.client_email}
                onChange={e => setEditData({ ...editData, client_email: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">MLS Link</label>
              <input
                className="input-luxury w-full"
                value={editData.mls_link}
                onChange={e => setEditData({ ...editData, mls_link: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Est. Launch Date</label>
              <input
                type="date"
                className="input-luxury w-full"
                value={editData.estimated_launch_date}
                onChange={e => setEditData({ ...editData, estimated_launch_date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Actual Launch Date</label>
              <input
                type="date"
                className="input-luxury w-full"
                value={editData.actual_launch_date}
                onChange={e => setEditData({ ...editData, actual_launch_date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Lead Source</label>
              <input
                className="input-luxury w-full"
                value={editData.lead_source}
                onChange={e => setEditData({ ...editData, lead_source: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Listing Website URL</label>
              <input
                className="input-luxury w-full"
                value={editData.listing_website_url}
                onChange={e => setEditData({ ...editData, listing_website_url: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Coordination Details */}
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Seller / Coordination Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Seller Name</label>
              <input
                className="input-luxury w-full"
                value={editData.seller_name}
                onChange={e => setEditData({ ...editData, seller_name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-luxury-gray-3 block mb-1">Seller Email</label>
              <input
                className="input-luxury w-full"
                value={editData.seller_email}
                onChange={e => setEditData({ ...editData, seller_email: e.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-luxury-gray-3 block mb-1">OneDrive Folder URL</label>
              <div className="flex gap-2">
                <input
                  className="input-luxury flex-1"
                  value={editData.onedrive_folder_url}
                  onChange={e => setEditData({ ...editData, onedrive_folder_url: e.target.value })}
                  placeholder="Paste OneDrive folder link or create one"
                />
                <button onClick={handleCreateFolder} className="btn-primary px-4 text-sm">
                  Create Folder
                </button>
              </div>
              {editData.onedrive_folder_url && (
                <a
                  href={editData.onedrive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-luxury-gold hover:underline mt-1 inline-block"
                >
                  Open Folder →
                </a>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editData.service_paid}
                  onChange={e => setEditData({ ...editData, service_paid: e.target.checked })}
                />
                <span className="text-sm">Service Paid</span>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end mb-6">
          <button onClick={handleSave} disabled={saving} className="btn-primary px-8 py-2.5">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Communication Section */}
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Communication</h2>
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleSendWelcomeEmail}
              disabled={sendingEmail !== null}
              className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {hasWelcomeEmailInHistory ? (
                <>
                  <Mail className="w-4 h-4" />
                  {sendingEmail === 'welcome' ? 'Sending...' : 'Resend Welcome Email'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {sendingEmail === 'welcome' ? 'Sending...' : 'Send Welcome Email'}
                </>
              )}
            </button>
            <button
              onClick={handleSendWeeklyEmail}
              disabled={sendingEmail !== null}
              className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingEmail === 'weekly' ? 'Sending...' : 'Send Weekly Report Email'}
            </button>
          </div>

          {/* Email History */}
          <div className="mt-6 pt-6 border-t border-luxury-gray-5">
            <h3 className="text-base font-medium mb-4">Email History</h3>
            {loadingHistory ? (
              <p className="text-sm text-luxury-gray-2">Loading...</p>
            ) : emailHistory.length === 0 ? (
              <p className="text-sm text-luxury-gray-2">No emails sent yet</p>
            ) : (
              <div className="space-y-3">
                {emailHistory.map(email => (
                  <div key={email.id} className="bg-luxury-light p-4 rounded">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {email.email_type === 'welcome' ? 'Welcome Email' : 'Weekly Report Email'}
                        </p>
                        <p className="text-xs text-luxury-gray-2 mt-1">
                          To: {email.recipient_email}
                        </p>
                        <p className="text-xs text-luxury-gray-2">Subject: {email.subject}</p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          email.status === 'sent'
                            ? 'bg-green-100 text-green-800'
                            : email.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {email.status}
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-luxury-gray-5">
                      <p className="text-xs text-luxury-gray-2">
                        Sent: {formatDate(email.sent_at)}
                      </p>
                      {email.resend_email_id && (
                        <p className="text-xs text-luxury-gray-2 mt-1">
                          Resend ID:{' '}
                          <span className="font-mono text-xs">{email.resend_email_id}</span>
                        </p>
                      )}
                      {email.error_message && (
                        <p className="text-xs text-red-600 mt-1">Error: {email.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Weekly Reports Section */}
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Weekly Reports</h2>
          {loadingReports ? (
            <div className="text-center py-8">
              <p className="text-luxury-gray-2">Loading reports...</p>
            </div>
          ) : weeklyReports.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-luxury-gray-2">No weekly reports uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyReports.map(report => (
                <div
                  key={report.id}
                  className="bg-luxury-light p-4 rounded border border-luxury-gray-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">
                        Week of{' '}
                        {new Date(report.week_start_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        -{' '}
                        {new Date(report.week_end_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {report.report_file_url && (
                          <a
                            href={report.report_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-luxury-gold hover:underline"
                          >
                            Showing Report
                          </a>
                        )}
                        {report.report_file_url_2 && (
                          <a
                            href={report.report_file_url_2}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-luxury-gold hover:underline"
                          >
                            Traffic Report
                          </a>
                        )}
                      </div>
                      {report.email_sent && (
                        <p className="text-xs text-green-600 mt-2">
                          ✓ Email sent on{' '}
                          {report.email_sent_at
                            ? new Date(report.email_sent_at).toLocaleDateString('en-US')
                            : 'N/A'}
                        </p>
                      )}
                      {!report.email_sent && report.email_scheduled_for && (
                        <p className="text-xs text-blue-600 mt-2">
                          📅 Scheduled for{' '}
                          {new Date(report.email_scheduled_for).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                      {!report.email_sent && !report.email_scheduled_for && (
                        <p className="text-xs text-luxury-gray-2 mt-2">⏳ Not scheduled</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      disabled={deletingReportId === report.id}
                      className="ml-4 px-3 py-1.5 text-xs rounded transition-colors bg-white border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {deletingReportId === report.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Other Actions */}
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Other Actions</h2>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => router.push(`/admin/coordination/upload-report/${coordinationId}`)}
              className="px-6 py-2.5 text-sm rounded transition-colors btn-primary"
            >
              Upload Weekly Report
            </button>
            {coordination.is_active ? (
              <button
                onClick={handleDeactivate}
                className="px-6 py-2.5 text-sm rounded transition-colors bg-red-600 text-white hover:bg-red-700"
              >
                Deactivate Coordination
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                className="px-6 py-2.5 text-sm rounded transition-colors bg-green-600 text-white hover:bg-green-700"
              >
                Reactivate Coordination
              </button>
            )}
            <button
              onClick={handleDeleteCoordination}
              className="px-6 py-2.5 text-sm rounded transition-colors bg-white border border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Coordination
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}