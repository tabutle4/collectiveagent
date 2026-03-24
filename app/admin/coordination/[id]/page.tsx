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
  const [agents, setAgents] = useState<Array<{ id: string; name: string; displayName?: string }>>([])
  const [agentSearch, setAgentSearch] = useState<string>('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [emailHistory, setEmailHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [hasWelcomeEmailInHistory, setHasWelcomeEmailInHistory] = useState(false)
  const [weeklyReports, setWeeklyReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  const [editData, setEditData] = useState({
    seller_name: '',
    seller_email: '',
    listing_website_url: '',
    service_paid: false,
    onedrive_folder_url: '',
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
    status: 'pre-listing' as 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled',
  })

  useEffect(() => {
    loadCoordination()
    loadAgents()
    loadEmailHistory()
    loadWeeklyReports()

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
      const response = await fetch('/api/agents/list')
      if (response.ok) {
        const data = await response.json()
        const agentsList = (data.agents || [])
          .map((agent: any) => ({
            id: agent.id,
            name: agent.name || agent.displayName || '',
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
      const response = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=email_history`)
      if (response.ok) {
        const data = await response.json()
        if (data.emailHistory) {
          setEmailHistory(data.emailHistory)
          const welcomeEmail = data.emailHistory.find((email: any) => email.email_type === 'welcome')
          setHasWelcomeEmailInHistory(!!welcomeEmail)
        }
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
      const response = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=weekly_reports`)


      if (response.ok) {
        const data = await response.json()
        if (data.weeklyReports) {
          setWeeklyReports(data.weeklyReports)
        }
      }
    } catch (error) {
      console.error('Error loading weekly reports:', error)
    } finally {
      setLoadingReports(false)
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this weekly report? This action cannot be undone.')) return
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
        loadWeeklyReports()
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
          estimated_launch_date: data.listing?.estimated_launch_date || '',
          actual_launch_date: data.listing?.actual_launch_date || '',
          lead_source: data.listing?.lead_source || '',
          status: data.listing?.status || 'pre-listing',
        })
        setAgentSearch('')
      }
    } catch (error) {
      console.error('Error loading coordination:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/coordination/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordination_id: coordinationId,
          listing_id: listing?.id,
          updates: {
            seller_name: editData.seller_name,
            seller_email: editData.seller_email,
            service_paid: editData.service_paid,
            onedrive_folder_url: editData.onedrive_folder_url,
            payment_date: editData.service_paid && !coordination?.service_paid ? new Date().toISOString() : coordination?.payment_date,
          },
          listing_updates: {
            listing_website_url: editData.listing_website_url,
            agent_name: editData.agent_name,
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
        alert('Updated successfully!')
        await loadCoordination(false)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerateFolderLink = async () => {
    if (!confirm("Regenerate the OneDrive folder sharing link? This will create a new anonymous link that doesn't require Microsoft login.")) return
    setSaving(true)
    try {
      const response = await fetch('/api/coordination/regenerate-folder-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId, userId: user?.id }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        alert('Folder sharing link regenerated successfully!')
        setEditData({ ...editData, onedrive_folder_url: data.sharingUrl })
        loadCoordination(false)
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error regenerating folder link:', error)
      alert('Failed to regenerate folder link.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCoordination = async () => {
    if (!confirm('Are you sure you want to delete this coordination? This will permanently delete:\n\n- The coordination record\n- All email history\n- All weekly reports\n\nThis action cannot be undone.')) return
    try {
      const response = await fetch('/api/coordination/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinationId, userId: user?.id }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Coordination deleted successfully')
        router.push('/admin/coordination')
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error deleting coordination:', error)
      alert('Failed to delete coordination')
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Are you sure you want to deactivate this coordination? Weekly emails will stop.')) return
    try {
      const response = await fetch('/api/coordination/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordination_id: coordinationId, listing_id: listing?.id }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Coordination deactivated successfully')
        loadCoordination(false)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deactivating:', error)
      alert('Failed to deactivate coordination')
    }
  }

  const handleReactivate = async () => {
    if (!confirm('Are you sure you want to reactivate this coordination?')) return
    try {
      const response = await fetch('/api/coordination/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordination_id: coordinationId }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Coordination reactivated successfully')
        loadCoordination(false)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error reactivating:', error)
      alert('Failed to reactivate coordination')
    }
  }

  const handleSendWelcomeEmail = async () => {
    if (!confirm('Send welcome email to the seller?')) return
    setSendingEmail('welcome')
    try {
      const response = await fetch('/api/coordination/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordination_id: coordinationId }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Welcome email sent successfully!')
        loadCoordination(false)
        loadEmailHistory()
      } else {
        alert(`Error: ${data.error || 'Failed to send email'}`)
      }
    } catch (error) {
      console.error('Error sending welcome email:', error)
      alert('Failed to send welcome email')
    } finally {
      setSendingEmail(null)
    }
  }

  const handleSendWeeklyEmail = async () => {
    if (!confirm('Send weekly report email to the seller?')) return
    setSendingEmail('weekly')
    try {
      const response = await fetch('/api/coordination/send-weekly-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordination_id: coordinationId }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Weekly report email sent successfully!')
        loadCoordination(false)
        loadEmailHistory()
      } else {
        alert(`Error: ${data.error || 'Failed to send email'}`)
      }
    } catch (error) {
      console.error('Error sending weekly email:', error)
      alert('Failed to send weekly email')
    } finally {
      setSendingEmail(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="container-card text-center py-12">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  if (!coordination || !listing) {
    return (
      <div className="container-card text-center py-12">
        <p className="text-luxury-gray-2 mb-4">Coordination not found</p>
        <button onClick={() => router.push('/admin/coordination')} className="px-6 py-2.5 text-sm rounded transition-colors btn-primary">
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="container-card mb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push('/admin/coordination')} className="text-sm text-luxury-gray-2 hover:text-luxury-black">
            ← Back to Dashboard
          </button>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 text-xs rounded ${coordination.is_active ? 'bg-green-100 text-green-800' : 'bg-luxury-gray-5 text-luxury-gray-2'}`}>
              {coordination.is_active ? 'Active' : 'Inactive'}
            </span>
            <span className={`px-3 py-1 text-xs rounded ${coordination.service_paid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {coordination.service_paid ? 'Paid' : 'Unpaid'}
            </span>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">{editData.property_address || listing.property_address}</h1>
        <p className="text-sm text-luxury-gray-2">Coordination ID: {coordination.id}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="container-card">
          <p className="text-xs text-luxury-gray-2 mb-1">Service Fee</p>
          <p className="text-xl font-medium">${coordination.service_fee} <span className="text-sm font-normal text-luxury-gray-2">(one time)</span></p>
        </div>
        <div className="container-card">
          <p className="text-xs text-luxury-gray-2 mb-1">Emails Sent</p>
          <p className="text-xl font-medium">{Math.max(coordination.total_emails_sent || 0, emailHistory.length)}</p>
        </div>
        <div className="container-card">
          <p className="text-xs text-luxury-gray-2 mb-1">Start Date</p>
          <p className="text-sm">{formatDate(coordination.start_date)}</p>
        </div>
        <div className="container-card">
          <p className="text-xs text-luxury-gray-2 mb-1">Last Email</p>
          <p className="text-sm">{formatDate(coordination.last_email_sent_at)}</p>
        </div>
        <div className="container-card">
          <p className="text-xs text-luxury-gray-2 mb-1">Next Scheduled</p>
          <p className="text-sm">
            {coordination.next_email_scheduled_for ? new Date(coordination.next_email_scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : <span className="text-luxury-gray-2">Not scheduled</span>}
          </p>
        </div>
      </div>

      {coordination.payment_method === 'agent_pays' && (
        <div className="container-card mb-6">
          <h3 className="text-sm font-medium text-luxury-gold mb-3">Payment Status - Agent Pays</h3>
          <div className="bg-luxury-light p-4 rounded">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Payment Due Date (60 days)</p>
                <p className="text-sm font-medium">{coordination.payment_due_date ? formatDate(coordination.payment_due_date) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Listing Closing Date</p>
                <p className="text-sm font-medium">{listing?.status === 'sold' || listing?.status === 'pending' ? 'At closing' : 'Not yet'}</p>
              </div>
            </div>
            {!coordination.service_paid && coordination.payment_due_date && (
              <>
                {new Date(coordination.payment_due_date) < new Date() ? (
                  <div className="bg-red-50 border border-red-200 p-3 rounded">
                    <p className="text-sm text-red-800 font-medium">⚠️ Payment Overdue</p>
                    <p className="text-xs text-red-700 mt-1">60-day deadline has passed. Fee should be deducted from agent commission.</p>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                    <p className="text-sm text-yellow-800 font-medium">Payment Pending</p>
                    <p className="text-xs text-yellow-700 mt-1">Due within 60 days or at closing, whichever happens first.</p>
                  </div>
                )}
              </>
            )}
            {coordination.service_paid && (
              <div className="bg-green-50 border border-green-200 p-3 rounded">
                <p className="text-sm text-green-800 font-medium">✓ Paid</p>
                {coordination.payment_date && <p className="text-xs text-green-700 mt-1">Paid on: {formatDate(coordination.payment_date)}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {coordination.payment_method === 'agent_pays' && !coordination.service_paid && (listing?.status === 'pending' || listing?.status === 'sold') && (
        <div className="container-card mb-6 bg-red-50 border-red-200">
          <h3 className="text-sm font-medium text-red-800 mb-2">⚠️ Action Required</h3>
          <p className="text-sm text-red-700">This listing is {listing.status} but the $250 coordination fee has not been marked as paid. Payment should be collected at closing or deducted from agent commission.</p>
        </div>
      )}

      <div className="container-card mb-6">
        <h2 className="text-lg font-medium mb-4">Listing Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Property Address</label>
            <input type="text" value={editData.property_address} onChange={e => setEditData({ ...editData, property_address: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Agent Name</label>
            <div className="relative agent-selector">
              <input type="text" value={agentSearch || editData.agent_name} onChange={e => { setAgentSearch(e.target.value); setEditData({ ...editData, agent_name: e.target.value }); setAgentDropdownOpen(true) }} onFocus={() => setAgentDropdownOpen(true)} className="input-luxury" placeholder="Search agents..." />
              {agentDropdownOpen && filteredAgents().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filteredAgents().map(agent => (
                    <div key={agent.id} onClick={() => selectAgent(agent.name, agent.id)} className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm">{agent.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Transaction Type</label>
            <select value={editData.transaction_type} onChange={e => setEditData({ ...editData, transaction_type: e.target.value as 'sale' | 'lease' })} className="select-luxury">
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Name or LLC</label>
            <input type="text" value={editData.client_names} onChange={e => setEditData({ ...editData, client_names: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Phone</label>
            <input type="tel" value={editData.client_phone || ''} onChange={e => setEditData({ ...editData, client_phone: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Email</label>
            <input type="email" value={editData.client_email || ''} onChange={e => setEditData({ ...editData, client_email: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">MLS Link</label>
            <input type="url" value={editData.mls_link || ''} onChange={e => setEditData({ ...editData, mls_link: e.target.value })} className="input-luxury" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Estimated Launch Date</label>
            <input type="date" value={editData.estimated_launch_date || ''} onChange={e => setEditData({ ...editData, estimated_launch_date: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Actual Launch Date</label>
            <input type="date" value={editData.actual_launch_date || ''} onChange={e => setEditData({ ...editData, actual_launch_date: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Lead Source</label>
            <input type="text" value={editData.lead_source || ''} onChange={e => setEditData({ ...editData, lead_source: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Status</label>
            <select value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value as Listing['status'] })} className="select-luxury">
              <option value="pre-listing">Pre-Listing</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="sold">Sold</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-6 pt-6 border-t border-luxury-gray-5">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>

      <div className="container-card mb-6">
        <h2 className="text-lg font-medium mb-4">Coordination Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Seller Name</label>
            <input type="text" value={editData.seller_name} onChange={e => setEditData({ ...editData, seller_name: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Seller Email</label>
            <input type="email" value={editData.seller_email} onChange={e => setEditData({ ...editData, seller_email: e.target.value })} className="input-luxury" />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Listing Website URL</label>
            <input type="url" value={editData.listing_website_url} onChange={e => setEditData({ ...editData, listing_website_url: e.target.value })} className="input-luxury" placeholder="https://..." />
            <p className="text-xs text-luxury-gray-2 mt-1">This will be shown in the seller's dashboard</p>
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">OneDrive Folder URL (Sharing Link)</label>
            <div className="flex gap-2">
              <input type="url" value={editData.onedrive_folder_url} onChange={e => setEditData({ ...editData, onedrive_folder_url: e.target.value })} className="input-luxury flex-1" placeholder="https://..." />
              <button type="button" onClick={handleRegenerateFolderLink} disabled={saving} className="px-4 py-2 text-sm rounded transition-colors btn-primary disabled:opacity-50 whitespace-nowrap">{saving ? 'Regenerating...' : 'Regenerate Link'}</button>
            </div>
            <p className="text-xs text-luxury-gray-2 mt-1">VA updates reports in this OneDrive folder. Click "Regenerate Link" to create an anonymous link that doesn't require Microsoft login.</p>
          </div>
          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" checked={editData.service_paid} onChange={e => setEditData({ ...editData, service_paid: e.target.checked })} className="w-4 h-4" />
              <span className="text-sm">Service fee has been paid</span>
            </label>
            {coordination.payment_date && <p className="text-xs text-luxury-gray-2 mt-1">Paid on: {formatDate(coordination.payment_date)}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-luxury-gray-5">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>

      {coordination.seller_magic_link && (
        <div className="container-card mb-6">
          <h2 className="text-lg font-medium mb-4">Seller Dashboard Access</h2>
          <div className="bg-luxury-light p-4 rounded">
            <p className="text-sm mb-2">Magic Link (copy to share with seller):</p>
            <div className="flex items-center space-x-2">
              <input type="text" value={`${process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'}/seller/${coordination.seller_magic_link}`} readOnly className="input-luxury flex-1" />
              <button onClick={() => { navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'}/seller/${coordination.seller_magic_link}`); alert('Link copied to clipboard!') }} className="px-4 py-2 text-sm rounded transition-colors btn-primary">Copy</button>
            </div>
          </div>
        </div>
      )}

      <div className="container-card mb-6">
        <h2 className="text-lg font-medium mb-4">Email Actions</h2>
        <div className="flex flex-col space-y-3 mb-6">
          <button onClick={handleSendWelcomeEmail} disabled={sendingEmail !== null} className={`px-6 py-2.5 text-sm rounded transition-colors ${coordination.welcome_email_sent || hasWelcomeEmailInHistory ? 'bg-green-600 text-white hover:bg-green-700' : 'btn-primary'} disabled:opacity-50 disabled:cursor-not-allowed`}>
            {sendingEmail === 'welcome' ? 'Sending...' : coordination.welcome_email_sent || hasWelcomeEmailInHistory ? '✓ Resend Welcome Email' : 'Send Welcome Email'}
          </button>
          <button onClick={handleSendWeeklyEmail} disabled={sendingEmail !== null} className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {sendingEmail === 'weekly' ? 'Sending...' : 'Send Weekly Report Email'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-luxury-gray-5">
          <h3 className="text-base font-medium mb-4">Email History</h3>
          {loadingHistory ? <p className="text-sm text-luxury-gray-2">Loading...</p> : emailHistory.length === 0 ? <p className="text-sm text-luxury-gray-2">No emails sent yet</p> : (
            <div className="space-y-3">
              {emailHistory.map(email => (
                <div key={email.id} className="bg-luxury-light p-4 rounded">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium capitalize">{email.email_type === 'welcome' ? 'Welcome Email' : 'Weekly Report Email'}</p>
                      <p className="text-xs text-luxury-gray-2 mt-1">To: {email.recipient_email}</p>
                      <p className="text-xs text-luxury-gray-2">Subject: {email.subject}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${email.status === 'sent' ? 'bg-green-100 text-green-800' : email.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{email.status}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-luxury-gray-5">
                    <p className="text-xs text-luxury-gray-2">Sent: {formatDate(email.sent_at)}</p>
                    {email.resend_email_id && <p className="text-xs text-luxury-gray-2 mt-1">Resend ID: <span className="font-mono text-xs">{email.resend_email_id}</span></p>}
                    {email.error_message && <p className="text-xs text-red-600 mt-1">Error: {email.error_message}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container-card mb-6">
        <h2 className="text-lg font-medium mb-4">Weekly Reports</h2>
        {loadingReports ? <div className="text-center py-8"><p className="text-luxury-gray-2">Loading reports...</p></div> : weeklyReports.length === 0 ? <div className="text-center py-8"><p className="text-luxury-gray-2">No weekly reports uploaded yet.</p></div> : (
          <div className="space-y-3">
            {weeklyReports.map(report => (
              <div key={report.id} className="bg-luxury-light p-4 rounded border border-luxury-gray-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Week of {new Date(report.week_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(report.week_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    <div className="flex flex-wrap gap-4 mt-2">
                      {report.report_file_url && <a href={report.report_file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-gold hover:underline">Showing Report</a>}
                      {report.report_file_url_2 && <a href={report.report_file_url_2} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-gold hover:underline">Traffic Report</a>}
                    </div>
                    {report.email_sent && <p className="text-xs text-green-600 mt-2">✓ Email sent on {report.email_sent_at ? new Date(report.email_sent_at).toLocaleDateString('en-US') : 'N/A'}</p>}
                    {!report.email_sent && report.email_scheduled_for && <p className="text-xs text-blue-600 mt-2">📅 Scheduled for {new Date(report.email_scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
                    {!report.email_sent && !report.email_scheduled_for && <p className="text-xs text-luxury-gray-2 mt-2">⏳ Not scheduled</p>}
                  </div>
                  <button onClick={() => handleDeleteReport(report.id)} disabled={deletingReportId === report.id} className="ml-4 px-3 py-1.5 text-xs rounded transition-colors bg-white border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {deletingReportId === report.id ? <><Loader2 className="w-3 h-3 animate-spin" />Deleting...</> : <><Trash2 className="w-3 h-3" />Delete</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="container-card mb-6">
        <h2 className="text-lg font-medium mb-4">Other Actions</h2>
        <div className="flex flex-col space-y-3">
          <button onClick={() => router.push(`/admin/coordination/upload-report/${coordinationId}`)} className="px-6 py-2.5 text-sm rounded transition-colors btn-primary">Upload Weekly Report</button>
          {coordination.is_active ? (
            <button onClick={handleDeactivate} className="px-6 py-2.5 text-sm rounded transition-colors bg-red-600 text-white hover:bg-red-700">Deactivate Coordination</button>
          ) : (
            <button onClick={handleReactivate} className="px-6 py-2.5 text-sm rounded transition-colors bg-green-600 text-white hover:bg-green-700">Reactivate Coordination</button>
          )}
          <button onClick={handleDeleteCoordination} className="px-6 py-2.5 text-sm rounded transition-colors bg-white border border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" />Delete Coordination
          </button>
        </div>
      </div>
    </div>
  )
}