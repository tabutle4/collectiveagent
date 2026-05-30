'use client'

// Held-in-Trust widget.
//
// Surfaces the live held-in-trust balance for a landlord (and optionally
// scoped to one property) on the admin pages. The data already exists via
// /api/pm/held-in-trust - this is just the UI surface that displays it.
//
// Why this matters for CRC:
//   Texas brokers have a fiduciary duty over funds held in trust (Texas
//   Property Code Chapter 92 + TREC rules). Having this visible at all
//   times reduces the risk of accidentally over-disbursing a deposit.
//
// Math (computed server-side in lib/pm-calculations):
//   heldInTrust = depositsPaidIn - returnedToLandlord - returnedToTenant
//
// Usage:
//   <HeldInTrustWidget landlordId={landlordId} />
//   <HeldInTrustWidget landlordId={landlordId} propertyId={propertyId} />

import { useState, useEffect } from 'react'
import { Shield } from 'lucide-react'

interface HeldInTrustData {
  depositsPaidIn: number
  returnedToLandlord: number
  returnedToTenant: number
  heldInTrust: number
}

interface Props {
  landlordId: string
  propertyId?: string
  // Optional - render a tighter compact version (e.g. for sidebars).
  compact?: boolean
}

export default function HeldInTrustWidget({ landlordId, propertyId, compact = false }: Props) {
  const [data, setData] = useState<HeldInTrustData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ landlord_id: landlordId })
        if (propertyId) params.set('property_id', propertyId)
        const res = await fetch(`/api/pm/held-in-trust?${params.toString()}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || `HTTP ${res.status}`)
        }
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load held-in-trust')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [landlordId, propertyId])

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  // Loading state - skeleton matches the final layout height to avoid jump
  if (loading) {
    return (
      <div className="container-card">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} className="text-luxury-accent" />
          <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
            Held in Trust
          </h3>
        </div>
        <p className="text-sm text-luxury-gray-3">Loading...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container-card">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} className="text-luxury-accent" />
          <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
            Held in Trust
          </h3>
        </div>
        <p className="text-sm text-red-600">{error || 'Unable to load'}</p>
      </div>
    )
  }

  return (
    <div className="container-card">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-luxury-accent" />
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
          Held in Trust
        </h3>
      </div>

      {/* Big number */}
      <p className="text-2xl font-semibold text-luxury-gray-1 mb-3">
        {formatMoney(data.heldInTrust)}
      </p>

      {!compact && (
        <div className="space-y-1.5 pt-3 border-t border-luxury-gray-5">
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Tenant deposits paid</span>
            <span className="text-luxury-gray-1 font-medium">
              {formatMoney(data.depositsPaidIn)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Returned to landlord</span>
            <span className="text-luxury-gray-1 font-medium">
              {formatMoney(data.returnedToLandlord)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Refunded to tenant</span>
            <span className="text-luxury-gray-1 font-medium">
              {formatMoney(data.returnedToTenant)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
