'use client'

import { PhasePlaceholder } from '../page'

/**
 * /admin/tc/intake-form  Intake form schema editor
 *
 * Phase 1 scaffold. Full implementation in Phase 3.
 *
 * Planned behavior:
 *   - Configure which fields appear on the TC intake form at deal activation
 *   - Per-transaction-type field sets (buyer, nc_buyer, seller)
 *   - Required / optional toggles
 *   - Field label overrides
 *   - Preview pane showing the form as the agent will see it
 */
export default function TcIntakeFormPage() {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">INTAKE FORM</h1>
      </div>

      <PhasePlaceholder
        phase="Phase 3"
        title="Intake form editor coming soon"
        description="This page will let you configure which fields appear on the TC intake form for each transaction type (buyer, NC buyer, seller), mark fields required or optional, override labels, and preview the form as the agent will see it."
      />
    </div>
  )
}
