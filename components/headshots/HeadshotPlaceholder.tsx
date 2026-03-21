'use client'

interface HeadshotPlaceholderProps {
  firstName: string
  lastName: string
  size?: number
  className?: string
}

export default function HeadshotPlaceholder({
  firstName,
  lastName,
  size = 48,
  className = '',
}: HeadshotPlaceholderProps) {
  // Get initials
  const firstInitial = firstName?.charAt(0)?.toUpperCase() || ''
  const lastInitial = lastName?.charAt(0)?.toUpperCase() || ''
  const initials = `${firstInitial}${lastInitial}` || '?'

  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: '#FFFFFF',
        color: '#000000',
        fontSize: `${size * 0.4}px`,
        border: '2px solid #e5e7eb',
      }}
    >
      {initials}
    </div>
  )
}
