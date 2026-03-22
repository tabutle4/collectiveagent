'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { X, MessageSquare, FileText, ExternalLink, Copy, Check } from 'lucide-react'
import Link from 'next/link'

interface Form {
  id: string
  name: string
  description: string
  formType: string
  shareableLink?: string
}

interface Submission {
  id: string
  created_at: string
  agent_name: string
  property_address: string
  transaction_type: string
  client_names: string
  client_phone: string | null
  client_email: string | null
  mls_link: string | null
  estimated_launch_date: string | null
  actual_launch_date: string | null
  lead_source: string | null
  status: string
  pre_listing_form_completed: boolean
  just_listed_form_completed: boolean
  dotloop_file_created: boolean
  photography_requested: boolean
  listing_input_requested: boolean
  closed_date: string | null
  updated_at?: string | null
}

export default function AgentFormsPage() {
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
  const [forms, setForms] = useState<Form[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'forms' | 'submissions'>('forms')
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [requestingUpdate, setRequestingUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  useEffect(() => {
    try {
      setUser(user)
      loadSubmissions(user?.id)
      loadForms()
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router])

  const loadForms = async () => {
    try {
      const res = await fetch('/api/forms/list?active_only=true')
      const data = await res.json()
      if (data.success && data.forms) {
        const mapped = data.forms.map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description || '',
          formType: f.form_type,
          shareableLink: f.shareable_link_url,
        }))
        const defaults: Form[] = [
          {
            id: 'pre-listing',
            name: 'Pre-Listing Form',
            description:
              'Submit when you have a signed listing agreement but the property is not yet on the MLS.',
            formType: 'pre-listing',
          },
          {
            id: 'just-listed',
            name: 'Just Listed Form',
            description: 'Submit when your listing is already active on the MLS.',
            formType: 'just-listed',
          },
        ]
        const all = [...mapped]
        defaults.forEach(d => {
          if (!mapped.find((f: Form) => f.formType === d.formType)) all.push(d)
        })
        setForms(all)
      }
    } catch (err) {
      console.error('Error fetching forms:', err)
    }
  }

  const loadSubmissions = async (userId: string) => {
    try {
      const res = await fetch(`/api/form-responses?type=listings&agent_id=${userId}`)
      const data = await res.json()
      if (!res.ok) console.error('Error loading submissions:', data.error)
      else setSubmissions(data.listings || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = (link: string, formId: string) => {
    navigator.clipboard.writeText(link)
    setCopiedLink(formId)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  const handleRowClick = (submission: any) => {
    setSelectedSubmission(submission)
    setModalOpen(true)
    setUpdateMessage('')
  }

  const handleRequestUpdate = async () => {
    if (!updateMessage.trim() || !selectedSubmission || !user) return
    setRequestingUpdate(true)
    try {
      const response = await fetch('/api/listings/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selectedSubmission.id,
          agent_id: user?.id,
          agent_name: `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`,
          agent_email: user.email,
          message: updateMessage,
          property_address: selectedSubmission.property_address,
        }),
      })
      const data = await response.json()
      if (data.success) {
        alert('Update request sent successfully!')
        setUpdateMessage('')
        setModalOpen(false)
      } else {
        alert(`Error: ${data.error || 'Failed to send request'}`)
      }
    } catch (error) {
      console.error('Error requesting update:', error)
      alert('Failed to send request.')
    } finally {
      setRequestingUpdate(false)
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 text-green-700'
      case 'pre-listing':
        return 'bg-luxury-accent/10 text-luxury-accent'
      case 'pending':
        return 'bg-yellow-50 text-yellow-700'
      case 'sold':
        return 'bg-blue-50 text-blue-700'
      case 'cancelled':
      case 'expired':
        return 'bg-red-50 text-red-600'
      default:
        return 'bg-luxury-gray-5/40 text-luxury-gray-3'
    }
  }

  if (!user) return null

  return (
    <>
      <div>
        <h1 className="page-title mb-6">FORMS</h1>
        <p className="text-xs text-luxury-gray-3 mb-6">
          Submit forms and view your past submissions.
        </p>

        <div className="container-card">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-luxury-gray-5/50 mb-4">
            <button
              onClick={() => setActiveTab('forms')}
              className={`px-4 py-2 text-xs transition-colors ${
                activeTab === 'forms'
                  ? 'border-b-2 border-luxury-accent text-luxury-gray-1 font-semibold'
                  : 'text-luxury-gray-3 hover:text-luxury-gray-1'
              }`}
            >
              Available Forms ({forms.length})
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-2 text-xs transition-colors ${
                activeTab === 'submissions'
                  ? 'border-b-2 border-luxury-accent text-luxury-gray-1 font-semibold'
                  : 'text-luxury-gray-3 hover:text-luxury-gray-1'
              }`}
            >
              My Submissions ({submissions.length})
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-sm text-luxury-gray-3">Loading...</p>
            </div>
          ) : activeTab === 'forms' ? (
            /* Available Forms */
            <div className="space-y-3">
              {forms.map(form => (
                <div key={form.id} className="inner-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={15} className="text-luxury-gray-3 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-luxury-gray-1">{form.name}</h3>
                      </div>
                      <p className="text-xs text-luxury-gray-3 mb-2">{form.description}</p>
                      {form.shareableLink && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={form.shareableLink}
                            readOnly
                            className="input-luxury text-xs flex-1"
                            onClick={e => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => handleCopyLink(form.shareableLink!, form.id)}
                            className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors flex-shrink-0"
                          >
                            {copiedLink === form.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {form.formType === 'pre-listing' || form.formType === 'just-listed' ? (
                        <Link
                          href={
                            form.formType === 'pre-listing'
                              ? '/agent/forms/pre-listing'
                              : '/agent/forms/just-listed'
                          }
                          className="btn btn-primary flex items-center gap-1.5 text-xs"
                        >
                          Open <ExternalLink size={12} />
                        </Link>
                      ) : form.shareableLink ? (
                        <a
                          href={form.shareableLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary flex items-center gap-1.5 text-xs"
                        >
                          Open <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {forms.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-luxury-gray-3">No forms available</p>
                </div>
              )}
            </div>
          ) : (
            /* My Submissions */
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5/50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">
                        Property
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(s => (
                      <tr
                        key={s.id}
                        onClick={() => handleRowClick(s)}
                        className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 text-xs text-luxury-gray-3">
                          {formatDate(s.created_at)}
                        </td>
                        <td className="py-3 px-4 text-sm font-medium text-luxury-gray-1">
                          {s.property_address}
                        </td>
                        <td className="py-3 px-4 text-sm text-luxury-gray-2">{s.client_names}</td>
                        <td className="py-3 px-4 text-xs text-luxury-gray-2 capitalize">
                          {s.transaction_type}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs px-2.5 py-1 rounded font-medium capitalize ${getStatusStyle(s.status)}`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {submissions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleRowClick(s)}
                    className="inner-card cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-semibold text-luxury-gray-1">
                        {s.property_address}
                      </p>
                      <span
                        className={`text-xs px-2.5 py-1 rounded font-medium capitalize flex-shrink-0 ml-2 ${getStatusStyle(s.status)}`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-luxury-gray-3">
                      <p>
                        Client: <span className="text-luxury-gray-2">{s.client_names}</span>
                      </p>
                      <p>
                        Type:{' '}
                        <span className="text-luxury-gray-2 capitalize">{s.transaction_type}</span>
                      </p>
                      <p>
                        Date: <span className="text-luxury-gray-2">{formatDate(s.created_at)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {submissions.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-luxury-gray-3">No submissions yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Submission Detail Modal */}
      {modalOpen && selectedSubmission && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => {
              setModalOpen(false)
              setUpdateMessage('')
            }}
          />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto z-50">
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5/50 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Submission Details</h2>
              <button
                onClick={() => {
                  setModalOpen(false)
                  setUpdateMessage('')
                }}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs text-luxury-gray-3 mb-1">Submitted</p>
                <p className="text-sm font-medium text-luxury-gray-1">
                  {formatDate(selectedSubmission.created_at)}
                </p>
              </div>

              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Listing Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-luxury-gray-3">Agent</p>
                    <p className="text-sm text-luxury-gray-1">{selectedSubmission.agent_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Property</p>
                    <p className="text-sm text-luxury-gray-1">
                      {selectedSubmission.property_address}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Type</p>
                    <p className="text-sm text-luxury-gray-1 capitalize">
                      {selectedSubmission.transaction_type}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Status</p>
                    <p className="text-sm text-luxury-gray-1 capitalize">
                      {selectedSubmission.status}
                    </p>
                  </div>
                  {selectedSubmission.estimated_launch_date && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Est. Launch</p>
                      <p className="text-sm text-luxury-gray-1">
                        {formatDate(selectedSubmission.estimated_launch_date)}
                      </p>
                    </div>
                  )}
                  {selectedSubmission.actual_launch_date && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Launched</p>
                      <p className="text-sm text-luxury-gray-1">
                        {formatDate(selectedSubmission.actual_launch_date)}
                      </p>
                    </div>
                  )}
                  {selectedSubmission.closed_date && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Closed</p>
                      <p className="text-sm text-luxury-gray-1">
                        {formatDate(selectedSubmission.closed_date)}
                      </p>
                    </div>
                  )}
                  {selectedSubmission.lead_source && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Lead Source</p>
                      <p className="text-sm text-luxury-gray-1">{selectedSubmission.lead_source}</p>
                    </div>
                  )}
                  {selectedSubmission.mls_link && (
                    <div className="col-span-2">
                      <p className="text-xs text-luxury-gray-3">MLS Link</p>
                      <a
                        href={selectedSubmission.mls_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                      >
                        {selectedSubmission.mls_link}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Client Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-luxury-gray-3">Client</p>
                    <p className="text-sm text-luxury-gray-1">{selectedSubmission.client_names}</p>
                  </div>
                  {selectedSubmission.client_phone && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Phone</p>
                      <p className="text-sm text-luxury-gray-1">
                        {selectedSubmission.client_phone}
                      </p>
                    </div>
                  )}
                  {selectedSubmission.client_email && (
                    <div>
                      <p className="text-xs text-luxury-gray-3">Email</p>
                      <p className="text-sm text-luxury-gray-1">
                        {selectedSubmission.client_email}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Details
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSubmission.dotloop_file_created}
                      readOnly
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-luxury-gray-2">Dotloop file created</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSubmission.listing_input_requested}
                      readOnly
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-luxury-gray-2">Listing input requested</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSubmission.photography_requested || false}
                      readOnly
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-luxury-gray-2">Photography requested</span>
                  </div>
                </div>
              </div>

              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <MessageSquare size={13} /> Request Update
                </h3>
                <p className="text-xs text-luxury-gray-3 mb-3">
                  Need to update information? Send a request to admin.
                </p>
                <textarea
                  value={updateMessage}
                  onChange={e => setUpdateMessage(e.target.value)}
                  placeholder="Describe what needs to be updated..."
                  className="textarea-luxury mb-3"
                  rows={3}
                />
                <button
                  onClick={handleRequestUpdate}
                  disabled={requestingUpdate || !updateMessage.trim()}
                  className="btn btn-primary disabled:opacity-50 text-xs"
                >
                  {requestingUpdate ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}