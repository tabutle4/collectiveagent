'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ExternalLink, Image as ImageIcon, AlertCircle, Lock, Mail, Plus, X, Check, ChevronDown, ChevronRight } from 'lucide-react'

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
  cda_sent: boolean
  flyer_sent: boolean
  paid: boolean
  missing_items: { name: string; notes: string | null }[]
  review: { status: string; notes: string | null; completed_at: string | null } | null
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
  under_contract: 'New Contract',
}

const MODE_BADGE: Record<string, string> = {
  compliance: 'text-blue-700 bg-blue-50',
  subsequent: 'text-amber-700 bg-amber-50',
  under_contract: 'text-teal-700 bg-teal-50',
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
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [modeFilter, setModeFilter] = useState<'all' | 'compliance' | 'subsequent' | 'retainer'>('all')
  const [needsWorkOnly, setNeedsWorkOnly] = useState(false)
  const [generatingFlyer, setGeneratingFlyer] = useState<string | null>(null)
  const [sendingFlyer, setSendingFlyer] = useState<string | null>(null)

  const sendFlyerEmail = async (transactionId: string, mode: 'request_photo' | 'flyer_ready') => {
    setSendingFlyer(transactionId)
    try {
      const res = await fetch('/api/admin/compliance/send-flyer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, mode }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not send the email. Please try again.')
      }
    } catch {
      setError('Could not send the email. Please try again.')
    } finally {
      setSendingFlyer(null)
    }
  }

  const generateFlyer = async (transactionId: string) => {
    setGeneratingFlyer(transactionId)
    try {
      const res = await fetch('/api/admin/compliance/generate-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await loadSubmissions()
      } else {
        setError(data.error || 'Could not generate the flyer. Please try again.')
      }
    } catch {
      setError('Could not generate the flyer. Please try again.')
    } finally {
      setGeneratingFlyer(null)
    }
  }
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

  // A deal still needs work until its compliance review is finished. Complete
  // and approved mean Leah has signed off; anything else is still in her queue.
  const needsWork = (s: SubmissionRow) =>
    s.compliance_status !== 'complete' && s.compliance_status !== 'approved'

  const needsWorkCount = submissions.filter(needsWork).length
  const visibleSubmissions = needsWorkOnly ? submissions.filter(needsWork) : submissions

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
    setNotifError('')
    setNotifSaved(false)

    // Flush a typed-but-not-yet-added email from the input box so it is not lost on save.
    let toSave = notifEmails
    const typed = newEmail.trim().toLowerCase()
    if (typed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(typed)) { setNotifError('Please enter a valid email address, or clear the box before saving.'); return }
      if (!notifEmails.includes(typed)) {
        toSave = [...notifEmails, typed]
        setNotifEmails(toSave)
      }
      setNewEmail('')
    }

    setNotifSaving(true)
    try {
      const res = await fetch('/api/admin/compliance/notification-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: toSave }),
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
        <h1 className="page-title">COMPLIANCE REQUESTS</h1>
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
      <div className="flex gap-2 mb-6 flex-wrap items-center">
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
        <div className="w-px h-5 bg-luxury-gray-5 mx-1" />
        <button
          onClick={() => setNeedsWorkOnly(v => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            needsWorkOnly
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-red-600 border-red-200 hover:border-red-400'
          }`}
        >
          Needs work ({needsWorkCount})
        </button>
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
      ) : visibleSubmissions.length === 0 ? (
        <div className="container-card text-center py-12">
          <p className="text-sm text-luxury-gray-3">
            {needsWorkOnly ? 'Nothing needs work right now.' : 'No submissions yet.'}
          </p>
        </div>
      ) : (
        <div className="container-card overflow-x-auto p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-luxury-gray-5">
                <th className="px-2 py-3 w-6"></th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Submitted</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Type</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Agent</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Property / Client</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Details</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Status</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Flyer</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleSubmissions.map(s => (
                <Fragment key={s.id}>
                  <tr
                    className="border-b border-luxury-gray-5/50 hover:bg-luxury-gray-5/20 cursor-pointer"
                    onClick={() => {
                      if (s.transaction_id) router.push(`/admin/transactions/${s.transaction_id}`)
                    }}
                  >
                    <td className="px-2 py-3 w-6" onClick={e => e.stopPropagation()}>
                      {(s.missing_items?.length > 0 || s.notes || s.changed_fields?.length || s.review) ? (
                        <button
                          onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                          className="text-luxury-gray-4 hover:text-luxury-gray-1"
                          aria-label="Toggle details"
                        >
                          {expandedId === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : null}
                    </td>
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
                      <div className="flex flex-col gap-1 items-start">
                        {s.compliance_status && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs capitalize ${
                              s.compliance_status === 'complete' || s.compliance_status === 'approved'
                                ? 'bg-green-50 text-green-700'
                                : s.compliance_status === 'incomplete' || s.compliance_status === 'revision_requested' || s.compliance_status === 'rejected'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-luxury-gray-5/40 text-luxury-gray-2'
                            }`}
                          >
                            {s.compliance_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {s.missing_items && s.missing_items.length > 0 && (
                          <span className="text-xs text-red-600">
                            {s.missing_items.length} missing
                          </span>
                        )}
                        {s.paid && (
                          <span className="text-xs text-green-700">Paid</span>
                        )}
                        {s.cda_sent && (
                          <span className="text-xs text-luxury-gray-3">CDA sent</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.flyer ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center gap-1 text-xs text-luxury-gray-3">
                            <ImageIcon size={12} className={s.flyer.has_photo ? 'text-green-600' : 'text-luxury-gray-4'} />
                            {s.flyer.has_photo ? (s.flyer.downloaded ? 'Downloaded' : 'Photo added') : 'No photo'}
                          </span>
                          {s.transaction_id && (
                            s.flyer.has_photo ? (
                              <button
                                onClick={e => { e.stopPropagation(); sendFlyerEmail(s.transaction_id!, 'flyer_ready') }}
                                disabled={sendingFlyer === s.transaction_id}
                                className="text-xs text-luxury-accent hover:underline disabled:opacity-50 whitespace-nowrap"
                              >
                                {sendingFlyer === s.transaction_id ? 'Sending...' : 'Email agent: flyer ready'}
                              </button>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); sendFlyerEmail(s.transaction_id!, 'request_photo') }}
                                disabled={sendingFlyer === s.transaction_id}
                                className="text-xs text-luxury-accent hover:underline disabled:opacity-50 whitespace-nowrap"
                              >
                                {sendingFlyer === s.transaction_id ? 'Sending...' : 'Email agent: request photo'}
                              </button>
                            )
                          )}
                        </div>
                      ) : s.transaction_id ? (
                        <button
                          onClick={e => { e.stopPropagation(); generateFlyer(s.transaction_id!) }}
                          disabled={generatingFlyer === s.transaction_id}
                          className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline disabled:opacity-50 whitespace-nowrap"
                        >
                          {generatingFlyer === s.transaction_id ? 'Generating...' : 'Generate flyer'}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {s.transaction_id && (
                        <Link
                          href={`/admin/transactions/${s.transaction_id}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline whitespace-nowrap"
                        >
                          Work Deal <ExternalLink size={11} />
                        </Link>
                      )}
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-detail`} className="border-b border-luxury-gray-5/50 bg-luxury-gray-5/10">
                      <td colSpan={9} className="px-4 py-4">
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
                          {s.missing_items && s.missing_items.length > 0 && (
                            <div>
                              <span className="font-medium text-luxury-gray-1">Missing / needs correction: </span>
                              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                                {s.missing_items.map((m, i) => (
                                  <li key={i} className="text-luxury-gray-2">
                                    {m.name}
                                    {m.notes ? <span className="text-luxury-gray-3"> - {m.notes}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {s.review && s.review.completed_at && (
                            <div className="text-luxury-gray-3">
                              Review completed {new Date(s.review.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
