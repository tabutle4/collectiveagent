'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, Users, AlertTriangle, CheckCircle, Plus, Loader2, MapPin, Link } from 'lucide-react'

const HOUSTON = '13201 Northwest Fwy, Ste 450, Houston, TX 77040'
const DALLAS  = '2300 Valley View Ln, Ste 518, Irving, TX 75062'

type ResolveStatus = 'active' | 'canceled' | 'no_session' | 'no_outlook_link' | 'no_occurrence'

interface ResolveResult {
  status: ResolveStatus
  session: { id: string; display_title: string; start_time: string; end_time: string } | null
  occurrence_id: string | null
  message: string | null
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function addOneHour(time: string) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDateLabel(date: string) {
  if (!date) return ''
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function CoachingGuestsPage() {
  const [date,            setDate]            = useState('')
  const [time,            setTime]            = useState('')
  const [resolving,       setResolving]       = useState(false)
  const [resolved,        setResolved]        = useState<ResolveResult | null>(null)
  const [title,           setTitle]           = useState('')
  const [endTime,         setEndTime]         = useState('')
  const [locationPhysical,setLocationPhysical]= useState('')
  const [locationOnline,  setLocationOnline]  = useState('')
  const [guestName,       setGuestName]       = useState('')
  const [guestCompany,    setGuestCompany]    = useState('')
  const [guestEmail,      setGuestEmail]      = useState('')
  const [topic,           setTopic]           = useState('')
  const [food,            setFood]            = useState('')
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [toast,           setToast]           = useState('')
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Incremented on every resolve; stale responses are discarded when the
  // counter has moved on before the response arrives.
  const resolveIdRef = useRef(0)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  function clearForm() {
    setGuestName(''); setGuestCompany(''); setGuestEmail('')
    setTopic(''); setFood(''); setError('')
  }

  // Auto-resolve whenever date or time changes
  useEffect(() => {
    if (!date || !time) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      resolveIdRef.current += 1
      const thisId = resolveIdRef.current
      setResolving(true)
      setResolved(null)
      setTitle('')
      setEndTime('')
      setLocationOnline('')
      clearForm()
      try {
        const res = await fetch('/api/admin/coaching-guests/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, time }),
        })
        const d = await res.json()
        // Discard if a newer resolve has fired since this one was sent
        if (resolveIdRef.current !== thisId) return
        if (!res.ok) throw new Error(d.error || 'Failed to resolve')
        setResolved(d)
        setTitle(`Guest Presenter \u2013 ${d.session?.display_title || ''}`)
        setEndTime(d.session?.end_time?.slice(0, 5) || addOneHour(time))
        // Always set from the new session — never carry over a prior session's link
        setLocationOnline(d.session_join_link || d.zoom_link || '')
      } catch (e: any) {
        if (resolveIdRef.current !== thisId) return
        setError(e.message)
      } finally {
        if (resolveIdRef.current === thisId) setResolving(false)
      }
    }, 400)
  }, [date, time])

  async function handleSubmit() {
    if (!resolved) return
    if (!title.trim()) { setError('Event title is required.'); return }
    if (!guestName.trim()) { setError('Guest name is required.'); return }

    // Fix 4: Confirm exactly what will be sent to Outlook before anything fires
    const confirmMsg = [
      'Create Outlook event?',
      '',
      `Title:  ${title}`,
      `Date:   ${formatDateLabel(date)}`,
      `Guest:  ${guestName}`,
      guestEmail ? `Email invite to: ${guestEmail}` : 'No guest email. Group calendar only.',
    ].join('\n')
    if (!window.confirm(confirmMsg)) return

    setSaving(true)
    setError('')
    try {
      if (resolved.occurrence_id) {
        const res = await fetch(
          `/api/admin/coaching-schedule/${resolved.session!.id}/occurrences`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              occurrenceId: resolved.occurrence_id,
              isCanceled: resolved.status === 'canceled',
              date,
              endTime,
              guestName, guestCompany, guestEmail, topic, food,
              locationPhysical, locationOnline,
            }),
          }
        )
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Failed to update')
      } else {
        const res = await fetch('/api/admin/coaching-guests/create-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            startTime: time,
            endTime: endTime || addOneHour(time),
            title: title.replace(/^Guest Presenter \u2013 /, ''),
            sessionId: resolved.session?.id || null,
            guestName, guestCompany, guestEmail, topic, food,
            locationPhysical, locationOnline,
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Failed to create event')
      }
      showToast(`Outlook ${resolved.occurrence_id ? 'invite updated' : 'event created'}: ${title}`)
      // Fix 5: Clear resolved so button is disabled — prevents accidental second submit
      setResolved(null)
      clearForm()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = !!resolved && !resolving && !!title.trim()

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">

      <div>
        <h1 className="page-title mb-1">Guest Sessions</h1>
        <p className="text-luxury-gray-3 text-sm">
          Select a date and time. The app finds the matching session and prepares the Outlook invite.
        </p>
      </div>

      {toast && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
          <CheckCircle size={14} />
          {toast}
        </div>
      )}

      <div className="container-card p-5 space-y-5">

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input-luxury"
            />
          </div>
          <div>
            <label className="field-label">Start Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="input-luxury"
            />
          </div>
        </div>

        {/* Resolution status */}
        {resolving && (
          <div className="flex items-center gap-2 text-luxury-gray-3 text-xs">
            <Loader2 size={12} className="animate-spin" />
            Finding session...
          </div>
        )}

        {resolved && !resolving && (resolved.status === 'canceled' || resolved.status === 'no_session' || resolved.status === 'no_outlook_link' || resolved.status === 'no_occurrence') && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5 rounded text-xs">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{resolved.message}</span>
          </div>
        )}

        {/* Title + End Time — shown once resolved */}
        {(resolved || resolving) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Event Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`Guest Presenter \u2013 Session Name`}
                className="input-luxury"
                disabled={resolving}
              />
              <p className="text-luxury-gray-3 text-xs mt-1">{formatDateLabel(date)}</p>
            </div>
            <div>
              <label className="field-label">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="input-luxury"
                disabled={resolving}
              />
            </div>
          </div>
        )}

        {/* Guest fields — shown once resolved */}
        {resolved && !resolving && (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {/* Location */}
            <div>
              <label className="field-label flex items-center gap-1.5">
                <MapPin size={11} /> Location
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setLocationPhysical(HOUSTON)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    locationPhysical === HOUSTON
                      ? 'border-luxury-accent bg-luxury-accent/10 text-luxury-accent'
                      : 'border-luxury-gray-5 text-luxury-gray-3 hover:border-luxury-accent hover:text-luxury-accent'
                  }`}
                >
                  Houston Office
                </button>
                <button
                  type="button"
                  onClick={() => setLocationPhysical(DALLAS)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    locationPhysical === DALLAS
                      ? 'border-luxury-accent bg-luxury-accent/10 text-luxury-accent'
                      : 'border-luxury-gray-5 text-luxury-gray-3 hover:border-luxury-accent hover:text-luxury-accent'
                  }`}
                >
                  Dallas Office
                </button>
                {locationPhysical && (
                  <button
                    type="button"
                    onClick={() => setLocationPhysical('')}
                    className="text-xs px-2 py-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                value={locationPhysical}
                onChange={e => setLocationPhysical(e.target.value)}
                placeholder="Physical address (or leave blank)"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label flex items-center gap-1.5">
                <Link size={11} /> Join Link
              </label>
              <input
                type="text"
                value={locationOnline}
                onChange={e => setLocationOnline(e.target.value)}
                placeholder="https://zoom.us/j/... or Teams link"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label flex items-center gap-1.5">
                <Mic size={11} /> Guest Speaker Name <span className="text-red-400 ml-1">*</span>
              </label>
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="e.g. Waseem Bari"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label">Guest Company / Title</label>
              <input
                type="text"
                value={guestCompany}
                onChange={e => setGuestCompany(e.target.value)}
                placeholder="e.g. Jetmo"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label flex items-center gap-1.5">
                <Users size={11} /> Guest Email{' '}
                <span className="text-luxury-gray-3 font-normal normal-case">(adds to Outlook invite)</span>
              </label>
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                placeholder="guest@company.com"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. P&I loans 3.5% down, 640 score"
                className="input-luxury"
              />
            </div>

            <div>
              <label className="field-label">Food / Refreshments</label>
              <input
                type="text"
                value={food}
                onChange={e => setFood(e.target.value)}
                placeholder="e.g. Lunch is provided"
                className="input-luxury"
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-luxury-gray-5/20">
              <button
                onClick={handleSubmit}
                disabled={saving || !canSubmit}
                className="btn-primary rounded px-5 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? 'Saving...' : (
                  <>
                    <Plus size={14} />
                    {resolved.occurrence_id ? 'Update Outlook Invite' : 'Create Outlook Event'}
                  </>
                )}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
