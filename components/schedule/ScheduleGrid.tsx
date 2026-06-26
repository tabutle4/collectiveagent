'use client'

import { ExternalLink } from 'lucide-react'
import type { ScheduleSession } from '@/lib/schedule-utils'

interface ScheduleGridProps {
  coachingSessions: ScheduleSession[]
  divisionSessions: ScheduleSession[]
  loading?: boolean
  showMoreInfo?: boolean
}

// ── Cell components defined outside SessionGrid to avoid recreation on render ──

function LabelCell({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`bg-luxury-dark-3 px-2 py-2.5 flex items-start${border ? ' border-b border-luxury-dark-1' : ''}`}>
      <span className="text-luxury-gray-5 text-[9px] font-bold uppercase tracking-wider mt-px leading-tight break-words">
        {children}
      </span>
    </div>
  )
}

function DataCell({ alt, border = true, children }: {
  alt: boolean
  border?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={[
      alt ? 'bg-luxury-dark-2' : 'bg-luxury-dark-1',
      border ? 'border-b border-luxury-dark-1' : '',
      'border-l border-luxury-dark-1 px-2 py-2.5 overflow-hidden',
    ].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

function PlatformDisplay({ platform }: { platform: string }) {
  const urlMatch = platform.match(/https?:\/\/[^\s<>"{}|\\^`[\];,]+/i)
  if (urlMatch) {
    const url = urlMatch[0]
    const display = url.replace(/^https?:\/\//, '').slice(0, 30)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-luxury-accent text-[10px] hover:underline inline-flex items-center gap-0.5 break-all">
        {display}
        <ExternalLink size={9} className="shrink-0" />
      </a>
    )
  }
  return <span className="text-luxury-gray-4 text-[10px] leading-tight block break-words">{platform}</span>
}

function SessionGrid({ sectionLabel, sessions }: { sectionLabel: string; sessions: ScheduleSession[] }) {
  const colCount = sessions.length
  if (colCount === 0) return null

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `60px repeat(${colCount}, minmax(110px, 1fr))`,
  }
  const minW = 60 + colCount * 120

  return (
    <div className="rounded-xl overflow-hidden border border-luxury-dark-3">
      {/* Section header */}
      <div className="bg-luxury-dark-1 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-luxury-gray-4 text-[9px] uppercase tracking-widest">Collective Realty Co.</p>
          <p className="text-luxury-gray-4 text-[9px] uppercase tracking-widest hidden sm:block">www.coachingbrokerage.com</p>
        </div>
        <h2 className="text-white font-black uppercase leading-none"
          style={{ fontSize: 'clamp(24px, 5.5vw, 52px)', letterSpacing: '-0.02em' }}>
          {sectionLabel}
        </h2>
      </div>

      {/* Scrollable grid — smooth on iOS too */}
      <div className="relative">
        <div
          className="overflow-x-auto"
          style={{ WebkitOverflowScrolling: 'touch' as any }}
        >
          <div style={{ ...gridStyle, minWidth: `${minW}px` }}>

            {/* Days */}
            <LabelCell>Days</LabelCell>
            {sessions.map((s, i) => (
              <div key={i} className="bg-luxury-dark-2 px-2 py-2.5 border-b border-l border-luxury-dark-1 overflow-hidden">
                <span className="text-luxury-accent text-[10px] font-bold leading-tight block break-words">{s.day_label}</span>
              </div>
            ))}

            {/* Times */}
            <LabelCell>Times</LabelCell>
            {sessions.map((s, i) => (
              <div key={i} className="bg-luxury-dark-1 px-2 py-2.5 border-b border-l border-luxury-dark-3 overflow-hidden">
                <span className="text-white text-[10px] font-bold leading-tight block whitespace-nowrap">{s.time_display}</span>
              </div>
            ))}

            {/* Photos */}
            <div className="bg-luxury-dark-3 border-b border-luxury-dark-1" />
            {sessions.map((s, i) => (
              <div key={i} className="bg-luxury-dark-2 border-b border-l border-luxury-dark-1 overflow-hidden" style={{ height: '80px' }}>
                {s.image_url
                  ? <img src={s.image_url} alt={s.display_title} className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : <div className="w-full h-full bg-luxury-dark-1" />
                }
              </div>
            ))}

            {/* Titles */}
            <LabelCell>Titles</LabelCell>
            {sessions.map((s, i) => (
              <DataCell key={i} alt={true}>
                <span className="text-white text-[10px] font-bold leading-snug block break-words">{s.display_title}</span>
                {s.host && (
                  <span className="text-luxury-gray-4 text-[9px] leading-tight block mt-0.5 break-words">with {s.host}</span>
                )}
              </DataCell>
            ))}

            {/* Platforms */}
            <LabelCell>Platforms</LabelCell>
            {sessions.map((s, i) => (
              <DataCell key={i} alt={false}>
                <PlatformDisplay platform={s.platform} />
              </DataCell>
            ))}

            {/* Descriptions */}
            <LabelCell>Descriptions</LabelCell>
            {sessions.map((s, i) => (
              <DataCell key={i} alt={true}>
                <span className="text-luxury-gray-4 text-[10px] leading-relaxed block break-words line-clamp-5">
                  {s.description}
                </span>
              </DataCell>
            ))}

            {/* Audiences */}
            <LabelCell border={false}>Recommended Audiences</LabelCell>
            {sessions.map((s, i) => (
              <div key={i}
                className="bg-luxury-dark-1 px-2 py-2.5 border-l border-luxury-dark-1 flex items-center overflow-hidden">
                <span className={`text-[10px] font-bold leading-tight block break-words ${
                  s.highlight ? 'text-luxury-accent' : 'text-luxury-gray-5'
                }`}>
                  {s.audience}
                </span>
              </div>
            ))}

          </div>
        </div>
        {/* Fade gradient — hints at horizontal scroll on mobile */}
        <div className="absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-luxury-dark-1/40 to-transparent pointer-events-none sm:hidden" />
      </div>
    </div>
  )
}

export default function ScheduleGrid({
  coachingSessions, divisionSessions, loading, showMoreInfo = true
}: ScheduleGridProps) {

  if (loading) {
    return (
      <div className="space-y-5">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl border border-luxury-dark-3 overflow-hidden">
            <div className="bg-luxury-dark-1 px-4 py-3 h-16 animate-pulse" />
            <div className="bg-luxury-dark-2 h-40 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SessionGrid sectionLabel="Coaching Brokerage Calendar" sessions={coachingSessions} />
      <SessionGrid sectionLabel="Division & Training Calendar" sessions={divisionSessions} />

      {showMoreInfo && (
        <div className="bg-luxury-dark-2 rounded-xl border border-luxury-dark-3 px-4 py-4">
          <p className="text-white text-xs font-bold text-center mb-2">More Information</p>
          <p className="text-luxury-gray-4 text-[10px] text-center leading-relaxed">
            In-person attendance is strongly encouraged. You'll build deeper connections and stay engaged.
          </p>
          <p className="text-luxury-gray-4 text-[10px] text-center leading-relaxed mt-1">
            <span className="text-luxury-gray-5 font-semibold">How to Prepare:</span> Come with questions,
            laptops & phones, wins, and challenges to share. Sessions start promptly.
          </p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
            <span className="text-luxury-gray-4 text-[10px]">
              <span className="text-luxury-gray-5 font-semibold">Zoom:</span>{' '}
              <a href="https://visit.collectiverealtyco.com/training" target="_blank" rel="noopener noreferrer"
                className="text-luxury-accent hover:underline">
                visit.collectiverealtyco.com/training
              </a>
            </span>
            <span className="text-luxury-gray-4 text-[10px]">
              <span className="text-luxury-gray-5 font-semibold">Teams:</span> Link on calendar
            </span>
          </div>
          <p className="text-luxury-gray-4 text-[10px] text-center mt-1">
            <span className="text-luxury-gray-5 font-semibold">Calendars:</span>{' '}
            <a href="https://visit.collectiverealtyco.com/calendars" target="_blank" rel="noopener noreferrer"
              className="text-luxury-accent hover:underline">
              visit.collectiverealtyco.com/calendars
            </a>
          </p>
          <p className="text-luxury-gray-4 text-[10px] text-center mt-1">
            Recordings available in the{' '}
            <a href="https://agent.collectiverealtyco.com/training-center" target="_blank" rel="noopener noreferrer"
              className="text-luxury-accent hover:underline">
              Training Center
            </a>.
          </p>
        </div>
      )}
    </div>
  )
}
