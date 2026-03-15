'use client'

interface ContentCardProps {
  children: React.ReactNode
  className?: string
}

export default function ContentCard({ children, className = '' }: ContentCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 p-6 ${className}`}>
      {children}
    </div>
  )
}
