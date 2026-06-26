'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Link2, AlertTriangle,
  ChevronDown, ChevronUp, Upload, X, Calendar, Users, Mic, Clock,
  RefreshCw, CheckCircle,
} from 'lucide-react'
import { RECURRENCE_TYPES, RECURRENCE_DAYS, getDayLabel, formatTimeDisplay } from '@/lib/schedule-utils'

// ── Types ─────────────────────────────────────────────────────────────────

interface Session {
  id: string
  section: 'coaching' | 'division'
  display_title: string
  outlook_event_id: string | null
  recurrence_type: string
  recurrence_day: string
  start_time: string
  end_time: string
  description: string
  platform: string
  audience: string
  host: string | null
  highlight: boolean
  image_url: string | null
  active: boolean
  day_label: string
  time_display: string
  outlook_linked: boolean
  outlook_subject: string | null
}

interface SeriesOption {
  id: string
  subject: string
  start: string
  end: string
}

interface Occurrence {
  id: string
  subject: string
  start: string
  end: string
  location: string
  attendees: { name: string; email: string; type: string }[]
}

const BLANK_FORM = {
  section:         'coaching' as 'coaching' | 'division',
  display_title:   '',
  recurrence_type: 'weekly',
  recurrence_day:  'tuesday',
  start_time:      '12:00',
  end_time:        '13:00',
  description:     '',
  platform:        '',
  audience:        '',
  host:            '',
  highlight:       false,
  image_url:       '',
  outlook_event_id: '',
}

const BLANK_OCCURRENCE_FORM = {
  guestName:    '',
  guestCompany: '',
  guestEmail:   '',
  topic:        '',
  food:         '',
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CoachingSchedulePage() {
  const [sessions, setSessions]           = useState<Session[]>([])
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [toast, setToast]                 = useState('')

  // Add / Edit modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState({ ...BLANK_FORM })
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget]       = useState<Session | null>(null)
  const [cancelOutlook, setCancelOutlook]     = useState(false)
  const [deleting, setDeleting]               = useState(false)

  // Occurrence panel
  const [occurrenceSessionId, setOccurrenceSessionId]     = useState<string | null>(null)
  const [occurrences, setOccurrences]                     = useState<Occurrence[]>([])
  const [occLoading, setOccLoading]                       = useState(false)
  const [occurrenceModal, setOccurrenceModal]             = useState<Occurrence | null>(null)
  const [occForm, setOccForm]                             = useState({ ...BLANK_OCCURRENCE_FORM })
  const [occSaving, setOccSaving]                         = useState(false)
  const [occError, setOccError]                           = useState('')

  useEffect(() => { loadSessions() }, [])

  // ── Data loading ────────────────────────────────────────────────────────

  async function loadSessions() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coaching-schedule')
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error || 'Load failed')
      setSessions(d.sessions || [])
      setSeriesOptions(d.seriesOptions || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Session modal ────────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm({ ...BLANK_FORM })
    setImageFile(null)
    setImagePreview(null)
    setError('')
    setModalOpen(true)
  }

  function openEdit(s: Session) {
    setEditingId(s.id)
    setForm({
      section:          s.section,
      display_title:    s.display_title,
      recurrence_type:  s.recurrence_type,
      recurrence_day:   s.recurrence_day,
      start_time:       s.start_time,
      end_time:         s.end_time,
      description:      s.description,
      platform:         s.platform,
      audience:         s.audience,
      host:             s.host || '',
      highlight:        s.highlight,
      image_url:        s.image_url || '',
      outlook_event_id: s.outlook_event_id || '',
    })
    setImageFile(null)
    setImagePreview(s.image_url || null)
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setImageFile(null)
    setImagePreview(null)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  async function uploadImageIfNeeded(): Promise<string | null> {
    if (!imageFile) return form.image_url || null
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', imageFile)
      const res = await fetch('/api/admin/coaching-schedule/upload', { method: 'POST', body: fd })
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error || 'Upload failed')
      return d.url as string
    } finally {
      setUploadingImage(false)
    }
  }

  async function saveSession() {
    if (!form.display_title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError('')
    try {
      const imageUrl = await uploadImageIfNeeded()
      const payload  = { ...form, image_url: imageUrl, host: form.host || null }

      const url    = editingId ? `/api/admin/coaching-schedule/${editingId}` : '/api/admin/coaching-schedule'
      const method = editingId ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Save failed')

      let msg = editingId ? 'Session updated.' : 'Session created.'
      if (d.day_changed) msg += ' Day changed - remember to update the recurrence in Outlook too.'
      if (d.outlook_synced) msg += ' Outlook synced.'
      if (d.outlook_error) msg += ` Outlook sync failed: ${d.outlook_error}`

      showToast(msg)
      closeModal()
      loadSessions()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────

  async function toggleActive(s: Session) {
    try {
      const res = await fetch(`/api/admin/coaching-schedule/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Update failed')
      showToast(s.active ? 'Session hidden from schedule.' : 'Session visible on schedule.')
      loadSessions()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  // ── Delete flow ──────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const url = `/api/admin/coaching-schedule/${deleteTarget.id}${cancelOutlook ? '?cancel=true' : ''}`
      const res = await fetch(url, { method: 'DELETE' })
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error || 'Delete failed')
      showToast('Session removed.' + (d.outlook_cancelled ? ' Outlook event cancelled (no emails sent).' : ''))
      setDeleteTarget(null)
      setCancelOutlook(false)
      loadSessions()
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Occurrences ──────────────────────────────────────────────────────────

  async function openOccurrences(s: Session) {
    setOccurrenceSessionId(s.id)
    setOccurrences([])
    setOccLoading(true)
    try {
      const res = await fetch(`/api/admin/coaching-schedule/${s.id}/occurrences`)
      const d   = await res.json()
      setOccurrences(d.occurrences || [])
    } catch {
      setOccurrences([])
    } finally {
      setOccLoading(false)
    }
  }

  function openOccurrenceModal(o: Occurrence) {
    setOccurrenceModal(o)
    setOccForm({ ...BLANK_OCCURRENCE_FORM })
    setOccError('')
  }

  async function saveOccurrence() {
    if (!occurrenceModal || !occurrenceSessionId) return
    setOccSaving(true)
    setOccError('')
    try {
      const res = await fetch(`/api/admin/coaching-schedule/${occurrenceSessionId}/occurrences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occurrenceId: occurrenceModal.id, ...occForm }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Update failed')
      showToast('Session date updated in Outlook.')
      setOccurrenceModal(null)
      openOccurrences({ id: occurrenceSessionId } as Session)
    } catch (e: any) {
      setOccError(e.message)
    } finally {
      setOccSaving(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  function formatOccDate(iso: string) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const coaching  = sessions.filter(s => s.section === 'coaching')
  const division  = sessions.filter(s => s.section === 'division')
  const sessionById = sessions.find(s => s.id === occurrenceSessionId)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Coaching Schedule</h1>
          <p className="text-luxury-gray-3 text-sm">
            Manage sessions, sync with Outlook, and update guest info for specific dates.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary rounded flex items-center gap-2 px-4 py-2 text-sm shrink-0">
          <Plus size={14} />
          Add Session
        </button>
      </div>

      {toast && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
          <CheckCircle size={14} />
          {toast}
        </div>
      )}

      {loading ? (
        <p className="text-luxury-gray-3 text-sm">Loading...</p>
      ) : (
        <>
          <SessionSection
            label="Coaching Sessions"
            sessions={coaching}
            onEdit={openEdit}
            onToggle={toggleActive}
            onDelete={s => { setDeleteTarget(s); setCancelOutlook(false) }}
            onOccurrences={openOccurrences}
            activeOccurrenceId={occurrenceSessionId}
          />
          <SessionSection
            label="Division & Training Sessions"
            sessions={division}
            onEdit={openEdit}
            onToggle={toggleActive}
            onDelete={s => { setDeleteTarget(s); setCancelOutlook(false) }}
            onOccurrences={openOccurrences}
            activeOccurrenceId={occurrenceSessionId}
          />
        </>
      )}

      {/* ── Occurrences panel ─────────────────────────────────────────── */}
      {occurrenceSessionId && (
        <div className="container-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-luxury-gray-2 font-semibold text-sm">
                Upcoming Dates{sessionById ? ` - ${sessionById.display_title}` : ''}
              </p>
              <p className="text-luxury-gray-3 text-xs mt-0.5">
                Click a date to add a guest speaker, topic, or food info.
              </p>
            </div>
            <button
              onClick={() => setOccurrenceSessionId(null)}
              className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {occLoading ? (
            <p className="text-luxury-gray-3 text-xs">Loading upcoming dates...</p>
          ) : occurrences.length === 0 ? (
            <p className="text-luxury-gray-3 text-xs">No upcoming occurrences found. Make sure an Outlook event is linked.</p>
          ) : (
            <div className="space-y-2">
              {occurrences.map(o => (
                <button
                  key={o.id}
                  onClick={() => openOccurrenceModal(o)}
                  className="w-full text-left inner-card hover:bg-luxury-dark-3/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-luxury-gray-1 text-sm font-medium">{formatOccDate(o.start)}</p>
                      <p className="text-luxury-gray-3 text-xs mt-0.5">{o.location || 'No location set'}</p>
                    </div>
                    {o.attendees.filter(a => a.type === 'required').length > 0 && (
                      <div className="flex items-center gap-1 text-luxury-accent text-xs">
                        <Users size={11} />
                        <span>Guest added</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl border border-luxury-gray-5/30 shadow-xl w-full max-w-2xl">
            {/* Modal accent bar */}
            <div style={{ height: '2px', backgroundColor: '#C5A278', borderRadius: '12px 12px 0 0' }} />
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-luxury-gray-1 font-semibold text-base">
                  {editingId ? 'Edit Session' : 'New Session'}
                </h2>
                <button onClick={closeModal} className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Section */}
                <div>
                  <label className="field-label">Section</label>
                  <select
                    value={form.section}
                    onChange={e => setForm(f => ({ ...f, section: e.target.value as any }))}
                    className="input-luxury"
                  >
                    <option value="coaching">Coaching</option>
                    <option value="division">Division & Training</option>
                  </select>
                </div>

                {/* Highlight */}
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.highlight}
                      onChange={e => setForm(f => ({ ...f, highlight: e.target.checked }))}
                      className="w-4 h-4 accent-luxury-accent"
                    />
                    <span className="text-xs font-medium text-luxury-gray-2 uppercase tracking-wider">
                      Highlight audience badge
                    </span>
                  </label>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="field-label">Session Title</label>
                <input
                  type="text"
                  value={form.display_title}
                  onChange={e => setForm(f => ({ ...f, display_title: e.target.value }))}
                  placeholder="e.g. Industry Intelligence & Market Mastery Meeting"
                  className="input-luxury"
                />
              </div>

              {/* Recurrence */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Frequency</label>
                  <select
                    value={form.recurrence_type}
                    onChange={e => setForm(f => ({ ...f, recurrence_type: e.target.value }))}
                    className="input-luxury"
                  >
                    {RECURRENCE_TYPES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Day of Week</label>
                  <select
                    value={form.recurrence_day}
                    onChange={e => setForm(f => ({ ...f, recurrence_day: e.target.value }))}
                    className="input-luxury"
                  >
                    {RECURRENCE_DAYS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day label preview */}
              <p className="text-luxury-gray-3 text-xs -mt-2">
                Displays as:{' '}
                <span className="text-luxury-accent font-semibold">
                  {getDayLabel(form.recurrence_type, form.recurrence_day)}
                </span>
              </p>

              {/* Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Start Time</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">End Time</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="input-luxury"
                  />
                </div>
              </div>

              {/* Time preview */}
              <p className="text-luxury-gray-3 text-xs -mt-2">
                Displays as:{' '}
                <span className="text-luxury-accent font-semibold">
                  {formatTimeDisplay(form.start_time, form.end_time)}
                </span>
              </p>

              {/* Description */}
              <div>
                <label className="field-label">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="What agents can expect from this session..."
                  className="input-luxury resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Platform */}
                <div>
                  <label className="field-label">Platform</label>
                  <input
                    type="text"
                    value={form.platform}
                    onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    placeholder="e.g. In Person & Zoom"
                    className="input-luxury"
                  />
                </div>
                {/* Audience */}
                <div>
                  <label className="field-label">Audience</label>
                  <input
                    type="text"
                    value={form.audience}
                    onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                    placeholder="e.g. All Agents"
                    className="input-luxury"
                  />
                </div>
              </div>

              {/* Host */}
              <div>
                <label className="field-label">Host (optional)</label>
                <input
                  type="text"
                  value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder="e.g. Briana Thomas"
                  className="input-luxury"
                />
              </div>

              {/* Session photo */}
              <div>
                <label className="field-label">Session Photo</label>
                <div className="flex items-start gap-3">
                  {imagePreview && (
                    <div className="relative shrink-0">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-20 h-14 object-cover rounded border border-luxury-gray-5/30"
                      />
                      <button
                        onClick={() => { setImageFile(null); setImagePreview(null); setForm(f => ({ ...f, image_url: '' })) }}
                        className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 border border-luxury-gray-5/30 text-luxury-gray-2 hover:text-red-500"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex items-center gap-2 px-3 py-2 border border-luxury-gray-5/30 rounded text-xs text-luxury-gray-2 hover:border-luxury-accent hover:text-luxury-accent transition-colors disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {uploadingImage ? 'Uploading...' : imagePreview ? 'Replace photo' : 'Upload photo'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </div>
              </div>

              {/* Link to Outlook event */}
              <div>
                <label className="field-label flex items-center gap-1.5">
                  <Link2 size={11} />
                  Link to Outlook Event
                </label>
                <select
                  value={form.outlook_event_id}
                  onChange={e => {
                    const opt = seriesOptions.find(o => o.id === e.target.value)
                    setForm(f => ({
                      ...f,
                      outlook_event_id: e.target.value,
                      ...(opt && {
                        start_time: opt.start,
                        end_time:   opt.end,
                      }),
                    }))
                  }}
                  className="input-luxury"
                >
                  <option value="">
                    {seriesOptions.length === 0
                      ? '-- No Outlook events found (leave blank to create one) --'
                      : '-- Leave blank to create a new Outlook event --'}
                  </option>
                  {seriesOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.subject} ({formatTimeDisplay(o.start, o.end)})
                    </option>
                  ))}
                </select>
                <p className="text-luxury-gray-3 text-xs mt-1">
                  {form.outlook_event_id
                    ? 'Time and title will stay in sync with this Outlook event.'
                    : 'Leaving blank creates a new recurring Outlook event automatically when you save.'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-luxury-gray-5/20">
                <button onClick={closeModal} className="btn-secondary rounded px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={saveSession}
                  disabled={saving || uploadingImage}
                  className="btn-primary rounded px-5 py-2 text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Session'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-luxury-gray-5/30 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-luxury-gray-1 font-semibold text-sm">Remove this session?</p>
                <p className="text-luxury-gray-3 text-xs mt-1">
                  {deleteTarget.display_title} will be hidden from the schedule. You can reactivate it any time.
                </p>
              </div>
            </div>

            {deleteTarget.outlook_event_id && (
              <label className="flex items-start gap-2 cursor-pointer p-3 rounded border border-luxury-gray-5/30">
                <input
                  type="checkbox"
                  checked={cancelOutlook}
                  onChange={e => setCancelOutlook(e.target.checked)}
                  className="w-4 h-4 accent-luxury-accent mt-0.5"
                />
                <div>
                  <p className="text-xs font-medium text-luxury-gray-2">Also cancel the Outlook recurring event</p>
                  <p className="text-xs text-luxury-gray-3 mt-0.5">
                    Agents will not receive cancellation emails.
                  </p>
                </div>
              </label>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary rounded px-4 py-2 text-sm">Keep it</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Occurrence detail modal ───────────────────────────────────── */}
      {occurrenceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-luxury-gray-5/30 shadow-xl w-full max-w-md">
            <div style={{ height: '2px', backgroundColor: '#C5A278', borderRadius: '12px 12px 0 0' }} />
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-luxury-gray-1 font-semibold text-sm">Update Date Details</p>
                  <p className="text-luxury-gray-3 text-xs mt-0.5">{formatOccDate(occurrenceModal.start)}</p>
                </div>
                <button onClick={() => setOccurrenceModal(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                  <X size={16} />
                </button>
              </div>

              {occError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{occError}</div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="field-label flex items-center gap-1.5"><Mic size={11} />Guest Speaker Name</label>
                  <input
                    type="text"
                    value={occForm.guestName}
                    onChange={e => setOccForm(f => ({ ...f, guestName: e.target.value }))}
                    placeholder="e.g. Waseem Bari"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Guest Company / Title</label>
                  <input
                    type="text"
                    value={occForm.guestCompany}
                    onChange={e => setOccForm(f => ({ ...f, guestCompany: e.target.value }))}
                    placeholder="e.g. Jetmo"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label flex items-center gap-1.5">
                    <Users size={11} />Guest Email (adds them to the invite)
                  </label>
                  <input
                    type="email"
                    value={occForm.guestEmail}
                    onChange={e => setOccForm(f => ({ ...f, guestEmail: e.target.value }))}
                    placeholder="guest@company.com"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Topic</label>
                  <input
                    type="text"
                    value={occForm.topic}
                    onChange={e => setOccForm(f => ({ ...f, topic: e.target.value }))}
                    placeholder='e.g. P&I loans 3.5% down, 640 score'
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Food / Refreshments</label>
                  <input
                    type="text"
                    value={occForm.food}
                    onChange={e => setOccForm(f => ({ ...f, food: e.target.value }))}
                    placeholder="e.g. Lunch is provided"
                    className="input-luxury"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-luxury-gray-5/20">
                <button onClick={() => setOccurrenceModal(null)} className="btn-secondary rounded px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={saveOccurrence}
                  disabled={occSaving}
                  className="btn-primary rounded px-5 py-2 text-sm disabled:opacity-50"
                >
                  {occSaving ? 'Saving...' : 'Update Outlook Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Session section sub-component ─────────────────────────────────────────

function SessionSection({
  label,
  sessions,
  onEdit,
  onToggle,
  onDelete,
  onOccurrences,
  activeOccurrenceId,
}: {
  label: string
  sessions: Session[]
  onEdit: (s: Session) => void
  onToggle: (s: Session) => void
  onDelete: (s: Session) => void
  onOccurrences: (s: Session) => void
  activeOccurrenceId: string | null
}) {
  return (
    <div className="container-card p-5">
      <p className="text-luxury-gray-2 font-semibold text-sm mb-3">{label}</p>
      {sessions.length === 0 ? (
        <p className="text-luxury-gray-3 text-xs">No sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`inner-card ${!s.active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-luxury-gray-1 text-sm font-medium">{s.display_title}</p>
                    {!s.active && (
                      <span className="text-[10px] bg-luxury-gray-5/20 text-luxury-gray-3 px-1.5 py-0.5 rounded">Hidden</span>
                    )}
                    {s.outlook_linked ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                        <Link2 size={9} />Outlook linked
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        <AlertTriangle size={9} />No Outlook link
                      </span>
                    )}
                  </div>
                  <p className="text-luxury-gray-3 text-xs">
                    {s.day_label} &middot; {s.time_display} &middot; {s.platform}
                  </p>
                  {s.host && (
                    <p className="text-luxury-gray-3 text-xs mt-0.5">with {s.host}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => onToggle(s)}
                    title={s.active ? 'Hide from schedule' : 'Show on schedule'}
                    className="p-1.5 text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                  >
                    {s.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                  </button>

                  {/* Upcoming dates */}
                  <button
                    onClick={() => onOccurrences(s)}
                    title="Manage upcoming dates"
                    className={`p-1.5 transition-colors ${activeOccurrenceId === s.id ? 'text-luxury-accent' : 'text-luxury-gray-3 hover:text-luxury-accent'}`}
                  >
                    <Calendar size={15} />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => onEdit(s)}
                    title="Edit session"
                    className="p-1.5 text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                  >
                    <Edit2 size={15} />
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => onDelete(s)}
                    title="Remove session"
                    className="p-1.5 text-luxury-gray-3 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
