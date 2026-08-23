'use client'

/**
 * Owner view of the admin dashboard - Courtney's queue-first landing page.
 * Two gold-bordered cards for the only queues she alone can clear (co-sign
 * and CDA approval), metric tiles that are ALL links into filtered lists,
 * a re-pointed Needs Attention card, and a flat Go-to row.
 *
 * Data comes from /api/dashboard/owner, which is gated on
 * can_view_owner_dashboard. The ops/admin views stay on the existing
 * dashboard content in app/admin/dashboard/page.tsx.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, AlertCircle } from 'lucide-react'

const fmt$ = (n: any) => {
  const v = parseFloat(String(n ?? 0)) || 0
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86400000)
  if (days > 1) return `${days} days ago`
  if (days === 1) return 'yesterday'
  const hours = Math.floor(ms / 3600000)
  if (hours >= 1) return `${hours}h ago`
  return 'just now'
}

export default function OwnerDashboard({
  firstName,
  viewPill,
}: {
  firstName: string
  /** The view-toggle pill rendered by the page-level resolver. */
  viewPill: React.ReactNode
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/owner')
      .then(r => (r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || 'Failed to load')))))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateLine = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  if (error || !data)
    return <div className="text-center py-12 text-sm text-red-600">{error || 'Failed to load'}</div>

  const coSign: any[] = data.coSignQueue || []
  const cdaQueue: any[] = data.cdaQueue || []
  const tiles = data.tiles || {}
  const na = data.needsAttention || {}
  const needsYou = coSign.length + cdaQueue.length

  const attentionRows: { text: string; href: string; action: string }[] = []
  for (const d of (na.mismatchDeals || []).slice(0, 5)) {
    attentionRows.push({
      text: `Funding mismatch · ${d.property_address}, ${fmt$(Math.abs(d.diff))} ${d.diff > 0 ? 'over' : 'short of'} expected`,
      href: `/admin/transactions/${d.id}?tab=check_payouts`,
      action: 'Open deal',
    })
  }
  if ((na.bankIssueCount || 0) > 0) {
    attentionRows.push({
      text: `${na.bankIssueCount} active agent${na.bankIssueCount === 1 ? '' : 's'} without a verified bank connection`,
      href: '/admin/billing',
      action: 'View agents',
    })
  }
  if ((na.untouchedProspects || 0) > 0) {
    attentionRows.push({
      text: `${na.untouchedProspects} prospect${na.untouchedProspects === 1 ? '' : 's'} haven't started onboarding`,
      href: '/admin/prospects',
      action: 'Open prospects',
    })
  }

  const tileDefs = [
    {
      label: 'Eligible for payout',
      value: tiles.eligibleForPayout ?? 0,
      href: '/transactions?funding=matched',
      caption: 'Open payout queue',
    },
    {
      label: 'Waiting on funds',
      value: tiles.waitingOnFunds ?? 0,
      href: '/transactions?funding=waiting',
      caption: 'View deals',
    },
    {
      label: 'Needs CDA sent',
      value: tiles.cdaNeeded ?? 0,
      href: '/admin/compliance?tab=needs_cda',
      caption: 'View list',
    },
    {
      label: 'Onboarding in flight',
      value: tiles.onboardingInFlight ?? 0,
      href: '/admin/onboarding',
      caption: `${tiles.onboardingAtW9 ?? 0} at W-9 · open tracker`,
    },
  ]

  return (
    <div>
      {/* Greeting */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title">
            {greeting}, {firstName || 'there'}
          </h1>
          <p className="text-xs text-luxury-gray-3 mt-1">
            {dateLine} · {needsYou} thing{needsYou === 1 ? '' : 's'} need{needsYou === 1 ? 's' : ''} you today
          </p>
        </div>
        {viewPill}
      </div>

      {/* The two queues only the broker can clear */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="container-card border border-[#C5A278]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              Waiting on your signature
            </p>
            <span className="text-xs font-semibold bg-[#F5EDE2] text-luxury-accent px-2 py-0.5 rounded-full">
              {coSign.length}
            </span>
          </div>
          {coSign.length === 0 ? (
            <p className="text-xs text-luxury-gray-3 flex items-center gap-1.5 py-2">
              <CheckCircle size={13} className="text-green-600" /> Nothing else waiting on your signature
            </p>
          ) : (
            <div className="space-y-2">
              {coSign.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-luxury-gray-1 truncate">{u.name}</p>
                    <p className="text-xs text-luxury-gray-3">Signed ICA {timeAgo(u.ica_signed_at)}</p>
                  </div>
                  <Link
                    href={`/sign/${u.id}`}
                    className="btn btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    Sign
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="container-card border border-[#C5A278]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              CDAs awaiting your approval
            </p>
            <span className="text-xs font-semibold bg-[#F5EDE2] text-luxury-accent px-2 py-0.5 rounded-full">
              {cdaQueue.length}
            </span>
          </div>
          {cdaQueue.length === 0 ? (
            <p className="text-xs text-luxury-gray-3 flex items-center gap-1.5 py-2">
              <CheckCircle size={13} className="text-green-600" /> Nothing else in the approval queue
            </p>
          ) : (
            <div className="space-y-2">
              {cdaQueue.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                      {t.property_address}
                    </p>
                    <p className="text-xs text-luxury-gray-3 truncate">
                      {t.agent_name ? `${t.agent_name} · ` : ''}
                      {fmt$(t.office_net)} · sent {timeAgo(t.sent_at)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/cda-approval/${t.id}`}
                    className="btn btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    Review
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metric tiles - every tile is a link, no dead numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {tileDefs.map(tile => (
          <Link key={tile.label} href={tile.href} className="container-card block hover:border-luxury-accent transition-colors">
            <p className="text-xs text-luxury-gray-3 mb-1">{tile.label}</p>
            <p className="text-2xl font-semibold text-luxury-gray-1">{tile.value}</p>
            <p className="text-xs text-luxury-accent mt-1">{tile.caption}</p>
          </Link>
        ))}
      </div>

      {/* Needs attention */}
      <div className="container-card mb-5">
        <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <AlertCircle size={13} className="text-amber-600" /> Needs attention
        </p>
        {attentionRows.length === 0 ? (
          <p className="text-xs text-luxury-gray-3 flex items-center gap-1.5 py-1">
            <CheckCircle size={13} className="text-green-600" /> Nothing needs attention right now
          </p>
        ) : (
          <div className="space-y-2">
            {attentionRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <p className="text-xs text-luxury-gray-2 min-w-0">{row.text}</p>
                <Link href={row.href} className="text-xs text-luxury-accent hover:underline flex-shrink-0">
                  {row.action}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Go to */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-xs text-luxury-gray-3">Go to</span>
        <Link href="/admin/insights" className="text-xs text-luxury-accent hover:underline">Coaching insights</Link>
        <Link href="/admin/reports" className="text-xs text-luxury-accent hover:underline">Reports</Link>
        <Link href="/admin/compliance" className="text-xs text-luxury-accent hover:underline">Compliance</Link>
        <Link href="/admin/onboarding" className="text-xs text-luxury-accent hover:underline">Onboarding tracker</Link>
        <Link href="/admin/users" className="text-xs text-luxury-accent hover:underline">Agent roster</Link>
        <Link href="/admin/checks" className="text-xs text-luxury-accent hover:underline">Checks</Link>
      </div>
    </div>
  )
}
