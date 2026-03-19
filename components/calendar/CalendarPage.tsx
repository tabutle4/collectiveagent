'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, MapPin, FileText, Clock, Video } from 'lucide-react'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type CalendarPageProps = {
  isAdmin?: boolean
}

const COACHING_SESSIONS = [
  {
    day: 'Tuesdays',
    time: '12 – 1 PM',
    title: 'Industry Intelligence & Market Mastery Meeting',
    description: 'Stay ahead with market data, industry news, and trends to position yourself as a market expert.',
    platform: 'In Person & Zoom',
    audience: 'All Agents',
    highlight: false,
  },
  {
    day: 'Tuesdays',
    time: '1 – 2 PM',
    title: 'Next Level Lead Gen & Marketing Coaching',
    description: 'Build a consistent pipeline with lead generation strategies, marketing tactics, and accountability.',
    platform: 'In Person & Zoom',
    audience: 'All Agents',
    highlight: false,
  },
  {
    day: 'Wednesdays',
    time: '10 – 11 AM',
    title: 'New Agent Coaching Circle',
    description: 'For agents in onboarding or working toward their first 5 deals. Tackle your checklist, answer questions, and troubleshoot roadblocks together.',
    platform: 'In Person & Zoom',
    audience: 'New Agents',
    highlight: true,
  },
  {
    day: 'Thursdays',
    time: '10 – 11 AM',
    title: 'Convert & Close Coaching',
    description: 'Turn leads into clients and contracts into closings. Scripts, objection handling, and real-world scenarios.',
    platform: 'In Person & Zoom',
    audience: 'All Agents',
    highlight: false,
  },
  {
    day: 'Thursdays',
    time: '11 AM – 12 PM',
    title: 'Seasoned Agent Coaching Circle',
    description: 'For producing agents focused on scaling, sustaining momentum, and growing their business.',
    platform: 'In Person & Zoom',
    audience: 'Experienced Agents',
    highlight: true,
  },
]

const DIVISION_SESSIONS = [
  {
    day: 'Last Wednesdays',
    time: '12 – 1 PM',
    title: 'Monthly Apartment Locator Q&A',
    host: 'Maureen Eno',
    description: 'Live Q&A on lease transactions and apartment locator best practices.',
    platform: 'Zoom',
    audience: 'All Agents',
  },
  {
    day: 'Wednesdays – Weekly',
    time: '1 – 2 PM',
    title: 'Collective Access Division Coaching – Dallas',
    host: 'Terraneka Hill',
    description: 'Sharpen buyer qualification, lending conversations, community targeting, and accountability to drive consistent closings.',
    platform: 'Zoom',
    audience: 'All Agents',
  },
  {
    day: 'Last Thursdays',
    time: '12 – 1 PM',
    title: 'Monthly Lease Training',
    host: 'Briana Thomas',
    description: 'Hands-on training to build and grow your apartment locator business.',
    platform: 'Zoom',
    audience: 'All Agents',
  },
  {
    day: 'Fridays – Weekly',
    time: '1 – 2 PM',
    title: 'Collective Access Division Coaching – Houston',
    host: 'Eric Roberts',
    description: 'Sharpen buyer qualification, lending conversations, community targeting, and accountability to drive consistent closings.',
    platform: 'Zoom',
    audience: 'All Agents',
  },
  {
    day: '2nd & 4th Fridays',
    time: '11 AM – 12 PM',
    title: 'Navigating the Training Center, Compliance & Onboarding',
    host: null,
    description: "Get your questions answered and ensure you're fully set up for success.",
    platform: 'Microsoft Teams',
    audience: 'Onboarding Agents · All Agents Welcome',
  },
]

export default function CalendarPage({ isAdmin = false }: CalendarPageProps) {
  const [today] = useState(new Date())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'calendar' | 'schedule'>('calendar')
  const [selectedDay, setSelectedDay] = useState<{ day: number; events: any[] } | null>(null)
  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    description: '',
    location: '',
    isAllDay: false,
  })

  useEffect(() => { loadEvents() }, [currentDate])

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
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }

  const getEventsForDay = (day: number) =>
    events.filter(e => {
      const d = new Date(e.start.dateTime || e.start.date)
      return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()
    })

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
  }

  const formatEventDate = (event: any) => {
    const start = new Date(event.start.dateTime || event.start.date)
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const openNewForm = (day?: number) => {
    const date = day ? new Date(currentDate.getFullYear(), currentDate.getMonth(), day) : new Date()
    setForm({ title: '', date: date.toISOString().split('T')[0], startTime: '09:00', endTime: '10:00', description: '', location: '', isAllDay: false })
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
      const startDateTime = form.isAllDay ? `${form.date}T00:00:00` : `${form.date}T${form.startTime}:00`
      const endDateTime = form.isAllDay ? `${form.date}T23:59:59` : `${form.date}T${form.endTime}:00`
      const payload = { title: form.title, start: startDateTime, end: endDateTime, description: form.description, location: form.location, isAllDay: form.isAllDay, ...(editingEvent && { eventId: editingEvent.id }) }
      const res = await fetch('/api/calendar/events', { method: editingEvent ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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
    day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title">CALENDAR</h1>
        {isAdmin && activeTab === 'calendar' && (
          <button onClick={() => openNewForm()} className="btn btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Plus size={13} />
            Add Event
          </button>
        )}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-4 bg-luxury-light rounded-lg p-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'calendar' ? 'bg-white text-luxury-gray-1 shadow-sm' : 'text-luxury-gray-3 hover:text-luxury-gray-2'}`}
        >
          Calendar
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'schedule' ? 'bg-white text-luxury-gray-1 shadow-sm' : 'text-luxury-gray-3 hover:text-luxury-gray-2'}`}
        >
          Coaching & Training Schedule
        </button>
      </div>

      {/* ─── CALENDAR TAB ─── */}
      {activeTab === 'calendar' && (
        <>
          {/* Outlook tip */}
          <div className="container-card border-l-2 border-luxury-accent mb-4">
            <p className="text-xs font-semibold text-luxury-gray-1 mb-1">See these events in Outlook?</p>
            <p className="text-xs text-luxury-gray-2 leading-relaxed">In Outlook (web or mobile), go to Calendar and look for <span className="font-semibold">Agents</span> under <span className="font-semibold">Groups</span> in the sidebar. Check the box and all events show alongside your personal calendar automatically.</p>
          </div>

          {/* Month navigation */}
          <div className="container-card mb-3">
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="p-2 rounded hover:bg-luxury-light transition-colors">
                <ChevronLeft size={18} className="text-luxury-gray-2" />
              </button>
              <h2 className="text-sm font-semibold text-luxury-gray-1">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button onClick={nextMonth} className="p-2 rounded hover:bg-luxury-light transition-colors">
                <ChevronRight size={18} className="text-luxury-gray-2" />
              </button>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="container-card mb-4 overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-luxury-gray-5/30">
              {DAYS.map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold text-luxury-gray-3 py-2">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12 text-xs text-luxury-gray-3">Loading...</div>
            ) : (
              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  const dayEvents = day ? getEventsForDay(day) : []
                  const isWeekend = idx % 7 === 0 || idx % 7 === 6
                  return (
                    <div
                      key={idx}
                      className={`min-h-[52px] sm:min-h-[72px] p-1 border-b border-r border-luxury-gray-5/20 ${day ? 'cursor-pointer active:bg-luxury-light' : ''} ${isWeekend && day ? 'bg-luxury-gray-5/10' : ''}`}
                      onClick={() => {
                        if (!day) return
                        setSelectedDay({ day, events: getEventsForDay(day) })
                      }}
                    >
                      {day && (
                        <>
                          <span className={`text-xs font-medium inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full mb-0.5 ${isToday(day) ? 'bg-luxury-accent text-white' : 'text-luxury-gray-2'}`}>
                            {day}
                          </span>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 2).map((event, i) => (
                              <div
                                key={i}
                                onClick={e => { e.stopPropagation(); setSelectedEvent(event); setShowForm(false) }}
                                className="block w-full sm:w-auto"
                              >
                                {/* Mobile: dot indicator */}
                                <div className="sm:hidden w-full h-1.5 rounded-full bg-luxury-accent/70" />
                                {/* Desktop: label */}
                                <div className="hidden sm:block text-xs bg-luxury-accent/10 text-luxury-accent rounded px-1 py-0.5 truncate cursor-pointer hover:bg-luxury-accent/20 transition-colors">
                                  {!event.isAllDay && event.start.dateTime && (
                                    <span className="font-medium">{formatTime(event.start.dateTime)} </span>
                                  )}
                                  {event.subject}
                                </div>
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <>
                                <div className="sm:hidden w-full h-1.5 rounded-full bg-luxury-gray-3/30" />
                                <p className="hidden sm:block text-xs text-luxury-gray-3 pl-1">+{dayEvents.length - 2}</p>
                              </>
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

          {/* Events list */}
          {!loading && events.length > 0 && (
            <div className="container-card">
              <p className="text-xs font-semibold text-luxury-gray-2 mb-3">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
              <div className="space-y-2">
                {events.map(event => (
                  <div
                    key={event.id}
                    onClick={() => { setSelectedEvent(event); setShowForm(false) }}
                    className="inner-card cursor-pointer active:bg-luxury-light transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 text-center">
                        <p className="text-xs text-luxury-gray-3 leading-none">{new Date(event.start.dateTime || event.start.date).toLocaleDateString('en-US', { month: 'short' })}</p>
                        <p className="text-xl font-bold text-luxury-accent leading-tight">{new Date(event.start.dateTime || event.start.date).getDate()}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-luxury-gray-1 truncate">{event.subject}</p>
                        {!event.isAllDay && event.start.dateTime && (
                          <p className="text-xs text-luxury-gray-3 mt-0.5">{formatTime(event.start.dateTime)} — {formatTime(event.end.dateTime)}</p>
                        )}
                        {event.location?.displayName && (
                          <p className="text-xs text-luxury-gray-3 truncate mt-0.5">{event.location.displayName}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-luxury-gray-4 flex-shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── COACHING & TRAINING TAB ─── */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="container-card border-l-2 border-luxury-accent">
            <p className="text-xs text-luxury-gray-2 leading-relaxed">
              In-person attendance is strongly encouraged. Come with questions, laptops, phones, wins, and challenges to share. Sessions start promptly.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <a href="https://visit.collectiverealtyco.com/training" target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent font-semibold hover:underline">
                Zoom Link
              </a>
              <a href="https://agent.collectiverealtyco.com/training-center" target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent font-semibold hover:underline">
                Session Recordings
              </a>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Coaching Sessions</p>
            <div className="space-y-2">
              {COACHING_SESSIONS.map((session, i) => (
                <div key={i} className="inner-card">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-xs font-semibold text-luxury-accent whitespace-nowrap">{session.day}</span>
                      <span className="text-xs text-luxury-gray-3 whitespace-nowrap">{session.time}</span>
                    </div>
                    {session.highlight && (
                      <span className="text-xs bg-luxury-accent/10 text-luxury-accent rounded-full px-2 py-0.5 font-medium flex-shrink-0">
                        {session.audience}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-luxury-gray-1 mb-0.5">{session.title}</p>
                  <p className="text-xs text-luxury-gray-3 leading-relaxed mb-2">{session.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-luxury-gray-3">
                      <Video size={11} />
                      <span className="text-xs">{session.platform}</span>
                    </div>
                    {!session.highlight && (
                      <span className="text-xs text-luxury-gray-3">{session.audience}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Division & Training Sessions</p>
            <div className="space-y-2">
              {DIVISION_SESSIONS.map((session, i) => (
                <div key={i} className="inner-card">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-xs font-semibold text-luxury-accent whitespace-nowrap">{session.day}</span>
                    <span className="text-xs text-luxury-gray-3 whitespace-nowrap">{session.time}</span>
                  </div>
                  <p className="text-xs font-semibold text-luxury-gray-1 mb-0.5">{session.title}</p>
                  {session.host && (
                    <p className="text-xs text-luxury-gray-3 mb-0.5">with {session.host}</p>
                  )}
                  <p className="text-xs text-luxury-gray-3 leading-relaxed mb-2">{session.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-luxury-gray-3">
                      <Video size={11} />
                      <span className="text-xs">{session.platform}</span>
                    </div>
                    <span className="text-xs text-luxury-gray-3 text-right ml-2">{session.audience}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Day events drawer ─── */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[75vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-luxury-gray-4" />
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-b border-luxury-gray-5/30 flex-shrink-0">
              <div>
                <p className="text-xs text-luxury-gray-3">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
                <h3 className="text-sm font-semibold text-luxury-gray-1">{selectedDay.day}</h3>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => { setSelectedDay(null); openNewForm(selectedDay.day) }}
                    className="btn btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                  >
                    <Plus size={12} />
                    Add Event
                  </button>
                )}
                <button onClick={() => setSelectedDay(null)} className="p-1 text-luxury-gray-3 hover:text-luxury-gray-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-3 space-y-2">
              {selectedDay.events.map(event => (
                <div
                  key={event.id}
                  onClick={() => { setSelectedDay(null); setSelectedEvent(event) }}
                  className="inner-card cursor-pointer active:bg-luxury-light transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-1 self-stretch rounded-full bg-luxury-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-luxury-gray-1">{event.subject}</p>
                      {!event.isAllDay && event.start.dateTime && (
                        <p className="text-xs text-luxury-gray-3 mt-0.5">{formatTime(event.start.dateTime)} — {formatTime(event.end.dateTime)}</p>
                      )}
                      {event.isAllDay && (
                        <p className="text-xs text-luxury-gray-3 mt-0.5">All day</p>
                      )}
                      {event.location?.displayName && (
                        <p className="text-xs text-luxury-gray-3 truncate mt-0.5">{event.location.displayName}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-luxury-gray-4 flex-shrink-0 mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Event detail drawer ─── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-luxury-gray-4" />
            </div>
            <div className="overflow-y-auto px-6 pb-8 pt-2">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-3">
                  <h3 className="text-base font-semibold text-luxury-gray-1 leading-snug">{selectedEvent.subject}</h3>
                  <p className="text-xs text-luxury-gray-3 mt-1">{formatEventDate(selectedEvent)}</p>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="flex-shrink-0 p-1 text-luxury-gray-3 hover:text-luxury-gray-1">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                {!selectedEvent.isAllDay && selectedEvent.start.dateTime && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-luxury-gray-3 flex-shrink-0" />
                    <p className="text-xs text-luxury-gray-2">{formatTime(selectedEvent.start.dateTime)} — {formatTime(selectedEvent.end.dateTime)}</p>
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
                    <div className="text-xs text-luxury-gray-2 [&_a]:text-luxury-accent [&_a]:underline" dangerouslySetInnerHTML={{ __html: selectedEvent.body.content }} />
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2 mt-5">
                  <button onClick={() => openEditForm(selectedEvent)} className="btn btn-secondary text-xs flex-1">Edit</button>
                  <button onClick={() => deleteEvent(selectedEvent.id)} disabled={deleting} className="text-xs text-red-400 hover:text-red-600 px-4 disabled:opacity-50">
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add/Edit form ─── */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-luxury-gray-4" />
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-b border-luxury-gray-5/30 flex-shrink-0">
              <h3 className="text-sm font-semibold text-luxury-gray-1">{editingEvent ? 'Edit Event' : 'New Event'}</h3>
              <button onClick={() => setShowForm(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1 p-1"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="input-luxury" placeholder="Event title" />
              </div>
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="input-luxury" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allday" checked={form.isAllDay} onChange={e => setForm(p => ({ ...p, isAllDay: e.target.checked }))} className="rounded" />
                <label htmlFor="allday" className="text-xs text-luxury-gray-2">All day</label>
              </div>
              {!form.isAllDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1">Start time</label>
                    <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} className="input-luxury" />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1">End time</label>
                    <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} className="input-luxury" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Location</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="input-luxury" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-luxury resize-none" rows={3} placeholder="Optional" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-luxury-gray-5/30 flex-shrink-0">
              <button onClick={saveEvent} disabled={!form.title || !form.date || saving} className="btn btn-primary w-full disabled:opacity-50">
                {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}