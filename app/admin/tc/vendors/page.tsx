'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PhasePlaceholder } from '../page'
import type { PreferredVendor } from '@/types/tc-module'

/**
 * /admin/tc/vendors  Preferred vendor CRUD
 *
 * Phase 1 scaffold. Reads and displays the 7 seeded vendors. Full CRUD
 * with logo upload and display-order drag-to-reorder comes in Phase 1
 * completion per TC_Module_Build_Guide.docx section 9.3.
 */
export default function TcVendorsPage() {
  const [vendors, setVendors] = useState<PreferredVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tc/vendors')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setVendors(data.vendors || [])
        }
        setLoading(false)
      })
      .catch(() => {
        setError('API route /api/tc/vendors not yet implemented (Phase 1 completion)')
        setLoading(false)
      })
  }, [])

  const grouped = vendors.reduce<Record<string, PreferredVendor[]>>((acc, v) => {
    if (!acc[v.vendor_type]) acc[v.vendor_type] = []
    acc[v.vendor_type].push(v)
    return acc
  }, {})

  const typeLabels: Record<string, string> = {
    inspection: 'Inspection',
    insurance: 'Insurance',
    home_warranty: 'Home Warranty',
    title: 'Title',
    lender: 'Lender',
    other: 'Other',
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">PREFERRED VENDORS</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            disabled
          >
            <Plus size={14} />
            New vendor
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
      )}

      {error && (
        <>
          <PhasePlaceholder
            phase="Phase 1 (in progress)"
            title="Vendors API coming soon"
            description="Once /api/tc/vendors is wired up, this page will show the 7 seeded vendors grouped by type (inspection, insurance, home warranty) with full CRUD, featured toggles, and display-order reordering."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && vendors.length > 0 && (
        <div className="space-y-6">
          {Object.keys(grouped).map(type => (
            <section key={type}>
              <p className="section-title">
                {typeLabels[type] || type} ({grouped[type].length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[type].map(v => (
                  <div
                    key={v.id}
                    className="container-card hover:border-luxury-accent transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-luxury-gray-1 min-w-0 break-words">{v.company_name}</h3>
                      {v.is_featured && (
                        <span className="text-xs px-2 py-0.5 rounded bg-luxury-accent/10 text-luxury-accent font-semibold whitespace-nowrap flex-shrink-0">
                          Featured
                        </span>
                      )}
                    </div>
                    {v.contact_name && (
                      <p className="text-xs text-luxury-gray-3 mb-1 break-words">{v.contact_name}</p>
                    )}
                    <p className="text-xs text-luxury-gray-4 break-words">
                      {v.phone || 'no phone'}
                      {v.email ? ` · ${v.email}` : ''}
                    </p>
                    {!v.is_active && (
                      <p className="text-xs text-luxury-gray-4 mt-2 italic">Inactive</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && !error && vendors.length === 0 && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No vendors found"
          description="Run deploy/sql/02_seed_vendors.sql in the Supabase SQL Editor to seed the 7 preferred vendors."
        />
      )}
    </div>
  )
}
