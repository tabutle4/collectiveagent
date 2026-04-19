'use client'

import { Plus } from 'lucide-react'

/**
 * /admin/tc  Dashboard (landing page for Transaction Coordination)
 *
 * Phase 1 scaffold. Renders page shell with sub-nav (see layout.tsx).
 * Full implementation in Phase 4 per TC_Module_Build_Guide.docx section 9.4.
 *
 * Planned contents:
 *   - My Deals counters (TC role only): Active, Closing this week, Needs approval, Shift review
 *   - All TC Deals counters
 *   - Needs your attention today section
 *   - This weeks schedule
 *   - All TC deals table
 */
export default function TcDashboardPage() {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">DASHBOARD</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            disabled
            title="Available in Phase 3"
          >
            <Plus size={14} />
            New TC
          </button>
        </div>
      </div>

      <PhasePlaceholder
        phase="Phase 4"
        title="Dashboard coming soon"
        description="This dashboard will show Leah's daily TC workspace: 4 counter tiles (Active, Closing this week, Needs approval, Shift review), a 'Needs attention today' queue, this week's schedule, and a filterable list of all TC deals."
      />
    </div>
  )
}

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
