'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ListingCoordination, Listing } from '@/types/listing-coordination'
import {
  ArrowLeft,
  Mail,
  Calendar,
  Upload,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'

type EditData = {
  // listing fields
  property_address: string
  agent_name: string
  agent_id: string
  transaction_type: 'sale' | 'lease'
  client_names: string
  client_phone: string
  client_email: string
  mls_link: string
  estimated_launch_date: string
  actual_launch_date: string
  lead_source: string
  status: 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled'
  listing_website_url: string
  // coordination fields
  seller_name: string
  seller_email: string
  service_paid: boolean
  onedrive_folder_url: string
}

export default function CoordinationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const coordinationId = params.id as string

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [savingListing, setSavingListing] = useState(false)
  const [savingCoord, setSavingCoord] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sendingEmail, setSendingEmail] = useState<'welcome' | 'weekly' | null>(null)
  const [coordination, setCoordination] = useState<ListingCoordination | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [emailHistory, setEmailHistory] = useState<any[]>([])
  const [hasWelcomeEmailInHistory, setHasWelcomeEmailInHistory] = useState(false)
  const [weeklyReports, setWeeklyReports] = useState<any[]>([])
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)
  const [copiedMagic, setCopiedMagic] = useState(false)

  const [editData, setEditData] = useState<EditData>({
    property_address: '',
    agent_name: '',
    agent_id: '',
    transaction_type: 'sale',
    client_names: '',
    client_phone: '',
    client_email: '',
    mls_link: '',
    estimated_launch_date: '',
    actual_launch_date: '',
    lead_source: '',
    status: 'pre-listing',
    listing_website_url: '',
    seller_name: '',
    seller_email: '',
    service_paid: false,
    onedrive_folder_url: '',
  })

  // Auth + initial loads
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!res.ok) {
          router.push('/auth/login')
          return
        }
        const data = await res.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
        return
      }
      await Promise.all([
        loadCoordination(),
        loadAgents(),
        loadEmailHistory(),
        loadWeeklyReports(),
      ])
    }
    init()

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.agent-selector')) {
        setAgentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinationId])

  // ─────────────────────────── Loaders ───────────────────────────

  const loadCoordination = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const response = await fetch(`/api/coordination/get?id=${coordinationId}`, { cache: 'no-store' })
      const data = await response.json()
      if (data.success) {
        setCoordination(data.coordination)
        setListing(data.listing)
        setEditData({
          property_address: data.listing?.property_address || '',
          agent_name: data.listing?.agent_name || '',
          agent_id: data.listing?.agent_id || '',
          transaction_type: data.listing?.transaction_type || 'sale',
          client_names: data.listing?.client_names || '',
          client_phone: data.listing?.client_phone || '',
          client_email: data.listing?.client_email || '',
          mls_link: data.listing?.mls_link || '',
          estimated_launch_date: data.listing?.estimated_launch_date || '',
          actual_launch_date: data.listing?.actual_launch_date || '',
          lead_source: data.listing?.lead_source || '',
          status: data.listing?.status || 'pre-listing',
          listing_website_url: data.listing?.listing_website_url || '',
          seller_name: data.coordination.seller_name || '',
          seller_email: data.coordination.seller_email || '',
          service_paid: data.coordination.service_paid || false,
          onedrive_folder_url: data.coordination.onedrive_folder_url || '',
        })
        setAgentSearch('')
      }
    } catch (error) {
      console.error('Error loading coordination:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/agents/list', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        const agentsList = (data.agents || [])
          .map((agent: any) => ({ id: agent.id, name: agent.name || agent.displayName || '' }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
        setAgents(agentsList)
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    }
  }

  const loadEmailHistory = async () => {
    try {
      const response = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=email_history`, { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        if (data.emailHistory) {
          setEmailHistory(data.emailHistory)
          const welcomeEmail = data.emailHistory.find((e: any) => e.email_type === 'welcome')
          setHasWelcomeEmailInHistory(!!welcomeEmail)
        }
      }
    } catch (error) {
      console.error('Error loading email history:', error)
    }
  }

  const loadWeeklyReports = async () => {
    try {
      const response = await fetch(`/api/coordination/history?coordination_id=${coordinationId}&type=weekly_reports`, { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        if (data.weeklyReports) setWeeklyReports(data.weeklyReports)
      }
    } catch (error) {
      console.error('Error loading weekly reports:', error)
    }
  }

  // ─────────────────────────── Helpers ───────────────────────────

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  // Generic safe POST helper that handles all the silent-fail edge cases:
  // checks response.ok, handles non-JSON bodies, surfaces specific error messages.
  const safePost = async (
    url: string,
    body: any,
  ): Promise<{ success: true; data: any } | { success: false; error: string }> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      })
      let data: any = null
      try {
        data = await response.json()
      } catch {
        return { success: false, error: `Server returned non-JSON response (HTTP ${response.status})` }
      }
      if (!response.ok || !data?.success) {
        return { success: false, error: data?.error || `HTTP ${response.status}` }
      }
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  }

  const filteredAgents = () => {
    const search = agentSearch.toLowerCase()
    return agents.filter(a => a.name.toLowerCase().includes(search))
  }

  const selectAgent = (agentName: string, agentId: string) => {
    setEditData({ ...editData, agent_name: agentName, agent_id: agentId })
    setAgentSearch('')
    setAgentDropdownOpen(false)
  }

  // ─────────────────────────── Save handlers ───────────────────────────

  const handleSaveListing = async () => {
    if (!coordinationId || !listing?.id) {
      alert('Page data not fully loaded. Refresh and try again.')
      return
    }
    setSavingListing(true)
    const result = await safePost('/api/coordination/update', {
      coordination_id: coordinationId,
      listing_id: listing.id,
      listing_updates: {
        listing_website_url: editData.listing_website_url,
        agent_name: editData.agent_name,
        agent_id: editData.agent_id || null,
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
    })
    setSavingListing(false)
    if (!result.success) {
      alert(`Save failed: ${result.error}`)
      return
    }
    alert('Property & Client saved.')
    await loadCoordination(false)
  }

  const handleSaveCoord = async () => {
    if (!coordinationId || !listing?.id) {
      alert('Page data not fully loaded. Refresh and try again.')
      return
    }
    setSavingCoord(true)
    const result = await safePost('/api/coordination/update', {
      coordination_id: coordinationId,
      listing_id: listing.id,
      updates: {
        seller_name: editData.seller_name,
        seller_email: editData.seller_email,
        service_paid: editData.service_paid,
        onedrive_folder_url: editData.onedrive_folder_url,
        payment_date:
          editData.service_paid && !coordination?.service_paid
            ? new Date().toISOString()
            : coordination?.payment_date,
      },
    })
    setSavingCoord(false)
    if (!result.success) {
      alert(`Save failed: ${result.error}`)
      return
    }
    alert('Coordination details saved.')
    await loadCoordination(false)
  }

  // ─────────────────────────── Action handlers ───────────────────────────

  const handleRegenerateFolderLink = async () => {
    if (!confirm("Regenerate the OneDrive folder sharing link? This creates a new anonymous link that doesn't require Microsoft login.")) return
    setRegenerating(true)
    const result = await safePost('/api/coordination/regenerate-folder-link', { coordinationId, userId: user?.id })
    setRegenerating(false)
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Folder sharing link regenerated.')
    setEditData({ ...editData, onedrive_folder_url: result.data.sharingUrl })
    await loadCoordination(false)
  }

  const handleSendWelcomeEmail = async () => {
    if (!confirm('Send welcome email to the seller?')) return
    setSendingEmail('welcome')
    const result = await safePost('/api/coordination/send-welcome-email', { coordination_id: coordinationId })
    setSendingEmail(null)
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Welcome email sent.')
    await Promise.all([loadCoordination(false), loadEmailHistory()])
  }

  const handleSendWeeklyEmail = async () => {
    if (!confirm('Send weekly report email to the seller?')) return
    setSendingEmail('weekly')
    const result = await safePost('/api/coordination/send-weekly-email', { coordination_id: coordinationId })
    setSendingEmail(null)
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Weekly report email sent.')
    await Promise.all([loadCoordination(false), loadEmailHistory()])
  }

  const handleCopyMagicLink = async () => {
    if (!coordination?.seller_magic_link) return
    const url = `${BASE_URL}/seller/${coordination.seller_magic_link}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedMagic(true)
      setTimeout(() => setCopiedMagic(false), 2000)
    } catch {
      alert('Failed to copy. Please copy the link manually.')
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Delete this weekly report? This cannot be undone.')) return
    setDeletingReportId(reportId)
    const result = await safePost('/api/coordination/delete-report', { reportId, userId: user?.id })
    setDeletingReportId(null)
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Weekly report deleted.')
    await loadWeeklyReports()
  }

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this coordination? Weekly emails will stop. Can be reactivated later.')) return
    const result = await safePost('/api/coordination/deactivate', {
      coordination_id: coordinationId,
      listing_id: listing?.id,
    })
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Coordination deactivated.')
    await loadCoordination(false)
  }

  const handleReactivate = async () => {
    if (!confirm('Reactivate this coordination?')) return
    const result = await safePost('/api/coordination/reactivate', { coordination_id: coordinationId })
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Coordination reactivated.')
    await loadCoordination(false)
  }

  const handleDeleteCoordination = async () => {
    if (!confirm('Permanently delete this coordination? This removes the coordination record, all email history, and all weekly reports. Cannot be undone.')) return
    const result = await safePost('/api/coordination/delete', { coordinationId, userId: user?.id })
    if (!result.success) {
      alert(`Error: ${result.error}`)
      return
    }
    alert('Coordination deleted.')
    router.push('/admin/coordination')
  }

  // ─────────────────────────── Render ───────────────────────────

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
        <button onClick={() => router.push('/admin/coordination')} className="btn btn-primary">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const welcomeEmailSent = coordination.welcome_email_sent || hasWelcomeEmailInHistory
  const isAgentPays = coordination.payment_method === 'agent_pays'
  const paymentOverdue =
    isAgentPays &&
    !coordination.service_paid &&
    coordination.payment_due_date &&
    new Date(coordination.payment_due_date) < new Date()
  const closingButUnpaid =
    isAgentPays &&
    !coordination.service_paid &&
    (listing.status === 'pending' || listing.status === 'sold')

  return (
    <div>
      {/* Conditional alert banners - surface at top when relevant */}
      {closingButUnpaid && (
        <div className="alert-error mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Action Required: Listing is {listing.status} but ${coordination.service_fee} fee is unpaid</p>
            <p className="text-xs mt-1">Payment should be collected at closing or deducted from agent commission.</p>
          </div>
        </div>
      )}

      {paymentOverdue && !closingButUnpaid && (
        <div className="alert-error mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Payment Overdue</p>
            <p className="text-xs mt-1">60-day deadline has passed. Fee should be deducted from agent commission.</p>
          </div>
        </div>
      )}

      {/* ────── HEADER ────── */}
      <div className="container-card mb-4">
        <button
          onClick={() => router.push('/admin/coordination')}
          className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-3 inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back to Coordinations
        </button>
        <h1 className="page-title mb-2">{editData.property_address || listing.property_address}</h1>
        <div className="flex items-center gap-4 flex-wrap mb-4">
          <span className={`badge ${coordination.is_active ? 'badge-success' : 'badge-neutral'}`}>
            {coordination.is_active ? 'Active' : 'Inactive'}
          </span>
          <span className={`badge ${coordination.service_paid ? 'badge-success' : 'badge-error'}`}>
            {coordination.service_paid ? 'Paid' : 'Unpaid'}
          </span>
          <span className="text-xs font-mono text-luxury-gray-3">{coordination.id}</span>
        </div>

        {/* Primary action toolbar */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-luxury-gray-6">
          <button
            onClick={handleSendWelcomeEmail}
            disabled={sendingEmail !== null}
            className="btn btn-primary disabled:opacity-50"
          >
            <Mail size={14} />
            {sendingEmail === 'welcome'
              ? 'Sending...'
              : welcomeEmailSent
              ? 'Resend Welcome Email'
              : 'Send Welcome Email'}
          </button>
          <button
            onClick={handleSendWeeklyEmail}
            disabled={sendingEmail !== null}
            className="btn btn-primary disabled:opacity-50"
          >
            <Calendar size={14} />
            {sendingEmail === 'weekly' ? 'Sending...' : 'Send Weekly Report'}
          </button>
          <button
            onClick={() => router.push(`/admin/coordination/upload-report/${coordinationId}`)}
            className="btn btn-secondary"
          >
            <Upload size={14} /> Upload Weekly Report
          </button>
          {coordination.seller_magic_link && (
            <button onClick={handleCopyMagicLink} className="btn btn-secondary">
              {copiedMagic ? <Check size={14} /> : <Copy size={14} />}
              {copiedMagic ? 'Copied!' : 'Copy Magic Link'}
            </button>
          )}
        </div>
      </div>

      {/* ────── AT A GLANCE ────── */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">At a Glance</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Service Fee</p>
            <p className="hero-number">${coordination.service_fee}</p>
            {coordination.payment_date && (
              <p className="text-xs text-luxury-gray-2 mt-1">paid {formatDate(coordination.payment_date)}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Total Emails Sent</p>
            <p className="hero-number">
              {Math.max(coordination.total_emails_sent || 0, emailHistory.length)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Last Email</p>
            <p className="text-sm font-medium text-luxury-black">{formatDate(coordination.last_email_sent_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Next Scheduled</p>
            <p className="text-sm font-medium text-luxury-black">
              {coordination.next_email_scheduled_for
                ? formatDateTime(coordination.next_email_scheduled_for)
                : <span className="text-luxury-gray-3 font-normal">Not scheduled</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-luxury-gray-6 text-sm">
          {welcomeEmailSent ? (
            <>
              <span className="badge badge-success">Welcome email sent</span>
              {coordination.welcome_email_sent_at && (
                <span className="text-xs text-luxury-gray-3">on {formatDate(coordination.welcome_email_sent_at)}</span>
              )}
            </>
          ) : (
            <span className="badge badge-warning">Welcome email not sent</span>
          )}
        </div>
      </div>

      {/* ────── PAYMENT STATUS (agent_pays only) ────── */}
      {isAgentPays && (
        <div className="container-card mb-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
            <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Payment Status: Agent Pays</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Payment Due (60 days)</p>
              <p className="text-sm font-medium text-luxury-black">
                {coordination.payment_due_date ? formatDate(coordination.payment_due_date) : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-luxury-gray-3 mb-1">Listing Closing</p>
              <p className="text-sm font-medium text-luxury-black">
                {listing.status === 'sold' || listing.status === 'pending' ? 'At closing' : 'Not yet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ────── PROPERTY & CLIENT ────── */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Property &amp; Client</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm mb-2 text-luxury-gray-1">Property Address</label>
            <input
              type="text"
              value={editData.property_address}
              onChange={e => setEditData({ ...editData, property_address: e.target.value })}
              className="input-luxury"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Agent</label>
            <div className="relative agent-selector">
              <input
                type="text"
                value={agentSearch || editData.agent_name}
                onChange={e => {
                  setAgentSearch(e.target.value)
                  setEditData({ ...editData, agent_name: e.target.value })
                  setAgentDropdownOpen(true)
                }}
                onFocus={() => setAgentDropdownOpen(true)}
                className="input-luxury"
                placeholder="Search agents..."
              />
              {agentDropdownOpen && filteredAgents().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-6 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filteredAgents().map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => selectAgent(agent.name, agent.id)}
                      className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm"
                    >
                      {agent.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Transaction Type</label>
            <select
              value={editData.transaction_type}
              onChange={e => setEditData({ ...editData, transaction_type: e.target.value as 'sale' | 'lease' })}
              className="select-luxury"
            >
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Name(s) or LLC</label>
            <input
              type="text"
              value={editData.client_names}
              onChange={e => setEditData({ ...editData, client_names: e.target.value })}
              className="input-luxury"
            />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Lead Source</label>
            <input
              type="text"
              value={editData.lead_source}
              onChange={e => setEditData({ ...editData, lead_source: e.target.value })}
              className="input-luxury"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Phone</label>
            <input
              type="tel"
              value={editData.client_phone}
              onChange={e => setEditData({ ...editData, client_phone: e.target.value })}
              className="input-luxury"
            />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Client Email</label>
            <input
              type="email"
              value={editData.client_email}
              onChange={e => setEditData({ ...editData, client_email: e.target.value })}
              className="input-luxury"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm mb-2 text-luxury-gray-1">MLS Link</label>
            <input
              type="url"
              value={editData.mls_link}
              onChange={e => setEditData({ ...editData, mls_link: e.target.value })}
              className="input-luxury"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Estimated Launch Date</label>
            <input
              type="date"
              value={editData.estimated_launch_date}
              onChange={e => setEditData({ ...editData, estimated_launch_date: e.target.value })}
              className="input-luxury"
            />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Actual Launch Date</label>
            <input
              type="date"
              value={editData.actual_launch_date}
              onChange={e => setEditData({ ...editData, actual_launch_date: e.target.value })}
              className="input-luxury"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Listing Status</label>
            <select
              value={editData.status}
              onChange={e => setEditData({ ...editData, status: e.target.value as Listing['status'] })}
              className="select-luxury"
            >
              <option value="pre-listing">Pre-Listing</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="sold">Sold</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-luxury-gray-6">
          <button
            onClick={handleSaveListing}
            disabled={savingListing}
            className="btn btn-primary disabled:opacity-50"
          >
            {savingListing ? 'Saving...' : 'Save Property & Client'}
          </button>
        </div>
      </div>

      {/* ────── COORDINATION DETAILS ────── */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Coordination Details</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Seller Name</label>
            <input
              type="text"
              value={editData.seller_name}
              onChange={e => setEditData({ ...editData, seller_name: e.target.value })}
              className="input-luxury"
            />
          </div>
          <div>
            <label className="block text-sm mb-2 text-luxury-gray-1">Seller Email</label>
            <input
              type="email"
              value={editData.seller_email}
              onChange={e => setEditData({ ...editData, seller_email: e.target.value })}
              className="input-luxury"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm mb-2 text-luxury-gray-1">Listing Website URL</label>
            <input
              type="url"
              value={editData.listing_website_url}
              onChange={e => setEditData({ ...editData, listing_website_url: e.target.value })}
              className="input-luxury"
              placeholder="https://..."
            />
            <p className="text-xs text-luxury-gray-2 mt-1">Shown in seller's dashboard.</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm mb-2 text-luxury-gray-1">OneDrive Folder URL (Sharing Link)</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={editData.onedrive_folder_url}
                onChange={e => setEditData({ ...editData, onedrive_folder_url: e.target.value })}
                className="input-luxury flex-1"
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={handleRegenerateFolderLink}
                disabled={regenerating}
                className="btn btn-secondary disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
                {regenerating ? 'Regenerating...' : 'Regenerate Link'}
              </button>
            </div>
            <p className="text-xs text-luxury-gray-2 mt-1">
              VA updates weekly reports here. Regenerate to create an anonymous link that doesn't require Microsoft login.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editData.service_paid}
                onChange={e => setEditData({ ...editData, service_paid: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">Service fee has been paid</span>
            </label>
            {coordination.payment_date && (
              <p className="text-xs text-luxury-gray-2 mt-1 ml-7">Paid on {formatDate(coordination.payment_date)}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-luxury-gray-6">
          <button
            onClick={handleSaveCoord}
            disabled={savingCoord}
            className="btn btn-primary disabled:opacity-50"
          >
            {savingCoord ? 'Saving...' : 'Save Coordination'}
          </button>
        </div>
      </div>

      {/* ────── MAGIC LINK ────── */}
      {coordination.seller_magic_link && (
        <div className="container-card mb-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
            <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Seller Magic Link</span>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-2 mb-2">Share this link with the seller for dashboard access.</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${BASE_URL}/seller/${coordination.seller_magic_link}`}
                className="input-luxury flex-1"
              />
              <button onClick={handleCopyMagicLink} className="btn btn-primary">
                {copiedMagic ? <Check size={14} /> : <Copy size={14} />}
                {copiedMagic ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────── EMAIL HISTORY ────── */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Email History</span>
          <span className="text-xs text-luxury-gray-3">{emailHistory.length} {emailHistory.length === 1 ? 'email' : 'emails'}</span>
        </div>
        {emailHistory.length === 0 ? (
          <p className="text-sm text-luxury-gray-2">No emails sent yet.</p>
        ) : (
          <div>
            {emailHistory.map((email, idx) => (
              <div
                key={email.id}
                className={`py-3 ${idx !== emailHistory.length - 1 ? 'border-b border-luxury-gray-6' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {email.email_type === 'welcome' ? 'Welcome Email' : 'Weekly Report'}
                    </p>
                    <p className="text-xs text-luxury-gray-2 mt-1">to {email.recipient_email}</p>
                    <p className="text-xs text-luxury-gray-2">Subject: {email.subject}</p>
                    <p className="text-xs text-luxury-gray-3 mt-2">Sent {formatDateTime(email.sent_at)}</p>
                    {email.error_message && (
                      <p className="text-xs text-red-600 mt-1">Error: {email.error_message}</p>
                    )}
                  </div>
                  <span
                    className={`badge ${
                      email.status === 'sent'
                        ? 'badge-success'
                        : email.status === 'failed'
                        ? 'badge-error'
                        : 'badge-warning'
                    }`}
                  >
                    {email.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ────── WEEKLY REPORTS ────── */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-luxury-gray-2">Weekly Reports Uploaded</span>
          <span className="text-xs text-luxury-gray-3">{weeklyReports.length} {weeklyReports.length === 1 ? 'report' : 'reports'}</span>
        </div>
        {weeklyReports.length === 0 ? (
          <p className="text-sm text-luxury-gray-2">No weekly reports uploaded yet.</p>
        ) : (
          <div>
            {weeklyReports.map((report, idx) => (
              <div
                key={report.id}
                className={`py-3 flex items-center justify-between gap-3 ${idx !== weeklyReports.length - 1 ? 'border-b border-luxury-gray-6' : ''}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-luxury-gray-1 mb-1">
                    Week of {formatDate(report.week_start_date)} to {formatDate(report.week_end_date)}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {report.report_file_url && (
                      <a href={report.report_file_url} target="_blank" rel="noopener noreferrer" className="text-luxury-accent hover:underline">
                        Showing Report
                      </a>
                    )}
                    {report.report_file_url_2 && (
                      <a href={report.report_file_url_2} target="_blank" rel="noopener noreferrer" className="text-luxury-accent hover:underline">
                        Traffic Report
                      </a>
                    )}
                  </div>
                  <div className="mt-2">
                    {report.email_sent ? (
                      <span className="badge badge-success">Email sent {report.email_sent_at ? `on ${formatDate(report.email_sent_at)}` : ''}</span>
                    ) : report.email_scheduled_for ? (
                      <span className="badge badge-info">Scheduled for {formatDateTime(report.email_scheduled_for)}</span>
                    ) : (
                      <span className="badge badge-neutral">Not scheduled</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteReport(report.id)}
                  disabled={deletingReportId === report.id}
                  className="btn btn-danger-outline disabled:opacity-50 flex items-center gap-1"
                >
                  {deletingReportId === report.id ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Deleting...</>
                  ) : (
                    <><Trash2 className="w-3 h-3" /> Delete</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ────── DANGER ZONE ────── */}
      <div className="container-card danger-zone-card mb-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-6">
          <span className="text-xs font-bold uppercase tracking-wider text-red-700">Danger Zone</span>
        </div>

        <div className="py-3 flex items-center justify-between gap-4 border-b border-luxury-gray-6">
          <div className="flex-1">
            <p className="text-sm font-semibold text-luxury-gray-1">
              {coordination.is_active ? 'Deactivate Coordination' : 'Reactivate Coordination'}
            </p>
            <p className="text-xs text-luxury-gray-2 mt-1">
              {coordination.is_active
                ? 'Stops weekly emails and marks the coordination as inactive. Can be reactivated later.'
                : 'Re-enables this coordination. Weekly emails will resume.'}
            </p>
          </div>
          {coordination.is_active ? (
            <button onClick={handleDeactivate} className="btn btn-danger-outline">
              Deactivate
            </button>
          ) : (
            <button onClick={handleReactivate} className="btn btn-secondary">
              Reactivate
            </button>
          )}
        </div>

        <div className="py-3 flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-luxury-gray-1">Delete Coordination</p>
            <p className="text-xs text-luxury-gray-2 mt-1">
              Permanently removes this coordination, all email history, and all weekly reports. Cannot be undone.
            </p>
          </div>
          <button onClick={handleDeleteCoordination} className="btn btn-danger-outline flex items-center gap-1">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}