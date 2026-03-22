'use client'

import Link from 'next/link'

interface LuxuryHeaderProps {
  showTrainingCenter?: boolean
  homeHref?: string
}

export default function LuxuryHeader({ 
  showTrainingCenter = true,
  homeHref = '/agent/profile'
}: LuxuryHeaderProps) {
  return (
    <header className="header-luxury fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center space-x-2 md:space-x-4">
        <Link href={homeHref} className="flex items-center space-x-2 md:space-x-4">
          <img
            src="/logo.png"
            alt="Collective Realty Co."
            className="md:hidden"
            style={{ width: '60px', height: '60px', objectFit: 'contain' }}
          />
          <img
            src="/logo.png"
            alt="Collective Realty Co."
            className="hidden md:block"
            style={{ width: '120px', height: '120px', objectFit: 'contain' }}
          />
          <span className="header-title">COLLECTIVE AGENT</span>
        </Link>
      </div>
      {showTrainingCenter && (
        <a
          href="https://office.collectiverealtyco.com"
          target="_blank"
          rel="noopener noreferrer"
          className="header-subtitle"
        >
          Training Center
        </a>
      )}
    </header>
  )
}