'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Maximize2, Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'

const GOLD = '#C5A278'
const GOLD_DARK = '#8B6D3F'

interface QuarterlyData {
  quarter: { year: number; quarter: number; startDate: string; endDate: string }
  growth: {
    newAgents: number
    newAgentsList: { name: string; initials: string; office: string }[]
    totalAgents: number
    houstonAgents: number
    dallasAgents: number
  }
  volume: { totalVolume: number; totalUnits: number; avgDealSize: number; totalAgentNet: number }
  topTeams: {
    id: string
    name: string
    leads: { name: string; initials: string }[]
    members: { initials: string }[]
    volume: number
    units: number
  }[]
  topProducers: {
    sales: {
      houston: { name: string; initials: string; volume: number; units: number }[]
      dallas: { name: string; initials: string; volume: number; units: number }[]
    }
    leases: {
      houston: { name: string; initials: string; volume: number; units: number }[]
      dallas: { name: string; initials: string; volume: number; units: number }[]
    }
  }
}

function useAnimatedNumber(target: number, duration = 1800, active = true) {
  const [value, setValue] = useState(0)
  
  useEffect(() => {
    if (!active) { setValue(0); return }
    let start: number | null = null
    let animationId: number
    
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) animationId = requestAnimationFrame(step)
    }
    animationId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animationId)
  }, [target, duration, active])
  
  return value
}

function InitialBadge({ initials, size = 48, highlight = false, className = '' }: { initials: string; size?: number; highlight?: boolean; className?: string }) {
  return (
    <div 
      className={`flex items-center justify-center font-mono font-bold shrink-0 rounded-full ${className}`}
      style={{ 
        width: size, 
        height: size, 
        border: `2px solid ${highlight ? GOLD : '#444'}`,
        background: highlight ? 'rgba(197, 162, 120, 0.15)' : '#111',
        fontSize: size * 0.35,
        color: highlight ? GOLD : '#888'
      }}
    >
      {initials}
    </div>
  )
}

function Confetti({ active }: { active: boolean }) {
  if (!active) return null
  const colors = [GOLD, '#fff', GOLD_DARK]
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 4
  }))
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            background: p.color,
            width: p.size,
            height: p.size,
            top: -20
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti {
          0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti { animation: confetti 2.5s ease-out forwards; }
      `}</style>
    </div>
  )
}

function formatVolume(n: number) {
  return n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'K'
}

export default function QuarterlyPresentationPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [data, setData] = useState<QuarterlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null)

  // ── Quarter selection ──────────────────────────────────────────────────────
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)

  // Build options: Q1–Q4 for current year and previous year
  const quarterOptions = []
  for (const yr of [currentYear, currentYear - 1]) {
    for (const q of [1, 2, 3, 4]) {
      // Don't show future quarters
      if (yr === currentYear && q > currentQuarter) continue
      quarterOptions.push({ year: yr, quarter: q, label: `Q${q} ${yr}` })
    }
  }
  // Default to most recent completed quarter (previous quarter if we're early in Q1)
  const defaultOption = quarterOptions[0]
  const [selectedYear, setSelectedYear] = useState(defaultOption.year)
  const [selectedQuarter, setSelectedQuarter] = useState(defaultOption.quarter)
  
  const slides = ['title', 'agenda', 'growth', 'volume', 'team1', 'team2', 'leases', 'sales', 'reveal', 'close']
  const totalSlides = slides.length

  const go = useCallback((delta: number) => {
    setSlide(s => {
      const next = s + delta
      if (next >= 0 && next < totalSlides) return next
      return s
    })
  }, [totalSlides])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') router.push('/admin/reports')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [go, router])

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      setSlide(0)
      try {
        const res = await fetch(`/api/reports/quarterly?year=${selectedYear}&quarter=${selectedQuarter}`)
        if (!res.ok) {
          if (res.status === 403) {
            setError('Access denied. Only operations and broker roles can view reports.')
          } else {
            const data = await res.json()
            setError(data.error || 'Failed to load data')
          }
          return
        }
        const json = await res.json()
        setData(json)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedYear, selectedQuarter])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white font-mono text-sm tracking-widest">LOADING...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="container-card max-w-md mx-auto text-center py-12">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-luxury-gray-3 mb-4">{error || 'Failed to load report data'}</p>
          <button onClick={() => router.push('/admin/reports')} className="btn btn-primary">
            Back to Reports
          </button>
        </div>
      </div>
    )
  }

  const currentSlide = slides[slide]
  const quarterLabel = `Q${data.quarter.quarter} ${data.quarter.year}`

  return (
    <div className="min-h-screen bg-black text-white p-2 sm:p-4 md:p-8">
      {/* Logo - fixed bottom left, always visible */}
      <img 
        src="/logo-white.png" 
        alt="Collective Realty Co." 
        className="fixed bottom-6 left-6 h-10 w-auto z-40 opacity-60 print:hidden"
      />
      
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-2 sm:mb-4 pb-2 sm:pb-4 border-b border-neutral-800 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            onClick={() => router.push('/admin/reports')}
            className="text-neutral-500 hover:text-white text-xs font-bold tracking-widest font-mono flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">BACK</span>
          </button>
          <select
            value={`${selectedQuarter}-${selectedYear}`}
            onChange={e => {
              const [q, y] = e.target.value.split('-').map(Number)
              setSelectedQuarter(q)
              setSelectedYear(y)
            }}
            className="bg-neutral-900 border border-neutral-700 text-white text-xs font-mono font-bold tracking-widest px-3 py-2 cursor-pointer focus:outline-none"
            style={{ color: GOLD }}
          >
            {quarterOptions.map(o => (
              <option key={`${o.quarter}-${o.year}`} value={`${o.quarter}-${o.year}`} style={{ color: '#fff', background: '#111' }}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider"
            style={{ background: GOLD, color: '#000' }}
          >
            <Maximize2 size={14} />
            TV
          </button>
          <button
            onClick={() => window.print()}
            className="hidden md:flex items-center gap-2 px-4 py-2 border border-neutral-700 text-neutral-500 text-xs font-bold tracking-wider"
          >
            <Printer size={14} />
            PRINT
          </button>
          <span className="font-mono text-xs sm:text-sm text-neutral-600 font-bold">
            {String(slide + 1).padStart(2, '0')}/{String(totalSlides).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Slide Container */}
      <div 
        className="max-w-7xl mx-auto bg-neutral-950 border border-neutral-800 relative overflow-hidden"
        style={{ minHeight: 'calc(100vh - 120px)' }}
      >
        {/* Slides */}
        {currentSlide === 'title' && <TitleSlide quarter={quarterLabel} />}
        {currentSlide === 'agenda' && <AgendaSlide />}
        {currentSlide === 'growth' && <GrowthSlide data={data} active />}
        {currentSlide === 'volume' && <VolumeSlide data={data} active />}
        {currentSlide === 'team1' && data.topTeams[0] && <TeamSlide team={data.topTeams[0]} rank={1} quarter={data.quarter.quarter} active />}
        {currentSlide === 'team2' && data.topTeams[1] && <TeamSlide team={data.topTeams[1]} rank={2} quarter={data.quarter.quarter} active />}
        {currentSlide === 'team2' && !data.topTeams[1] && <NoDataSlide message="No second team data" />}
        {currentSlide === 'leases' && <ProducersSlide type="LEASES" houston={data.topProducers.leases.houston} dallas={data.topProducers.leases.dallas} showConfetti />}
        {currentSlide === 'sales' && <ProducersSlide type="SALES" houston={data.topProducers.sales.houston} dallas={data.topProducers.sales.dallas} showConfetti />}
        {currentSlide === 'reveal' && <RevealSlide agentNet={data.volume.totalAgentNet} quarter={data.quarter.quarter} year={data.quarter.year} />}
        {currentSlide === 'close' && <CloseSlide quarter={quarterLabel} />}

        {/* Click zones - hidden on mobile, use buttons instead */}
        <div
          onClick={() => slide > 0 && go(-1)}
          onMouseEnter={() => setHoverZone('left')}
          onMouseLeave={() => setHoverZone(null)}
          className="hidden md:flex absolute top-0 left-0 w-[30%] h-[calc(100%-80px)] items-center justify-start pl-6 z-10"
          style={{ cursor: slide > 0 ? 'w-resize' : 'default' }}
        >
          {hoverZone === 'left' && slide > 0 && (
            <div className="w-12 h-12 bg-white flex items-center justify-center">
              <ChevronLeft size={24} className="text-black" />
            </div>
          )}
        </div>
        <div
          onClick={() => slide < totalSlides - 1 && go(1)}
          onMouseEnter={() => setHoverZone('right')}
          onMouseLeave={() => setHoverZone(null)}
          className="hidden md:flex absolute top-0 right-0 w-[30%] h-[calc(100%-80px)] items-center justify-end pr-6 z-10"
          style={{ cursor: slide < totalSlides - 1 ? 'e-resize' : 'default' }}
        >
          {hoverZone === 'right' && slide < totalSlides - 1 && (
            <div className="w-12 h-12 flex items-center justify-center" style={{ background: GOLD }}>
              <ChevronRight size={24} className="text-black" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="absolute bottom-4 sm:bottom-7 left-0 right-0 flex justify-center items-center gap-2 sm:gap-4 z-20 print:hidden">
          <button
            onClick={() => go(-1)}
            disabled={slide === 0}
            className="w-10 h-10 sm:w-12 sm:h-12 border border-neutral-700 bg-black flex items-center justify-center disabled:opacity-20"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex gap-1 sm:gap-1.5">
            {slides.map((_, i) => (
              <div
                key={i}
                onClick={() => setSlide(i)}
                className="h-1 cursor-pointer transition-all"
                style={{
                  width: i === slide ? 24 : 8,
                  background: i === slide ? GOLD : '#333'
                }}
              />
            ))}
          </div>
          <button
            onClick={() => go(1)}
            disabled={slide === totalSlides - 1}
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center disabled:opacity-20"
            style={{ background: GOLD }}
          >
            <ChevronRight size={18} className="text-black" />
          </button>
        </div>
      </div>

      <p className="hidden md:block text-center text-neutral-700 text-xs font-mono tracking-widest mt-4 print:hidden">
        ARROW KEYS / CLICK SIDES
      </p>
    </div>
  )
}

// Slide Components
function TitleSlide({ quarter }: { quarter: string }) {
  const [q, year] = quarter.split(' ')
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black px-4">
      <div className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 border-2 sm:border-4 flex items-center justify-center mb-8 sm:mb-12 md:mb-16" style={{ borderColor: GOLD }}>
        <span className="font-bold text-lg sm:text-2xl md:text-3xl tracking-[0.2em]" style={{ color: GOLD }}>CRC</span>
      </div>
      <h1 className="text-6xl sm:text-8xl md:text-[140px] font-black text-white tracking-tighter leading-none">{q}</h1>
      <h2 className="text-2xl sm:text-4xl md:text-5xl font-mono text-neutral-600 tracking-[0.3em] mt-1 sm:mt-2">{year}</h2>
      <div className="w-16 sm:w-24 md:w-28 h-0.5 sm:h-1 my-6 sm:my-10 md:my-12" style={{ background: GOLD }} />
      <p className="text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] font-bold" style={{ color: GOLD }}>SALES MEETING</p>
      <p className="absolute bottom-16 sm:bottom-20 text-[10px] sm:text-xs font-mono text-neutral-800 tracking-widest">COLLECTIVE REALTY CO.</p>
    </div>
  )
}

function AgendaSlide() {
  const items = ['WELCOME NEW AGENTS', 'SALES OVERVIEW', 'TOP TEAMS', 'TOP PRODUCERS', 'Q&A']
  return (
    <div className="absolute inset-0 p-6 sm:p-12 md:p-20 bg-black overflow-y-auto">
      <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-white tracking-tight mb-8 sm:mb-12 md:mb-16">AGENDA</h2>
      <div className="border-t border-neutral-800">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-4 sm:gap-6 md:gap-10 py-4 sm:py-5 md:py-7 border-b border-neutral-800">
            <span className="font-mono text-lg sm:text-xl md:text-2xl font-bold w-10 sm:w-12 md:w-16" style={{ color: GOLD }}>0{i + 1}</span>
            <span className="text-base sm:text-xl md:text-3xl font-bold tracking-wide">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GrowthSlide({ data, active }: { data: QuarterlyData; active: boolean }) {
  const newAgents = useAnimatedNumber(data.growth.newAgents, 1200, active)
  const totalAgents = useAnimatedNumber(data.growth.totalAgents, 1600, active)
  
  return (
    <div className="absolute inset-0 p-6 sm:p-12 md:p-20 bg-black overflow-y-auto">
      <h2 className="text-3xl sm:text-4xl md:text-6xl font-black text-white tracking-tight mb-2 sm:mb-4">NEW AGENTS</h2>
      <p className="font-mono text-xs text-neutral-600 tracking-widest mb-6 sm:mb-10 md:mb-14">Q{data.quarter.quarter} {data.quarter.year} GROWTH</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        <div className="bg-neutral-900 p-6 sm:p-10 md:p-14" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-mono text-[10px] sm:text-xs tracking-widest mb-3 sm:mb-5" style={{ color: GOLD }}>NEW THIS QUARTER</p>
          <p className="text-6xl sm:text-8xl md:text-[160px] font-black text-white leading-none tracking-tighter">{newAgents}</p>
        </div>
        <div className="bg-neutral-900 p-6 sm:p-10 md:p-14 border-l-[3px] border-neutral-700">
          <p className="font-mono text-[10px] sm:text-xs text-neutral-500 tracking-widest mb-3 sm:mb-5">TOTAL ROSTER</p>
          <p className="text-6xl sm:text-8xl md:text-[160px] font-black text-neutral-600 leading-none tracking-tighter">{totalAgents}</p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 sm:gap-8 md:gap-12 mt-6 sm:mt-10 md:mt-12">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-3 h-3 sm:w-4 sm:h-4" style={{ background: GOLD }} />
          <span className="font-mono text-xs sm:text-sm text-neutral-500">HOUSTON: {data.growth.houstonAgents}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-neutral-700" />
          <span className="font-mono text-xs sm:text-sm text-neutral-500">DALLAS: {data.growth.dallasAgents}</span>
        </div>
      </div>
    </div>
  )
}

function VolumeSlide({ data, active }: { data: QuarterlyData; active: boolean }) {
  const volume = useAnimatedNumber(data.volume.totalVolume, 2000, active)
  const units = useAnimatedNumber(data.volume.totalUnits, 1500, active)
  
  return (
    <div className="absolute inset-0 p-6 sm:p-12 md:p-20 bg-black overflow-y-auto">
      <h2 className="text-3xl sm:text-4xl md:text-6xl font-black text-white tracking-tight mb-6 sm:mb-10 md:mb-14">Q{data.quarter.quarter} CLOSED</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-1">
        <div className="bg-neutral-900 p-6 sm:p-10 md:p-16" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-mono text-[10px] sm:text-xs tracking-widest mb-3 sm:mb-6" style={{ color: GOLD }}>VOLUME</p>
          <p className="text-5xl sm:text-7xl md:text-[120px] font-black text-white leading-none tracking-tight">{formatVolume(volume)}</p>
          <p className="font-mono text-sm text-neutral-600 mt-3 sm:mt-5">${volume.toLocaleString()}</p>
        </div>
        <div className="bg-neutral-900 p-6 sm:p-10 md:p-16 border-l-[3px] border-neutral-700">
          <p className="font-mono text-[10px] sm:text-xs text-neutral-500 tracking-widest mb-3 sm:mb-6">UNITS</p>
          <p className="text-5xl sm:text-7xl md:text-[120px] font-black text-neutral-600 leading-none tracking-tight">{units}</p>
          <p className="font-mono text-sm text-neutral-700 mt-3 sm:mt-5">TRANSACTIONS</p>
        </div>
      </div>
      
      <div className="mt-1 p-4 sm:p-6 md:p-7 flex justify-between items-center" style={{ background: GOLD }}>
        <span className="text-xs sm:text-sm font-bold tracking-widest text-black">AVG DEAL</span>
        <span className="text-xl sm:text-2xl md:text-3xl font-black text-black tracking-tight">${Math.round(data.volume.avgDealSize).toLocaleString()}</span>
      </div>
    </div>
  )
}

function TeamSlide({ team, rank, quarter, active }: { team: QuarterlyData['topTeams'][0]; rank: number; quarter: number; active: boolean }) {
  const volume = useAnimatedNumber(team.volume, 1800, active)
  const units = useAnimatedNumber(team.units, 1200, active)
  
  return (
    <div className="absolute inset-0 p-6 sm:p-12 md:p-20 bg-black overflow-y-auto">
      <h2 className="text-3xl sm:text-4xl md:text-6xl font-black text-white tracking-tight mb-6 sm:mb-10 md:mb-14">
        TOP TEAM <span className="text-neutral-600">#{rank}</span>
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6 sm:gap-8 md:gap-12">
        <div>
          <p className="font-mono text-[10px] sm:text-xs text-neutral-600 tracking-widest mb-2 sm:mb-4">Q{quarter} TOP PERFORMER</p>
          <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight mb-6 sm:mb-10">{team.name}</p>
          
          {team.leads && team.leads.length > 0 && (
            <div className="py-4 sm:py-6 border-t border-b border-neutral-800 mb-6 sm:mb-10">
              <p className="font-mono text-[10px] text-neutral-500 tracking-widest mb-3">TEAM LEAD{team.leads.length > 1 ? 'S' : ''}</p>
              <div className="flex flex-col gap-2">
                {team.leads.map((lead, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <InitialBadge initials={lead.initials} size={40} highlight />
                    <p className="text-base sm:text-xl font-bold text-white">{lead.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {team.members.length > 0 && (
            <div className="flex gap-2">
              {team.members.map((m, i) => (
                <InitialBadge key={i} initials={m.initials} size={36} />
              ))}
            </div>
          )}
        </div>
        
        <div className="flex flex-row md:flex-col gap-1">
          <div className="bg-neutral-900 p-4 sm:p-6 md:p-10 flex-1" style={{ borderLeft: `3px solid ${GOLD}` }}>
            <p className="font-mono text-[10px] sm:text-xs tracking-widest mb-2 sm:mb-4" style={{ color: GOLD }}>VOLUME</p>
            <p className="text-3xl sm:text-5xl md:text-7xl font-black text-white leading-none tracking-tight">{formatVolume(volume)}</p>
          </div>
          <div className="bg-neutral-900 p-4 sm:p-6 md:p-10 flex-1 border-l-[3px] border-neutral-700">
            <p className="font-mono text-[10px] sm:text-xs text-neutral-500 tracking-widest mb-2 sm:mb-4">UNITS</p>
            <p className="text-3xl sm:text-5xl md:text-7xl font-black text-neutral-600 leading-none tracking-tight">{units}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProducersSlide({ 
  type, 
  houston, 
  dallas,
  showConfetti 
}: { 
  type: string
  houston: { name: string; initials: string; volume: number; units: number }[]
  dallas: { name: string; initials: string; volume: number; units: number }[]
  showConfetti?: boolean 
}) {
  const [confetti, setConfetti] = useState(false)
  
  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setConfetti(true), 400)
      return () => { clearTimeout(timer); setConfetti(false) }
    }
  }, [showConfetti])
  
  return (
    <div className="absolute inset-0 p-4 sm:p-10 md:p-16 bg-black overflow-y-auto">
      <Confetti active={confetti} />
      <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-4 sm:mb-8 md:mb-10">
        TOP PRODUCERS: <span style={{ color: GOLD }}>{type}</span>
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 md:gap-10">
        <OfficeList office="HOUSTON" data={houston} isGold />
        <OfficeList office="DALLAS" data={dallas} isGold={false} />
      </div>
    </div>
  )
}

function OfficeList({ 
  office, 
  data, 
  isGold 
}: { 
  office: string
  data: { name: string; initials: string; volume: number; units: number }[]
  isGold: boolean 
}) {
  return (
    <div>
      <div className="mb-3 sm:mb-5 pb-2 sm:pb-4" style={{ borderBottom: `2px solid ${isGold ? GOLD : '#333'}` }}>
        <span className="font-mono text-[10px] sm:text-xs font-bold tracking-[0.2em]" style={{ color: isGold ? GOLD : '#555' }}>
          {office}
        </span>
      </div>
      <div className="flex flex-col">
        {data.map((agent, i) => (
          <div
            key={i}
            className="flex items-center gap-3 sm:gap-5 p-3 sm:p-5 border-b border-neutral-900 animate-slideIn"
            style={{
              background: i === 0 ? '#111' : 'transparent',
              borderLeft: i === 0 ? `3px solid ${isGold ? GOLD : '#444'}` : '3px solid transparent',
              animationDelay: `${i * 0.12}s`
            }}
          >
            <InitialBadge initials={agent.initials} size={40} highlight={isGold && i === 0} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm sm:text-base truncate">{agent.name.toUpperCase()}</p>
              <p className="font-mono text-[10px] sm:text-[11px] text-neutral-500 mt-0.5 sm:mt-1 tracking-widest">{agent.units} UNITS</p>
            </div>
            <p 
              className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight shrink-0"
              style={{ color: i === 0 && isGold ? GOLD : '#666' }}
            >
              {formatVolume(agent.volume)}
            </p>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-neutral-600 font-mono text-xs sm:text-sm py-6 sm:py-8">No data available</p>
        )}
      </div>
      
      <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slideIn { animation: slideIn 0.4s ease forwards; opacity: 0; }
      `}</style>
    </div>
  )
}

function RevealSlide({ agentNet, quarter, year }: { agentNet: number; quarter: number; year: number }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black px-4">
      <p className="font-mono text-xs sm:text-sm text-neutral-600 tracking-[0.3em] mb-4">Q{quarter} {year}</p>
      <p className="font-mono text-sm sm:text-base text-neutral-500 tracking-widest mb-6 sm:mb-10">TOTAL AGENT NET</p>
      <p className="text-5xl sm:text-7xl md:text-9xl lg:text-[180px] font-black tracking-tight leading-none text-white">
        ${agentNet.toLocaleString()}
      </p>
    </div>
  )
}

function CloseSlide({ quarter }: { quarter: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black px-4">
      <h1 className="text-7xl sm:text-9xl md:text-[180px] font-black text-white tracking-tighter">Q&A</h1>
      <div className="w-16 sm:w-24 md:w-28 h-0.5 sm:h-1 my-6 sm:my-10 md:my-12" style={{ background: GOLD }} />
      <p className="font-mono text-sm text-neutral-600 tracking-widest">QUESTIONS?</p>
      <p className="absolute bottom-16 sm:bottom-20 text-[10px] sm:text-xs font-mono text-neutral-800 tracking-widest">
        COLLECTIVE REALTY CO. | {quarter}
      </p>
    </div>
  )
}

function NoDataSlide({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black">
      <p className="font-mono text-base sm:text-xl text-neutral-600">{message}</p>
    </div>
  )
}