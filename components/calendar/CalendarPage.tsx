'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, X, MapPin, FileText, Clock } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type CalendarPageProps = {
  isAdmin?: boolean
}

export default function CalendarPage({ isAdmin = false }: CalendarPageProps) {
  const router = useRouter()
  const [today] = useState(new Date())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    description: '',
    location: '',
    isAllDay: false,
  })

  useEffect(() => {
    loadEvents()
  }, [currentDate])

  const loadEvents = async () => {
    setLoading(true)
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString()
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString()
    try {
      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }

  const getEventsForDay = (day: number) => {
    return events.filter(e => {
      const eventDate = new Date(e.start.dateTime || e.start.date)
      return eventDate.getDate() === day &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
    })
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
  }

  const formatEventDate = (event: any) => {
    const start = new Date(event.start.dateTime || event.start.date)
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const openNewForm = (day?: number) => {
    const date = day
      ? new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      : new Date()
    const dateStr = date.toISOString().split('T')[0]
    setForm({ title: '', date: dateStr, startTime: '09:00', endTime: '10:00', description: '', location: '', isAllDay: false })
    setEditingEvent(null)
    setSelectedEvent(null)
    setShowForm(true)
  }

  const openEditForm = (event: any) => {
    const start = new Date(event.start.dateTime || event.start.date)
    const end = new Date(event.end.dateTime || event.end.date)
    setForm({
      title: event.subject || '',
      date: start.toISOString().split('T')[0],
      startTime: start.toTimeString().slice(0, 5),
      endTime: end.toTimeString().slice(0, 5),
      description: event.body?.content || '',
      location: event.location?.displayName || '',
      isAllDay: event.isAllDay || false,
    })
    setEditingEvent(event)
    setSelectedEvent(null)
    setShowForm(true)
  }

  const saveEvent = async () => {
    if (!form.title || !form.date) return
    setSaving(true)
    try {
      const startDateTime = form.isAllDay
        ? `${form.date}T00:00:00`
        : `${form.date}T${form.startTime}:00`
      const endDateTime = form.isAllDay
        ? `${form.date}T23:59:59`
        : `${form.date}T${form.endTime}:00`

      const payload = {
        title: form.title,
        start: startDateTime,
        end: endDateTime,
        description: form.description,
        location: form.location,
        isAllDay: form.isAllDay,
        ...(editingEvent && { eventId: editingEvent.id }),
      }

      const res = await fetch('/api/calendar/events', {
        method: editingEvent ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save event')
      setShowForm(false)
      await loadEvents()
    } catch (err: any) {
      alert(err.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Delete this event?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events?eventId=${eventId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete event')
      setSelectedEvent(null)
      await loadEvents()
    } catch (err: any) {
      alert(err.message || 'Failed to delete event')
    } finally {
      setDeleting(false)
    }
  }

  const days = getDaysInMonth()
  const isToday = (day: number) =>
    day === today.getDate() &&
    currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">CALENDAR</h1>
        {isAdmin && (
          <button onClick={() => openNewForm()} className="btn btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} />
            Add Event
          </button>
        )}
      </div>

      {/* Month navigation */}
      <div className="container-card mb-4">
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-luxury-light transition-colors">
            <ChevronLeft size={18} className="text-luxury-gray-2" />
          </button>
          <h2 className="text-sm font-semibold text-luxury-gray-1">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-luxury-light transition-colors">
            <ChevronRight size={18} className="text-luxury-gray-2" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="container-card mb-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-luxury-gray-3 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="text-center py-12 text-xs text-luxury-gray-3">Loading...</div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-luxury-gray-5/30">
            {days.map((day, idx) => {
              const dayEvents = day ? getEventsForDay(day) : []
              return (
                <div
                  key={idx}
                  className={`bg-white min-h-[80px] p-1.5 ${day ? 'cursor-pointer hover:bg-luxury-light transition-colors' : ''}`}
                  onClick={() => isAdmin && day ? openNewForm(day) : undefined}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full mb-1 ${
                        isToday(day)
                          ? 'bg-luxury-accent text-white'
                          : 'text-luxury-gray-2'
                      }`}>
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((event, i) => (
                          <div
                            key={i}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(event); setShowForm(false) }}
                            className="text-xs bg-luxury-accent/10 text-luxury-accent rounded px-1 py-0.5 truncate cursor-pointer hover:bg-luxury-accent/20 transition-colors"
                          >
                            {!event.isAllDay && event.start.dateTime && (
                              <span className="font-medium">{formatTime(event.start.dateTime)} </span>
                            )}
                            {event.subject}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="text-xs text-luxury-gray-3 pl-1">+{dayEvents.length - 3} more</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upcoming events list */}
      {!loading && events.length > 0 && (
        <div className="container-card">
          <p className="text-xs font-semibold text-luxury-gray-2 mb-3">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
          <div className="space-y-2">
            {events.map(event => (
              <div
                key={event.id}
                onClick={() => { setSelectedEvent(event); setShowForm(false) }}
                className="inner-card cursor-pointer hover:bg-luxury-light transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-luxury-gray-1 truncate">{event.subject}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-luxury-gray-3">{formatEventDate(event)}</span>
                      {!event.isAllDay && event.start.dateTime && (
                        <span className="text-xs text-luxury-gray-3">
                          {formatTime(event.start.dateTime)} — {formatTime(event.end.dateTime)}
                        </span>
                      )}
                    </div>
                    {event.location?.displayName && (
                      <p className="text-xs text-luxury-gray-3 mt-0.5 truncate">{event.location.displayName}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event detail drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-luxury-gray-1">{selectedEvent.subject}</h3>
                <p className="text-xs text-luxury-gray-3 mt-1">{formatEventDate(selectedEvent)}</p>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="ml-4 text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {!selectedEvent.isAllDay && selectedEvent.start.dateTime && (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-luxury-gray-3 flex-shrink-0" />
                  <p className="text-xs text-luxury-gray-2">
                    {formatTime(selectedEvent.start.dateTime)} — {formatTime(selectedEvent.end.dateTime)}
                  </p>
                </div>
              )}
              {selectedEvent.location?.displayName && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-luxury-gray-3 flex-shrink-0" />
                  <p className="text-xs text-luxury-gray-2">{selectedEvent.location.displayName}</p>
                </div>
              )}
              {selectedEvent.body?.content && selectedEvent.body.content.replace(/<[^>]*>/g, '').trim() && (
                <div className="flex items-start gap-2">
                  <FileText size={14} className="text-luxury-gray-3 flex-shrink-0 mt-0.5" />
                  <div
                    className="text-xs text-luxury-gray-2 [&_a]:text-luxury-accent [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: selectedEvent.body.content }}
                  />
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => openEditForm(selectedEvent)}
                  className="btn btn-secondary text-xs flex-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteEvent(selectedEvent.id)}
                  disabled={deleting}
                  className="text-xs text-red-400 hover:text-red-600 px-4 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-luxury-gray-1">{editingEvent ? 'Edit Event' : 'New Event'}</h3>
              <button onClick={() => setShowForm(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="input-luxury"
                  placeholder="Event title"
                />
              </div>

              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="input-luxury"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allday"
                  checked={form.isAllDay}
                  onChange={e => setForm(p => ({ ...p, isAllDay: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="allday" className="text-xs text-luxury-gray-2">All day</label>
              </div>

              {!form.isAllDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1">Start time</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1">End time</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                      className="input-luxury"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  className="input-luxury"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="input-luxury resize-none"
                  rows={3}
                  placeholder="Optional"
                />
              </div>
            </div>

            <button
              onClick={saveEvent}
              disabled={!form.title || !form.date || saving}
              className="btn btn-primary w-full mt-4 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}