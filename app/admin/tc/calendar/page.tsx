'use client'

import { PhasePlaceholder } from '../page'

/**
 * /admin/tc/calendar  Full calendar view for TC events
 *
 * Phase 1 scaffold. Full implementation in Phase 4.
 *
 * Planned behavior:
 *   - Desktop: month grid with event pill labels (TC color scheme:
 *     red=closing/deadline, amber=option/contingency, blue=email, teal=milestone)
 *   - Mobile: month grid with colored event bars (matching existing Coaching Calendar
 *     pattern in /components/calendar/CalendarPage.tsx), tap day for bottom sheet
 *   - Reads from tc_scheduled_events where show_on_calendar flag is true
 */
export default function TcCalendarPage() {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">CALENDAR</h1>
      </div>

      <PhasePlaceholder
        phase="Phase 4"
        title="Calendar coming soon"
        description="This calendar will show all TC events across all deals on a month grid. Events render as colored pills on desktop and colored bars on mobile (matching the existing Coaching Calendar pattern). Tap a day on mobile to see the full event list for that day in a bottom sheet drawer."
      />
    </div>
  )
}
