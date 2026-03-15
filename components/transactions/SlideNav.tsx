import { SlideConfig } from '@/lib/transactions/constants'

interface SlideNavProps {
  slides: SlideConfig[]
  currentSlide: number
  onNavigate: (index: number) => void
  canNavigate?: boolean
}

export default function SlideNav({ slides, currentSlide, onNavigate, canNavigate = true }: SlideNavProps) {
  return (
    <div className="container-card p-3">
      <div className="space-y-0.5">
        {slides.map((slide, idx) => {
          const isActive = idx === currentSlide
          const className = !canNavigate && idx !== currentSlide
            ? 'slide-nav-item-disabled'
            : isActive
              ? 'slide-nav-item-active'
              : 'slide-nav-item'

          return (
            <button
              key={slide.id}
              onClick={() => canNavigate && onNavigate(idx)}
              disabled={!canNavigate && !isActive}
              className={className}
            >
              <span className="text-luxury-gray-3 mr-1.5">{idx + 1}.</span>
              {slide.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}