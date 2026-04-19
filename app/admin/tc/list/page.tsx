'use client'

import { PhasePlaceholder } from '../page'

/**
 * /admin/tc/list  Deals list (filterable table of TC transactions)
 *
 * Phase 1 scaffold. Full implementation in Phase 4.
 *
 * Planned behavior:
 *   - Filterable table: Active, Closing this week, Past 30 days, All
 *   - Columns: Property, Client, Agent, Closing date, Next event, Status
 *   - Sort by closing date by default
 *   - Each row links to /admin/tc/[id] for the deal detail view
 */
export default function TcDealsListPage() {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">DEALS</h1>
      </div>

      <PhasePlaceholder
        phase="Phase 4"
        title="Deals list coming soon"
        description="A filterable table of all TC transactions with columns for property, client, agent, closing date, next scheduled event, and status. Each row links to the deal detail page."
      />
    </div>
  )
}
