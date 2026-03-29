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
    newAgentsList: { name: string; initials: string; headshot_url: string | null; office: string }[]
    totalAgents: number
    houstonAgents: number
    dallasAgents: number
  }
  volume: { totalVolume: number; totalUnits: number; avgDealSize: number }
  topTeams: {
    id: string
    name: string
    lead: { name: string; initials: string; headshot_url: string | null } | null
    members: { initials: string; headshot_url: string | null }[]
    volume: number
    units: number
  }[]
  topProducers: {
    sales: {
      houston: { name: string; initials: string; headshot_url: string | null; volume: number; units: number }[]
      dallas: { name: string; initials: string; headshot_url: string | null; volume: number; units: number }[]
    }
    leases: {
      houston: { name: string; initials: string; headshot_url: string | null; volume: number; units: number }[]
      dallas: { name: string; initials: string; headshot_url: string | null; volume: number; units: number }[]
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

function Headshot({ initials, size = 48, highlight = false }: { initials: string; size?: number; highlight?: boolean }) {
  return (
    <div 
      className="flex items-center justify-center font-mono font-bold shrink-0"
      style={{ 
        width: size, 
        height: size, 
        border: `2px solid ${highlight ? GOLD : '#333'}`,
        background: '#000',
        fontSize: size * 0.35,
        color: highlight ? GOLD : '#666'
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
  
  const slides = ['title', 'agenda', 'growth', 'volume', 'team1', 'team2', 'leases', 'sales', 'close']
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
      try {
        const res = await fetch('/api/reports/quarterly')
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
  }, [])

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
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-4 pb-4 border-b-2 border-neutral-800 flex justify-between items-center print:hidden">
        <button
          onClick={() => router.push('/admin/reports')}
          className="text-neutral-500 hover:text-white text-xs font-bold tracking-widest font-mono flex items-center gap-3"
        >
          <ArrowLeft size={16} />
          BACK
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-5 py-3 text-xs font-bold tracking-wider"
            style={{ background: GOLD, color: '#000' }}
          >
            <Maximize2 size={14} />
            TV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-3 border-2 border-neutral-700 text-neutral-500 text-xs font-bold tracking-wider"
          >
            <Printer size={14} />
            PRINT
          </button>
          <span className="font-mono text-sm text-neutral-600 ml-4 font-bold">
            {String(slide + 1).padStart(2, '0')}/{String(totalSlides).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Slide Container */}
      <div 
        className="max-w-7xl mx-auto bg-neutral-950 border-2 border-neutral-800 relative"
        style={{ aspectRatio: '16/9', minHeight: 640 }}
      >
        {/* Slides */}
        {currentSlide === 'title' && <TitleSlide quarter={quarterLabel} />}
        {currentSlide === 'agenda' && <AgendaSlide />}
        {currentSlide === 'growth' && <GrowthSlide data={data} active />}
        {currentSlide === 'volume' && <VolumeSlide data={data} active />}
        {currentSlide === 'team1' && data.topTeams[0] && <TeamSlide team={data.topTeams[0]} rank={1} active />}
        {currentSlide === 'team2' && data.topTeams[1] && <TeamSlide team={data.topTeams[1]} rank={2} active />}
        {currentSlide === 'team2' && !data.topTeams[1] && <NoDataSlide message="No second team data" />}
        {currentSlide === 'leases' && <ProducersSlide type="LEASES" houston={data.topProducers.leases.houston} dallas={data.topProducers.leases.dallas} showConfetti />}
        {currentSlide === 'sales' && <ProducersSlide type="SALES" houston={data.topProducers.sales.houston} dallas={data.topProducers.sales.dallas} showConfetti />}
        {currentSlide === 'close' && <CloseSlide quarter={quarterLabel} />}

        {/* Click zones */}
        <div
          onClick={() => slide > 0 && go(-1)}
          onMouseEnter={() => setHoverZone('left')}
          onMouseLeave={() => setHoverZone(null)}
          className="absolute top-0 left-0 w-[30%] h-[calc(100%-80px)] flex items-center justify-start pl-6 z-10"
          style={{ cursor: slide > 0 ? 'w-resize' : 'default' }}
        >
          {hoverZone === 'left' && slide > 0 && (
            <div className="w-14 h-14 bg-white flex items-center justify-center">
              <ChevronLeft size={28} className="text-black" />
            </div>
          )}
        </div>
        <div
          onClick={() => slide < totalSlides - 1 && go(1)}
          onMouseEnter={() => setHoverZone('right')}
          onMouseLeave={() => setHoverZone(null)}
          className="absolute top-0 right-0 w-[30%] h-[calc(100%-80px)] flex items-center justify-end pr-6 z-10"
          style={{ cursor: slide < totalSlides - 1 ? 'e-resize' : 'default' }}
        >
          {hoverZone === 'right' && slide < totalSlides - 1 && (
            <div className="w-14 h-14 flex items-center justify-center" style={{ background: GOLD }}>
              <ChevronRight size={28} className="text-black" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="absolute bottom-7 left-0 right-0 flex justify-center items-center gap-4 z-5 print:hidden">
          <button
            onClick={() => go(-1)}
            disabled={slide === 0}
            className="w-12 h-12 border-2 border-neutral-700 bg-black flex items-center justify-center disabled:opacity-20"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <div
                key={i}
                onClick={() => setSlide(i)}
                className="h-1 cursor-pointer transition-all"
                style={{
                  width: i === slide ? 40 : 12,
                  background: i === slide ? GOLD : '#333'
                }}
              />
            ))}
          </div>
          <button
            onClick={() => go(1)}
            disabled={slide === totalSlides - 1}
            className="w-12 h-12 flex items-center justify-center disabled:opacity-20"
            style={{ background: GOLD }}
          >
            <ChevronRight size={20} className="text-black" />
          </button>
        </div>
      </div>

      <p className="text-center text-neutral-700 text-xs font-mono tracking-widest mt-4 print:hidden">
        ARROW KEYS / CLICK SIDES
      </p>
    </div>
  )
}

// Slide Components
function TitleSlide({ quarter }: { quarter: string }) {
  const [q, year] = quarter.split(' ')
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black">
      <div className="w-28 h-28 border-4 flex items-center justify-center mb-16" style={{ borderColor: GOLD }}>
        <span className="font-bold text-3xl tracking-[0.2em]" style={{ color: GOLD }}>CRC</span>
      </div>
      <h1 className="text-[140px] font-black text-white tracking-tighter leading-none">{q}</h1>
      <h2 className="text-5xl font-mono text-neutral-600 tracking-[0.3em] mt-2">{year}</h2>
      <div className="w-28 h-1 my-12" style={{ background: GOLD }} />
      <p className="text-sm tracking-[0.3em] font-bold" style={{ color: GOLD }}>SALES MEETING</p>
      <p className="absolute bottom-20 text-xs font-mono text-neutral-800 tracking-widest">COLLECTIVE REALTY CO.</p>
    </div>
  )
}

function AgendaSlide() {
  const items = ['WELCOME NEW AGENTS', 'Q4 SALES OVERVIEW', 'TOP TEAMS', 'TOP PRODUCERS', 'Q&A']
  return (
    <div className="absolute inset-0 p-20 bg-black">
      <h2 className="text-7xl font-black text-white tracking-tight mb-16">AGENDA</h2>
      <div className="border-t-2 border-neutral-800">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-10 py-7 border-b-2 border-neutral-800">
            <span className="font-mono text-2xl font-bold w-16" style={{ color: GOLD }}>0{i + 1}</span>
            <span className="text-3xl font-bold tracking-wide">{item}</span>
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
    <div className="absolute inset-0 p-20 bg-black">
      <h2 className="text-6xl font-black text-white tracking-tight mb-4">NEW AGENTS</h2>
      <p className="font-mono text-sm text-neutral-600 tracking-widest mb-14">Q{data.quarter.quarter} {data.quarter.year} GROWTH</p>
      
      <div className="grid grid-cols-2 gap-1">
        <div className="bg-neutral-900 p-14" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-mono text-xs tracking-widest mb-5" style={{ color: GOLD }}>NEW THIS QUARTER</p>
          <p className="text-[160px] font-black text-white leading-none tracking-tighter">{newAgents}</p>
        </div>
        <div className="bg-neutral-900 p-14 border-l-[3px] border-neutral-700">
          <p className="font-mono text-xs text-neutral-500 tracking-widest mb-5">TOTAL ROSTER</p>
          <p className="text-[160px] font-black text-neutral-600 leading-none tracking-tighter">{totalAgents}</p>
        </div>
      </div>
      
      <div className="flex gap-12 mt-12">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4" style={{ background: GOLD }} />
          <span className="font-mono text-sm text-neutral-500">HOUSTON — {data.growth.houstonAgents}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 bg-neutral-700" />
          <span className="font-mono text-sm text-neutral-500">DALLAS — {data.growth.dallasAgents}</span>
        </div>
      </div>
    </div>
  )
}

function VolumeSlide({ data, active }: { data: QuarterlyData; active: boolean }) {
  const volume = useAnimatedNumber(data.volume.totalVolume, 2000, active)
  const units = useAnimatedNumber(data.volume.totalUnits, 1500, active)
  
  return (
    <div className="absolute inset-0 p-20 bg-black">
      <h2 className="text-6xl font-black text-white tracking-tight mb-14">Q{data.quarter.quarter} CLOSED</h2>
      
      <div className="grid grid-cols-[1.4fr_1fr] gap-1">
        <div className="bg-neutral-900 p-16" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-mono text-xs tracking-widest mb-6" style={{ color: GOLD }}>VOLUME</p>
          <p className="text-[120px] font-black text-white leading-none tracking-tight">{formatVolume(volume)}</p>
          <p className="font-mono text-base text-neutral-600 mt-5">${volume.toLocaleString()}</p>
        </div>
        <div className="bg-neutral-900 p-16 border-l-[3px] border-neutral-700">
          <p className="font-mono text-xs text-neutral-500 tracking-widest mb-6">UNITS</p>
          <p className="text-[120px] font-black text-neutral-600 leading-none tracking-tight">{units}</p>
          <p className="font-mono text-base text-neutral-700 mt-5">TRANSACTIONS</p>
        </div>
      </div>
      
      <div className="mt-1 p-7 flex justify-between items-center" style={{ background: GOLD }}>
        <span className="text-sm font-bold tracking-widest text-black">AVG DEAL</span>
        <span className="text-3xl font-black text-black tracking-tight">${Math.round(data.volume.avgDealSize).toLocaleString()}</span>
      </div>
    </div>
  )
}

function TeamSlide({ team, rank, active }: { team: QuarterlyData['topTeams'][0]; rank: number; active: boolean }) {
  const volume = useAnimatedNumber(team.volume, 1800, active)
  const units = useAnimatedNumber(team.units, 1200, active)
  
  return (
    <div className="absolute inset-0 p-20 bg-black">
      <h2 className="text-6xl font-black text-white tracking-tight mb-14">
        TOP TEAM <span className="text-neutral-600">#{rank}</span>
      </h2>
      
      <div className="grid grid-cols-[1.2fr_1fr] gap-12">
        <div>
          <p className="font-mono text-xs text-neutral-600 tracking-widest mb-4">Q4 TOP PERFORMER</p>
          <p className="text-4xl font-black text-white tracking-tight leading-tight mb-10">{team.name}</p>
          
          {team.lead && (
            <div className="flex items-center gap-5 py-6 border-t-2 border-b-2 border-neutral-800 mb-10">
              <Headshot initials={team.lead.initials} size={64} highlight />
              <div>
                <p className="font-mono text-[10px] text-neutral-500 tracking-widest mb-1">TEAM LEAD</p>
                <p className="text-xl font-bold">{team.lead.name}</p>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            {team.members.slice(0, 4).map((m, i) => (
              <Headshot key={i} initials={m.initials} size={40} />
            ))}
          </div>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="bg-neutral-900 p-10 flex-1" style={{ borderLeft: `3px solid ${GOLD}` }}>
            <p className="font-mono text-xs tracking-widest mb-4" style={{ color: GOLD }}>VOLUME</p>
            <p className="text-7xl font-black text-white leading-none tracking-tight">{formatVolume(volume)}</p>
          </div>
          <div className="bg-neutral-900 p-10 flex-1 border-l-[3px] border-neutral-700">
            <p className="font-mono text-xs text-neutral-500 tracking-widest mb-4">UNITS</p>
            <p className="text-7xl font-black text-neutral-600 leading-none tracking-tight">{units}</p>
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
    <div className="absolute inset-0 p-16 bg-black">
      <Confetti active={confetti} />
      <h2 className="text-5xl font-black text-white tracking-tight mb-10">
        TOP PRODUCERS — <span style={{ color: GOLD }}>{type}</span>
      </h2>
      
      <div className="grid grid-cols-2 gap-10">
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
      <div className="mb-5 pb-4" style={{ borderBottom: `2px solid ${isGold ? GOLD : '#333'}` }}>
        <span className="font-mono text-xs font-bold tracking-[0.2em]" style={{ color: isGold ? GOLD : '#555' }}>
          {office}
        </span>
      </div>
      <div className="flex flex-col">
        {data.map((agent, i) => (
          <div
            key={i}
            className="flex items-center gap-5 p-5 border-b-2 border-neutral-900 animate-slideIn"
            style={{
              background: i === 0 ? '#111' : 'transparent',
              borderLeft: i === 0 ? `3px solid ${isGold ? GOLD : '#444'}` : '3px solid transparent',
              animationDelay: `${i * 0.12}s`
            }}
          >
            <Headshot initials={agent.initials} size={48} highlight={isGold && i === 0} />
            <div className="flex-1">
              <p className="font-bold text-base">{agent.name.toUpperCase()}</p>
              <p className="font-mono text-[11px] text-neutral-500 mt-1 tracking-widest">{agent.units} UNITS</p>
            </div>
            <p 
              className="text-3xl font-black tracking-tight"
              style={{ color: i === 0 && isGold ? GOLD : '#666' }}
            >
              {formatVolume(agent.volume)}
            </p>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-neutral-600 font-mono text-sm py-8">No data available</p>
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

function CloseSlide({ quarter }: { quarter: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black">
      <h1 className="text-[180px] font-black text-white tracking-tighter">Q&A</h1>
      <div className="w-28 h-1 my-12" style={{ background: GOLD }} />
      <p className="font-mono text-base text-neutral-600 tracking-widest">QUESTIONS?</p>
      <p className="absolute bottom-20 text-xs font-mono text-neutral-800 tracking-widest">
        COLLECTIVE REALTY CO. — {quarter}
      </p>
    </div>
  )
}

function NoDataSlide({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center bg-black">
      <p className="font-mono text-xl text-neutral-600">{message}</p>
    </div>
  )
}