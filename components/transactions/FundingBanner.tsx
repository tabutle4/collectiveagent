'use client'

/**
 * Funding verification banner - one component, four states, shown at the
 * top of the admin deal page on every tab. Replaces the amber commission
 * math flag that compared cleared checks against office gross (that flag
 * fired as a false positive while checks were still outstanding - the
 * 'partial' state here says "waiting" instead of "wrong").
 *
 * Same shape and padding in every state; only border color, icon, text
 * color, and pill colors change.
 */

import { Clock, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import type { FundingStatus } from '@/lib/transactions/funding'

const fmt$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function FundingBanner({
  funding,
  fundedWithoutChecks = false,
}: {
  funding: FundingStatus
  /**
   * True when no check ever reached the office but an agent on the deal has
   * been paid - title paid the agent directly. The raw check math still reads
   * 'waiting' with $0 received, so rendering it unchanged would say "waiting on
   * funds" about money that has already moved, or "verified $0.00 of $X" if the
   * state alone were swapped. This state gets its own copy instead.
   */
  fundedWithoutChecks?: boolean
}) {
  const { state, expected, received, diff, checkCount, clearedCount } = funding

  let border = 'border-luxury-gray-5'
  let icon = <Clock size={16} className="text-luxury-gray-3 flex-shrink-0" />
  let titleClass = 'text-luxury-gray-1'
  let title = 'Waiting on funds'
  let subtext = `No checks received yet. Expecting ${fmt$(expected)} (office gross).`
  let pillClass = 'bg-luxury-gray-5/40 text-luxury-gray-2'
  let pillText = `$0 of ${fmt$(expected)}`

  if (fundedWithoutChecks) {
    return (
      <div className="rounded-lg bg-white p-3 flex items-center gap-3 border border-green-300">
        <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800">Funded, paid direct</p>
          <p className="text-xs text-luxury-gray-3">
            No check passed through the office. An agent on this deal has been paid, so the money
            reached them another way.
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 bg-green-50 text-green-800">
          Paid direct
        </span>
      </div>
    )
  }

  if (state === 'partial') {
    border = 'border-l-4 border-amber-400 border-y border-r border-y-luxury-gray-5 border-r-luxury-gray-5'
    icon = <Loader2 size={16} className="text-amber-600 flex-shrink-0" />
    titleClass = 'text-amber-800'
    title = 'Partially funded'
    subtext = `${clearedCount} of ${checkCount} checks cleared. Waiting on ${fmt$(Math.max(0, expected - received))} more.`
    pillClass = 'bg-amber-50 text-amber-800'
    pillText = `${fmt$(received)} of ${fmt$(expected)}`
  } else if (state === 'matched') {
    border = 'border border-green-300'
    icon = <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
    titleClass = 'text-green-800'
    title = 'Funds verified'
    subtext = 'Checks received match office gross. Ready to pay and close.'
    pillClass = 'bg-green-50 text-green-800'
    pillText = `${fmt$(expected)} of ${fmt$(expected)}`
  } else if (state === 'mismatch') {
    border = 'border border-red-300'
    icon = <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
    titleClass = 'text-red-800'
    title = "Received amount doesn't match"
    subtext = `All checks in: ${fmt$(received)} received vs ${fmt$(expected)} expected. Fix the deal before paying or closing.`
    pillClass = 'bg-red-50 text-red-800'
    pillText = diff > 0 ? `+${fmt$(diff)} over` : `-${fmt$(Math.abs(diff))} short`
  } else {
    border = 'border border-luxury-gray-5'
  }

  return (
    <div className={`rounded-lg bg-white p-3 flex items-center gap-3 ${border}`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${titleClass}`}>{title}</p>
        <p className="text-xs text-luxury-gray-3">{subtext}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${pillClass}`}>
        {pillText}
      </span>
    </div>
  )
}
