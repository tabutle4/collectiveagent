import React from 'react'
import LuxuryHeader from './LuxuryHeader'

interface PageContainerProps {
  children: React.ReactNode
  includeHeader?: boolean
  className?: string
}

export default function PageContainer({
  children,
  includeHeader = true,
  className = '',
}: PageContainerProps) {
  return (
    <div className={`min-h-screen bg-white ${className}`.trim()}>
      {includeHeader && <LuxuryHeader />}
      <div
        className="max-w-4xl mx-auto px-6"
        style={{ paddingTop: '104px', paddingBottom: '3rem' }}
      >
        {children}
      </div>
    </div>
  )
}
