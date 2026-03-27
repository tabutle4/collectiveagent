'use client'

/**
 * CornerLines - Decorative diagonal lines in corners
 * 
 * Usage:
 *   <CornerLines />                    // Default: both corners
 *   <CornerLines corners="top-left" /> // Single corner
 *   <CornerLines thickness="thick" />  // Thicker lines
 * 
 * Place inside a relative-positioned container that fills the viewport.
 */

type CornerLinesProps = {
  corners?: 'both' | 'top-left' | 'bottom-right'
  thickness?: 'thin' | 'normal' | 'thick'
  className?: string
}

export default function CornerLines({
  corners = 'both',
  thickness = 'normal',
  className = '',
}: CornerLinesProps) {
  // Thickness multipliers
  const thicknessMap = {
    thin: 0.7,
    normal: 1.0,
    thick: 1.4,
  }
  const mult = thicknessMap[thickness]

  // Base stroke widths (multiply by thickness)
  const primary = 1.2 * mult
  const secondary = 1.0 * mult
  const tertiary = 0.8 * mult

  const showTopLeft = corners === 'both' || corners === 'top-left'
  const showBottomRight = corners === 'both' || corners === 'bottom-right'

  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Top-left corner lines */}
      {showTopLeft && (
        <>
          <line
            x1="0"
            y1="0"
            x2="500"
            y2="500"
            stroke="#C5A278"
            strokeWidth={primary}
            strokeOpacity="0.18"
          />
          <line
            x1="0"
            y1="60"
            x2="500"
            y2="560"
            stroke="#C5A278"
            strokeWidth={secondary}
            strokeOpacity="0.13"
          />
          <line
            x1="0"
            y1="120"
            x2="400"
            y2="520"
            stroke="#C5A278"
            strokeWidth={tertiary}
            strokeOpacity="0.09"
          />
          <line
            x1="60"
            y1="0"
            x2="560"
            y2="500"
            stroke="#C5A278"
            strokeWidth={secondary}
            strokeOpacity="0.13"
          />
          <line
            x1="120"
            y1="0"
            x2="520"
            y2="400"
            stroke="#C5A278"
            strokeWidth={tertiary}
            strokeOpacity="0.09"
          />
        </>
      )}

      {/* Bottom-right corner lines */}
      {showBottomRight && (
        <>
          <line
            x1="100%"
            y1="100%"
            x2="calc(100% - 500px)"
            y2="calc(100% - 500px)"
            stroke="#C5A278"
            strokeWidth={primary}
            strokeOpacity="0.15"
          />
          <line
            x1="100%"
            y1="calc(100% - 60px)"
            x2="calc(100% - 500px)"
            y2="calc(100% - 560px)"
            stroke="#C5A278"
            strokeWidth={secondary}
            strokeOpacity="0.10"
          />
          <line
            x1="calc(100% - 60px)"
            y1="100%"
            x2="calc(100% - 560px)"
            y2="calc(100% - 500px)"
            stroke="#C5A278"
            strokeWidth={secondary}
            strokeOpacity="0.10"
          />
        </>
      )}
    </svg>
  )
}