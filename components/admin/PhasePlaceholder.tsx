'use client'

/**
 * Shared empty-state card for the TC module's Phase 1 scaffold pages.
 *
 * Lives here rather than in app/admin/tc/page.tsx because a Next.js App Router
 * page file may only export `default` plus the framework's own config fields.
 * Any other named export fails the production build with "is not a valid Page
 * export field" -- `tsc --noEmit` does not catch it, only `next build` does.
 * Nine TC pages import this, so it needs a home outside a page file.
 */
export function PhasePlaceholder({
  phase,
  title,
  description,
}: {
  phase: string
  title: string
  description: string
}) {
  return (
    <div className="container-card text-center max-w-2xl mx-auto">
      <div className="inline-block px-3 py-1 rounded-full bg-luxury-accent/10 text-luxury-accent text-xs font-semibold mb-3">
        {phase}
      </div>
      <h2 className="text-sm font-semibold text-luxury-gray-1 mb-2">{title}</h2>
      <p className="text-xs text-luxury-gray-3 max-w-md mx-auto leading-relaxed">{description}</p>
    </div>
  )
}
