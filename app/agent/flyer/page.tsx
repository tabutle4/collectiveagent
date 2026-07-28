'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Image as ImageIcon, Download, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'

interface FlyerRow {
  id: string
  transaction_id: string
  flyer_type: string
  status: string
  has_photo: boolean
  photo_url: string | null
  downloaded: boolean
  created_at: string
  property_address: string
}

const FLYER_TYPE_LABEL: Record<string, string> = {
  just_listed: 'Just Listed',
  just_sold: 'Just Sold',
  just_leased: 'Just Leased',
  under_contract: 'Under Contract',
}

// Date-only values parse as midnight UTC, a day early in Central. Pin to noon.
const fmtDate = (d: string) =>
  new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function AgentFlyerListPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flyers, setFlyers] = useState<FlyerRow[]>([])

  useEffect(() => {
    fetch('/api/agent/flyer')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setFlyers(data.flyers || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="page-title mb-6">MY FLYERS</h1>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 rounded text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-luxury-gray-3" />
        </div>
      ) : flyers.length === 0 ? (
        <div className="container-card text-center py-12">
          <ImageIcon size={28} className="mx-auto text-luxury-gray-4 mb-3" />
          <p className="text-sm text-luxury-gray-2">You do not have any flyers yet.</p>
          <p className="text-xs text-luxury-gray-3 mt-1">
            Flyers are created when you submit a compliance request for a sale or lease.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {flyers.map(f => (
            <Link
              key={f.id}
              href={`/agent/flyer/${f.transaction_id}?type=${f.flyer_type}`}
              className="container-card flex items-center justify-between gap-4 hover:border-luxury-gray-3 transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded bg-luxury-gray-5/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {f.has_photo && f.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={20} className="text-luxury-gray-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-luxury-gray-1 truncate">{f.property_address}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-luxury-gray-3">
                      {FLYER_TYPE_LABEL[f.flyer_type] || f.flyer_type}
                    </span>
                    <span className="text-luxury-gray-4">&middot;</span>
                    <span className="text-xs text-luxury-gray-3">{fmtDate(f.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {f.downloaded ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 size={13} /> Downloaded
                  </span>
                ) : f.has_photo ? (
                  <span className="inline-flex items-center gap-1 text-xs text-luxury-gray-3">
                    <Download size={13} /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-luxury-accent">
                    <ImageIcon size={13} /> Add photo
                  </span>
                )}
                <ArrowRight size={15} className="text-luxury-gray-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
