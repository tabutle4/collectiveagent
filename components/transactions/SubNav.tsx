'use client'

/**
 * Sticky text-only section navigation for the transaction detail page.
 *
 * Items are section anchors within the Overview tab. The active item shows
 * with a small gold dot prefix. As the user scrolls, the active item auto-
 * updates via IntersectionObserver on the section elements. Clicking an item
 * smooth-scrolls to its section.
 *
 * Section IDs must match the `id=` attribute on each section's root div.
 */

import { useEffect, useRef, useState } from 'react'

export interface SubNavSection {
  id: string
  label: string
  /** Hide this item entirely (e.g., Financials for non-broker/ops roles) */
  hidden?: boolean
}

export default function SubNav({ sections }: { sections: SubNavSection[] }) {
  const visible = sections.filter((s) => !s.hidden)
  const [activeId, setActiveId] = useState<string>(visible[0]?.id || '')
  const clickedRef = useRef<string | null>(null)
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Observe section visibility to auto-highlight the current one
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // If the user just clicked a nav item, ignore observer until the
        // scroll-into-view animation settles — otherwise the active dot
        // flickers through intermediate sections.
        if (clickedRef.current) return

        // Pick the topmost visible section
        const visibleEntries = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibleEntries.length > 0) {
          const id = visibleEntries[0].target.id
          if (id) setActiveId(id)
        }
      },
      {
        // Top of section hits the 20% line from the top of the viewport
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      }
    )

    for (const s of visible) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [visible])

  const handleClick = (id: string) => {
    clickedRef.current = id
    setActiveId(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current)
    clickTimeoutRef.current = setTimeout(() => {
      clickedRef.current = null
    }, 700)
  }

  return (
    <nav
      aria-label="Transaction sections"
      className="sticky top-0 z-20 bg-luxury-white/95 backdrop-blur-sm border-b border-luxury-gray-5 px-4 py-3 overflow-x-auto"
    >
      <div className="flex items-center gap-5">
        {visible.map((s) => {
          const active = s.id === activeId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s.id)}
              className={`text-xs whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                active
                  ? 'text-chart-gold-10 font-medium'
                  : 'text-luxury-gray-3 hover:text-luxury-gray-2'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="w-[5px] h-[5px] rounded-full bg-chart-gold-5 inline-block"
                />
              )}
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
