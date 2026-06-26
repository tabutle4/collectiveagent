'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import type { ScheduleSession } from '@/lib/schedule-utils'

export default function CoachingSchedulePage() {
  const [coachingSessions, setCoachingSessions] = useState<ScheduleSession[]>([])
  const [divisionSessions, setDivisionSessions] = useState<ScheduleSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/public/coaching-schedule')
      .then(r => r.json())
      .then(d => {
        const all: ScheduleSession[] = d.sessions || []
        setCoachingSessions(all.filter(s => s.section === 'coaching'))
        setDivisionSessions(all.filter(s => s.section === 'division'))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}
    >
      <CornerLines thickness="thick" />

      {/* Top accent bar */}
      <div style={{ height: '3px', backgroundColor: '#C5A278', width: '100%', position: 'relative', zIndex: 1 }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <LuxuryHeader showTrainingCenter={false} homeHref="/coaching-schedule" />
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          padding: '104px 0 48px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div className="max-w-5xl mx-auto px-4">
          <ScheduleGrid
            coachingSessions={coachingSessions}
            divisionSessions={divisionSessions}
            loading={loading}
            showMoreInfo={false}
          />
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 py-4">
            <a
              href="https://visit.collectiverealtyco.com/calendars"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luxury-accent text-xs font-semibold hover:underline"
            >
              Subscribe to Calendar
            </a>
            <a
              href="https://visit.collectiverealtyco.com/training"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luxury-accent text-xs font-semibold hover:underline"
            >
              Zoom Link
            </a>
            <a
              href="https://agent.collectiverealtyco.com/training-center"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luxury-accent text-xs font-semibold hover:underline"
            >
              Session Recordings
            </a>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <AuthFooter />
      </div>
    </div>
  )
}
