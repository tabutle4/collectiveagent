'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PhasePlaceholder } from '../page'
import type { TcEmailTemplate } from '@/types/tc-module'

/**
 * /admin/tc/templates  Email template CRUD
 *
 * Phase 1 scaffold. Each section (Buyer, NC Buyer, Seller) shows every
 * template referenced by a step in that section, ordered by the earliest
 * step_order that uses it. Templates marked transaction_type='all' or
 * used by multiple transaction types appear in EACH section that
 * references them, not in a shared category.
 *
 * Client-side search filters across name, slug, subject, and category
 * (case-insensitive). Filtering runs AFTER sectioning so visible cards
 * always number 1, 2, 3... without gaps.
 */

type SectionKey = 'buyer' | 'nc_buyer' | 'seller'

interface SectionedResponse {
  sections: Record<SectionKey, TcEmailTemplate[]>
  all: TcEmailTemplate[]
}

const SECTION_ORDER: Array<{ key: SectionKey; label: string }> = [
  { key: 'buyer', label: 'Buyer' },
  { key: 'nc_buyer', label: 'NC Buyer' },
  { key: 'seller', label: 'Seller' },
]

export default function TcTemplatesPage() {
  const [sections, setSections] = useState<Record<SectionKey, TcEmailTemplate[]>>({
    buyer: [],
    nc_buyer: [],
    seller: [],
  })
  const [all, setAll] = useState<TcEmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/tc/templates')
      .then(r => r.json())
      .then((data: SectionedResponse & { error?: string }) => {
        if (data.error) {
          setError(data.error)
        } else {
          setSections(data.sections || { buyer: [], nc_buyer: [], seller: [] })
          setAll(data.all || [])
        }
        setLoading(false)
      })
      .catch(() => {
        setError('API route /api/tc/templates not yet implemented (Phase 1 completion)')
        setLoading(false)
      })
  }, [])

  const q = query.trim().toLowerCase()

  // Filter each section independently so sequence numbers stay clean.
  const filteredSections = useMemo(() => {
    if (!q) return sections
    const matches = (t: TcEmailTemplate) => {
      const hay = [t.name, t.slug, t.subject, t.category].join(' ').toLowerCase()
      return hay.includes(q)
    }
    return {
      buyer: sections.buyer.filter(matches),
      nc_buyer: sections.nc_buyer.filter(matches),
      seller: sections.seller.filter(matches),
    }
  }, [sections, q])

  // Also check the flat list for templates not referenced by any step
  // (so a search for an orphan template still surfaces a match message
  // if desired). For now we just use it to compute a total count.
  const totalFiltered =
    filteredSections.buyer.length +
    filteredSections.nc_buyer.length +
    filteredSections.seller.length

  const totalAcrossSections =
    sections.buyer.length + sections.nc_buyer.length + sections.seller.length

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">EMAIL TEMPLATES</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            disabled
          >
            <Plus size={14} />
            New template
          </button>
        </div>
      </div>

      {!loading && !error && totalAcrossSections > 0 && (
        <div className="mb-6 relative max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-4 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search templates by name, slug, subject, or category..."
            className="input-luxury pl-9"
          />
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
      )}

      {error && (
        <>
          <PhasePlaceholder
            phase="Phase 1 (in progress)"
            title="Template list API coming soon"
            description="Once /api/tc/templates is wired up, this page will show all templates grouped by transaction type. The WYSIWYG editor with merge field pills comes in Phase 1 completion."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && totalAcrossSections > 0 && totalFiltered === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-luxury-gray-3">No templates match &ldquo;{query}&rdquo;</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-xs text-luxury-accent hover:text-luxury-accent/80 mt-2"
          >
            Clear search
          </button>
        </div>
      )}

      {!loading && !error && totalFiltered > 0 && (
        <div className="space-y-8">
          {SECTION_ORDER.map(section => {
            const list = filteredSections[section.key]
            if (!list || list.length === 0) return null
            return (
              <section key={section.key}>
                <p className="section-title">
                  {section.label} ({list.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map((t, idx) => (
                    <div
                      key={`${section.key}-${t.id}`}
                      className="container-card hover:border-luxury-accent transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-luxury-gray-1 min-w-0 break-words">
                          {t.name}
                        </h3>
                      </div>
                      <p className="text-xs text-luxury-gray-3 mb-2 break-words">{t.category}</p>
                      <p className="text-xs text-luxury-gray-4 break-words">{t.subject}</p>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {!loading && !error && all.length === 0 && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No templates found"
          description="Run deploy/sql/04_seed_templates.sql in the Supabase SQL Editor to seed the TC templates."
        />
      )}
    </div>
  )
}
