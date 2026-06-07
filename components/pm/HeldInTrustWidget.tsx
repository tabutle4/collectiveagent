'use client'

import { useState, useEffect } from 'react'
import { Shield } from 'lucide-react'

interface HeldInTrustData {
  depositsPaidIn: number
  returnedToLandlord: number
  returnedToTenant: number
  reserveHeld: number
  reserveReleased: number
  depositBalance: number
  reserveBalance: number
  heldInTrust: number
}

interface Props {
  landlordId: string
  propertyId?: string
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

  const hasReserve = (data.reserveHeld ?? 0) > 0

  return (
    <div className="container-card">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-luxury-accent" />
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
          Held in Trust
        </h3>
      </div>

      <p className="text-2xl font-semibold text-luxury-gray-1 mb-3">
        {formatMoney(data.heldInTrust)}
      </p>

      {!compact && (
        <div className="space-y-1.5 pt-3 border-t border-luxury-gray-5">
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Security deposits</span>
            <span className="text-luxury-gray-1 font-medium">{formatMoney(data.depositBalance ?? data.heldInTrust)}</span>
          </div>
          {hasReserve && (
            <div className="flex justify-between text-xs">
              <span className="text-luxury-gray-3">Reserve held</span>
              <span className="text-luxury-gray-1 font-medium">{formatMoney(data.reserveBalance ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs pt-1 border-t border-luxury-gray-5">
            <span className="text-luxury-gray-3">Tenant deposits paid in</span>
            <span className="text-luxury-gray-1 font-medium">{formatMoney(data.depositsPaidIn)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Returned to landlord</span>
            <span className="text-luxury-gray-1 font-medium">{formatMoney(data.returnedToLandlord)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Refunded to tenant</span>
            <span className="text-luxury-gray-1 font-medium">{formatMoney(data.returnedToTenant)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
