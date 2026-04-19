'use client'

import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { PhasePlaceholder } from '../page'

/**
 * /admin/tc/[id]  TC deal detail page
 *
 * Phase 1 scaffold. Full implementation in Phase 3 (intake) and Phase 4 (queue).
 *
 * Planned tabs:
 *   - Overview: key dates, parties, next 5 events, intake form
 *   - Schedule: all scheduled events for this transaction
 *   - Documents: contract, addenda, amendments with extraction review
 *   - Activity: full audit log
 */
export default function TcDealDetailPage() {
  const params = useParams()
  const id = params?.id as string

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-6 gap-4">
        <div>
          <Link
            href="/admin/tc/list"
            className="text-xs text-luxury-accent hover:text-luxury-accent/80 flex items-center gap-1 mb-2 font-medium"
          >
            <ArrowLeft size={12} />
            Back to Deals
          </Link>
          <h1 className="page-title">DEAL {id?.slice(0, 8).toUpperCase()}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/admin/transactions/${id}`}
            className="btn btn-secondary flex items-center gap-2"
          >
            View Transaction
            <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      <PhasePlaceholder
        phase="Phases 3 and 4"
        title="Deal detail coming soon"
        description="This page will show the TC intake form, key dates timeline, all parties, scheduled events, documents with extraction review, and an activity log for a single transaction. It cross-links to the regular transaction detail page via the 'View Transaction' button."
      />
    </div>
  )
}
