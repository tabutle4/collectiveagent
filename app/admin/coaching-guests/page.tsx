'use client'

import { useEffect, useState } from 'react'
import { Calendar, ChevronDown, ChevronRight, Mic, Users, X } from 'lucide-react'
import type { ScheduleSession } from '@/lib/schedule-utils'

interface Occurrence {
  id: string
  subject: string
  start: string
  end: string
  location: string
  attendees: { name: string; email: string; type: string }[]
}

const BLANK_FORM = {
  guestName:    '',
  guestCompany: '',
  guestEmail:   '',
  topic:        '',
  food:         '',
}

export default function CoachingGuestsPage() {
  const [sessions, setSessions]               = useState<ScheduleSession[]>([])
  const [loading, setLoading]                 = useState(true)
  const [expanded, setExpanded]               = useState<string | null>(null)
  const [occurrences, setOccurrences]         = useState<Record<string, Occurrence[]>>({})
  const [occLoading, setOccLoading]           = useState<string | null>(null)
  const [modal, setModal]                     = useState<{ sessionId: string; occ: Occurrence } | null>(null)
  const [form, setForm]                       = useState({ ...BLANK_FORM })
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState('')
  const [toast, setToast]                     = useState('')

  useEffect(() => {
    fetch('/api/public/coaching-schedule')
      .then(r => r.json())
      .then(d => setSessions((d.sessions || []).filter((s: ScheduleSession) => s.outlook_event_id)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function toggleSession(s: ScheduleSession) {
    if (expanded === s.id) { setExpanded(null); return }
    setExpanded(s.id)
    if (occurrences[s.id]) return
    setOccLoading(s.id)
    try {
      const res = await fetch(`/api/admin/coaching-schedule/${s.id}/occurrences`)
      const d   = await res.json()
      setOccurrences(prev => ({ ...prev, [s.id]: d.occurrences || [] }))
    } catch {
      setOccurrences(prev => ({ ...prev, [s.id]: [] }))
    } finally {
      setOccLoading(null)
    }
  }

  function openModal(sessionId: string, occ: Occurrence) {
    setModal({ sessionId, occ })
    setForm({ ...BLANK_FORM })
    setError('')
  }

  async function saveGuest() {
    if (!modal) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/coaching-schedule/${modal.sessionId}/occurrences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occurrenceId: modal.occ.id, ...form }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Save failed')
      showToast('Outlook invite updated.')
      setModal(null)
      // Refresh occurrences for this session
      setOccurrences(prev => { const n = { ...prev }; delete n[modal.sessionId]; return n })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function formatDate(iso: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const coaching  = sessions.filter(s => s.section === 'coaching')
  const division  = sessions.filter(s => s.section === 'division')

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-1">Guest Sessions</h1>
        <p className="text-luxury-gray-3 text-sm">
          Add guest speakers, topics, and food info to specific session dates. Changes update the Outlook invite directly.
        </p>
      </div>

      {toast && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
          {toast}
        </div>
      )}

      {loading ? (
        <p className="text-luxury-gray-3 text-sm">Loading sessions...</p>
      ) : (
        <>
          <SessionList
            label="Coaching Sessions"
            sessions={coaching}
            expanded={expanded}
            occurrences={occurrences}
            occLoading={occLoading}
            onToggle={toggleSession}
            onSelectDate={openModal}
            formatDate={formatDate}
          />
          <SessionList
            label="Division & Training Sessions"
            sessions={division}
            expanded={expanded}
            occurrences={occurrences}
            occLoading={occLoading}
            onToggle={toggleSession}
            onSelectDate={openModal}
            formatDate={formatDate}
          />
        </>
      )}

      {/* Guest modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-luxury-gray-5/30 shadow-xl w-full max-w-md">
            <div style={{ height: '2px', backgroundColor: '#C5A278', borderRadius: '12px 12px 0 0' }} />
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-luxury-gray-1 font-semibold text-sm">Add Guest Details</p>
                  <p className="text-luxury-gray-3 text-xs mt-0.5">{formatDate(modal.occ.start)}</p>
                  <p className="text-luxury-gray-3 text-xs">{modal.occ.subject}</p>
                </div>
                <button onClick={() => setModal(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                  <X size={16} />
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{error}</div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="field-label flex items-center gap-1.5"><Mic size={11} />Guest Speaker Name</label>
                  <input
                    type="text"
                    value={form.guestName}
                    onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))}
                    placeholder="e.g. Waseem Bari"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Guest Company / Title</label>
                  <input
                    type="text"
                    value={form.guestCompany}
                    onChange={e => setForm(f => ({ ...f, guestCompany: e.target.value }))}
                    placeholder="e.g. Jetmo"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label flex items-center gap-1.5"><Users size={11} />Guest Email (adds them to the invite)</label>
                  <input
                    type="email"
                    value={form.guestEmail}
                    onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))}
                    placeholder="guest@company.com"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Topic</label>
                  <input
                    type="text"
                    value={form.topic}
                    onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                    placeholder='e.g. P&I loans 3.5% down, 640 score'
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Food / Refreshments</label>
                  <input
                    type="text"
                    value={form.food}
                    onChange={e => setForm(f => ({ ...f, food: e.target.value }))}
                    placeholder="e.g. Lunch is provided"
                    className="input-luxury"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-luxury-gray-5/20">
                <button onClick={() => setModal(null)} className="btn-secondary rounded px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={saveGuest}
                  disabled={saving}
                  className="btn-primary rounded px-5 py-2 text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Update Outlook Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionList({
  label, sessions, expanded, occurrences, occLoading, onToggle, onSelectDate, formatDate,
}: {
  label: string
  sessions: ScheduleSession[]
  expanded: string | null
  occurrences: Record<string, Occurrence[]>
  occLoading: string | null
  onToggle: (s: ScheduleSession) => void
  onSelectDate: (sessionId: string, occ: Occurrence) => void
  formatDate: (iso: string) => string
}) {
  if (sessions.length === 0) return null
  return (
    <div className="container-card p-5">
      <p className="text-luxury-gray-2 font-semibold text-sm mb-3">{label}</p>
      <div className="space-y-1">
        {sessions.map(s => (
          <div key={s.id}>
            <button
              onClick={() => onToggle(s)}
              className="w-full text-left flex items-center justify-between py-2.5 border-b border-luxury-gray-5/20 last:border-0 hover:text-luxury-accent transition-colors"
            >
              <div>
                <p className="text-luxury-gray-1 text-sm font-medium">{s.display_title}</p>
                <p className="text-luxury-gray-3 text-xs mt-0.5">{s.day_label} · {s.time_display}</p>
              </div>
              {expanded === s.id
                ? <ChevronDown size={15} className="text-luxury-gray-3 shrink-0" />
                : <ChevronRight size={15} className="text-luxury-gray-3 shrink-0" />
              }
            </button>

            {expanded === s.id && (
              <div className="py-2 pl-2 space-y-1">
                {occLoading === s.id ? (
                  <p className="text-luxury-gray-3 text-xs py-2">Loading dates...</p>
                ) : (occurrences[s.id] || []).length === 0 ? (
                  <p className="text-luxury-gray-3 text-xs py-2">No upcoming dates found.</p>
                ) : (
                  (occurrences[s.id] || []).map(o => (
                    <button
                      key={o.id}
                      onClick={() => onSelectDate(s.id, o)}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded hover:bg-luxury-light transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-luxury-gray-3 shrink-0" />
                        <span className="text-luxury-gray-2 text-xs group-hover:text-luxury-accent transition-colors">
                          {formatDate(o.start)}
                        </span>
                      </div>
                      {o.attendees.filter(a => a.type === 'required').length > 0 && (
                        <span className="text-[10px] text-luxury-accent flex items-center gap-0.5">
                          <Users size={9} />Guest added
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
