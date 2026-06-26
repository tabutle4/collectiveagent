'use client'

import { ExternalLink } from 'lucide-react'
import type { ScheduleSession } from '@/lib/schedule-utils'

interface ScheduleGridProps {
  coachingSessions: ScheduleSession[]
  divisionSessions: ScheduleSession[]
  loading?: boolean
}

function SessionGrid({
  sectionLabel,
  sessions,
}: {
  sectionLabel: string
  sessions: ScheduleSession[]
}) {
  const colCount = sessions.length
  if (colCount === 0) return null

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `68px repeat(${colCount}, minmax(90px, 1fr))`,
  }
  const minW = 68 + colCount * 100

  const LabelCell = ({ children, border = true }: { children: React.ReactNode; border?: boolean }) => (
    <div
      className={`bg-luxury-dark-3 px-2 py-2.5 flex items-start${border ? ' border-b border-luxury-dark-1' : ''}`}
    >
      <span className="text-luxury-gray-5 text-[9px] font-bold uppercase tracking-wider mt-px leading-tight">
        {children}
      </span>
    </div>
  )

  const DataCell = ({
    alt,
    border = true,
    className = '',
    children,
  }: {
    alt: boolean
    border?: boolean
    className?: string
    children: React.ReactNode
  }) => (
    <div
      className={[
        alt ? 'bg-luxury-dark-2' : 'bg-luxury-dark-1',
        border ? 'border-b' : '',
        'border-l border-luxury-dark-1',
        'px-2 py-2.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )

  return (
    <div className="rounded-xl overflow-hidden border border-luxury-dark-3">
      {/* Section header */}
      <div className="bg-luxury-dark-1 px-4 py-3">
        <p className="text-luxury-accent text-[9px] font-semibold uppercase tracking-widest mb-1">
          Collective Realty Co.
        </p>
        <h2 className="text-white text-2xl font-black uppercase tracking-tight leading-none">
          {sectionLabel}
        </h2>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ ...gridStyle, minWidth: `${minW}px` }}>

          {/* Days */}
          <LabelCell>Days</LabelCell>
          {sessions.map((s, i) => (
            <div key={i} className="bg-luxury-dark-2 px-2 py-2.5 border-b border-l border-luxury-dark-1">
              <span className="text-luxury-accent text-[10px] font-bold leading-tight block">{s.day_label}</span>
            </div>
          ))}

          {/* Times */}
          <LabelCell>Times</LabelCell>
          {sessions.map((s, i) => (
            <div key={i} className="bg-luxury-dark-1 px-2 py-2.5 border-b border-l border-luxury-dark-3">
              <span className="text-white text-[10px] font-bold leading-tight block">{s.time_display}</span>
            </div>
          ))}

          {/* Photos */}
          <div className="bg-luxury-dark-3 border-b border-luxury-dark-1" />
          {sessions.map((s, i) => (
            <div key={i} className="bg-luxury-dark-2 border-b border-l border-luxury-dark-1 overflow-hidden h-[80px]">
              {s.image_url ? (
                <img
                  src={s.image_url}
                  alt={s.display_title}
                  className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-full h-full bg-luxury-dark-1" />
              )}
            </div>
          ))}

          {/* Titles */}
          <LabelCell>Titles</LabelCell>
          {sessions.map((s, i) => (
            <DataCell key={i} alt={true}>
              <span className="text-white text-[10px] font-bold leading-snug block">{s.display_title}</span>
              {s.host && (
                <span className="text-luxury-gray-4 text-[9px] leading-tight block mt-0.5">with {s.host}</span>
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
              <span className="text-luxury-gray-4 text-[10px] leading-relaxed block">{s.description}</span>
            </DataCell>
          ))}

          {/* Audiences */}
          <LabelCell border={false}>Recommended Audiences</LabelCell>
          {sessions.map((s, i) => (
            <div
              key={i}
              className={`px-2 py-2.5 border-l border-luxury-dark-1 flex items-center ${s.highlight ? 'bg-luxury-accent/10' : 'bg-luxury-dark-1'}`}
            >
              <span className={`text-[10px] font-semibold leading-tight block ${s.highlight ? 'text-luxury-accent' : 'text-luxury-gray-5'}`}>
                {s.audience}
              </span>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}

function PlatformDisplay({ platform }: { platform: string }) {
  const urlMatch = platform.match(/https?:\/\/[^\s<>"{}|\\^`[\];,]+/i)
  if (urlMatch) {
    const url = urlMatch[0]
    const display = url.replace(/^https?:\/\//, '').slice(0, 36)
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-luxury-accent text-[10px] hover:underline inline-flex items-center gap-0.5"
      >
        {display}
        <ExternalLink size={9} />
      </a>
    )
  }
  return <span className="text-luxury-gray-4 text-[10px] leading-tight block">{platform}</span>
}

export default function ScheduleGrid({ coachingSessions, divisionSessions, loading }: ScheduleGridProps) {
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

      {/* More Information footer */}
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
            <a
              href="https://visit.collectiverealtyco.com/training"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luxury-accent hover:underline"
            >
              visit.collectiverealtyco.com/training
            </a>
          </span>
          <span className="text-luxury-gray-4 text-[10px]">
            <span className="text-luxury-gray-5 font-semibold">Teams:</span> Link on calendar
          </span>
        </div>
        <p className="text-luxury-gray-4 text-[10px] text-center mt-1">
          <span className="text-luxury-gray-5 font-semibold">Calendars:</span>{' '}
          <a
            href="https://visit.collectiverealtyco.com/calendars"
            target="_blank"
            rel="noopener noreferrer"
            className="text-luxury-accent hover:underline"
          >
            visit.collectiverealtyco.com/calendars
          </a>
        </p>
        <p className="text-luxury-gray-4 text-[10px] text-center mt-1">
          Recordings available in the{' '}
          <a
            href="https://agent.collectiverealtyco.com/training-center"
            target="_blank"
            rel="noopener noreferrer"
            className="text-luxury-accent hover:underline"
          >
            Training Center
          </a>.
        </p>
      </div>
    </div>
  )
}
