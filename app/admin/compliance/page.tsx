'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, Image as ImageIcon, AlertCircle, Lock, Mail, Plus, X, Check } from 'lucide-react'

interface SubmissionRow {
  id: string
  submitted_at: string
  status: string
  submission_mode: string
  agent_id: string
  agent_name: string
  transaction_id: string | null
  property_address: string | null
  client_name: string | null
  transaction_status: string | null
  compliance_status: string | null
  is_locked: boolean
  locked_transaction: boolean
  changed_fields: string[] | null
  retainer_amount: number | null
  retainer_transaction_type: string | null
  expedite_acknowledged: boolean
  notes: string | null
  flyer: { id: string; flyer_type: string; has_photo: boolean; downloaded: boolean } | null
}

const MODE_LABELS: Record<string, string> = {
  compliance: 'Compliance & CDA',
  subsequent: 'Resubmission',
  retainer: 'Retainer',
}

const MODE_BADGE: Record<string, string> = {
  compliance: 'text-blue-700 bg-blue-50',
  subsequent: 'text-amber-700 bg-amber-50',
  retainer: 'text-purple-700 bg-purple-50',
}

const RETAINER_TYPE_LABELS: Record<string, string> = {
  residential_rental: 'Residential Rental',
  residential_buyer: 'Residential Buyer',
  commercial_rental: 'Commercial Rental',
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'

const fmtMoney = (n: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) : '-'

const formatLabel = (k: string) =>
  k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

export default function AdminCompliancePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [modeFilter, setModeFilter] = useState<'all' | 'compliance' | 'subsequent' | 'retainer'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifEmails, setNotifEmails] = useState<string[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [notifError, setNotifError] = useState('')

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (modeFilter !== 'all') params.set('mode', modeFilter)
      const res = await fetch(`/api/admin/compliance?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setSubmissions(data.submissions || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [modeFilter])

  useEffect(() => { loadSubmissions() }, [loadSubmissions])

  const counts = {
    all: submissions.length,
    compliance: submissions.filter(s => s.submission_mode === 'compliance').length,
    subsequent: submissions.filter(s => s.submission_mode === 'subsequent').length,
    retainer: submissions.filter(s => s.submission_mode === 'retainer').length,
  }

  const loadNotifEmails = useCallback(async () => {
    setNotifLoading(true)
    setNotifError('')
    try {
      const res = await fetch('/api/admin/compliance/notification-emails')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setNotifEmails(data.emails || [])
    } catch (err: any) {
      setNotifError(err.message)
    } finally {
      setNotifLoading(false)
    }
  }, [])

  const openSettings = () => {
    setSettingsOpen(true)
    loadNotifEmails()
  }

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase()
    setNotifError('')
    if (!e) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(e)) { setNotifError('Please enter a valid email address.'); return }
    if (notifEmails.includes(e)) { setNotifError('That email is already on the list.'); return }
    setNotifEmails([...notifEmails, e])
    setNewEmail('')
  }

  const removeEmail = (e: string) => setNotifEmails(notifEmails.filter(x => x !== e))

  const saveNotifEmails = async () => {
    setNotifSaving(true)
    setNotifError('')
    setNotifSaved(false)
    try {
      const res = await fetch('/api/admin/compliance/notification-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: notifEmails }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setNotifEmails(data.emails || [])
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 3000)
    } catch (err: any) {
      setNotifError(err.message)
    } finally {
      setNotifSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">COMPLIANCE QUEUE</h1>
        <button
          onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())}
          className="btn btn-secondary text-xs flex items-center gap-1.5"
        >
          <Mail size={13} /> Notification Settings
        </button>
      </div>

      {settingsOpen && (
        <div className="container-card mb-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-luxury-gray-1">Compliance Notification Recipients</p>
            <p className="text-xs text-luxury-gray-3 mt-1">
              These addresses are emailed whenever an agent submits a compliance, resubmission, or retainer form. If the list is empty, no notifications are sent.
            </p>
          </div>

          {notifLoading ? (
            <div className="flex items-center gap-2 text-xs text-luxury-gray-3">
              <Loader2 size={13} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {notifEmails.length === 0 ? (
                  <span className="text-xs text-luxury-gray-3">No recipients yet.</span>
                ) : (
                  notifEmails.map(e => (
                    <span key={e} className="inline-flex items-center gap-1.5 text-xs bg-luxury-gray-5/40 text-luxury-gray-1 px-2.5 py-1 rounded">
                      {e}
                      <button onClick={() => removeEmail(e)} className="text-luxury-gray-3 hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                  placeholder="name@collectiverealtyco.com"
                  className="input-luxury text-sm flex-1 max-w-xs"
                />
                <button onClick={addEmail} className="btn btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> Add
                </button>
              </div>

              {notifError && (
                <div className="flex items-center gap-2 text-xs text-red-700">
                  <AlertCircle size={13} className="flex-shrink-0" />{notifError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-luxury-gray-5/50">
                <button
                  onClick={saveNotifEmails}
                  disabled={notifSaving}
                  className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {notifSaving ? (
                    <><Loader2 size={13} className="animate-spin" /> Saving...</>
                  ) : notifSaved ? (
                    <><Check size={13} /> Saved</>
                  ) : (
                    'Save Recipients'
                  )}
                </button>
                <button onClick={() => setSettingsOpen(false)} className="btn btn-secondary text-xs">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mode filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'compliance', 'subsequent', 'retainer'] as const).map(m => (
          <button
            key={m}
            onClick={() => setModeFilter(m)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              modeFilter === m
                ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-3'
            }`}
          >
            {m === 'all' ? 'All' : MODE_LABELS[m]}
            {modeFilter === 'all' || modeFilter === m ? ` (${counts[m]})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 rounded text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-luxury-gray-3" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="container-card text-center py-12">
          <p className="text-sm text-luxury-gray-3">No submissions yet.</p>
        </div>
      ) : (
        <div className="container-card overflow-x-auto p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-luxury-gray-5">
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Submitted</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Type</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Agent</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Property / Client</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Details</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Flyer</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <Fragment key={s.id}>
                  <tr
                    className="border-b border-luxury-gray-5/50 hover:bg-luxury-gray-5/20 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <td className="text-xs text-luxury-gray-2 px-4 py-3 whitespace-nowrap">{fmtDate(s.submitted_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${MODE_BADGE[s.submission_mode] || 'text-luxury-gray-3 bg-luxury-gray-5/50'}`}>
                        {MODE_LABELS[s.submission_mode] || s.submission_mode}
                      </span>
                      {(s.is_locked || s.locked_transaction) && (
                        <Lock size={11} className="inline-block ml-1.5 text-amber-600" />
                      )}
                    </td>
                    <td className="text-xs text-luxury-gray-1 px-4 py-3 whitespace-nowrap">{s.agent_name}</td>
                    <td className="text-xs text-luxury-gray-1 px-4 py-3">
                      {s.property_address || s.client_name || '-'}
                    </td>
                    <td className="text-xs text-luxury-gray-2 px-4 py-3">
                      {s.submission_mode === 'retainer' && (
                        <span>
                          {fmtMoney(s.retainer_amount)}
                          {s.retainer_transaction_type ? ` \u00b7 ${RETAINER_TYPE_LABELS[s.retainer_transaction_type] || s.retainer_transaction_type}` : ''}
                        </span>
                      )}
                      {s.submission_mode === 'subsequent' && s.changed_fields && (
                        <span>{s.changed_fields.length} field{s.changed_fields.length === 1 ? '' : 's'} changed</span>
                      )}
                      {s.submission_mode === 'compliance' && s.expedite_acknowledged && (
                        <span className="text-luxury-accent">Expedite requested</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.flyer && (
                        <span className="inline-flex items-center gap-1 text-xs text-luxury-gray-3">
                          <ImageIcon size={12} className={s.flyer.has_photo ? 'text-green-600' : 'text-luxury-gray-4'} />
                          {s.flyer.has_photo ? (s.flyer.downloaded ? 'Downloaded' : 'Photo added') : 'No photo'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.transaction_id && (
                        <Link
                          href={`/transactions/${s.transaction_id}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline whitespace-nowrap"
                        >
                          View Deal <ExternalLink size={11} />
                        </Link>
                      )}
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-detail`} className="border-b border-luxury-gray-5/50 bg-luxury-gray-5/10">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="space-y-2 text-xs text-luxury-gray-2">
                          {s.submission_mode === 'subsequent' && s.changed_fields && s.changed_fields.length > 0 && (
                            <div>
                              <span className="font-medium text-luxury-gray-1">Changed fields: </span>
                              {s.changed_fields.map(formatLabel).join(', ')}
                            </div>
                          )}
                          {(s.is_locked || s.locked_transaction) && (
                            <div className="text-amber-700">
                              Transaction is locked. Submission saved but transaction was not updated. Manual update required.
                            </div>
                          )}
                          {s.notes && (
                            <div>
                              <span className="font-medium text-luxury-gray-1">Agent notes: </span>{s.notes}
                            </div>
                          )}
                          {s.compliance_status && (
                            <div>
                              <span className="font-medium text-luxury-gray-1">Transaction compliance status: </span>
                              <span className="capitalize">{s.compliance_status}</span>
                            </div>
                          )}
                          {!s.notes && !s.changed_fields?.length && !s.is_locked && !s.locked_transaction && !s.compliance_status && (
                            <div className="text-luxury-gray-3">No additional details.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
