'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [sections, setSections] = useState<Record<SectionKey, TcEmailTemplate[]>>({
    buyer: [],
    nc_buyer: [],
    seller: [],
  })
  const [all, setAll] = useState<TcEmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [newOpen, setNewOpen] = useState(false)

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
            type="button"
            onClick={() => setNewOpen(true)}
            className="btn btn-primary flex items-center gap-2"
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
                    <Link
                      key={`${section.key}-${t.id}`}
                      href={`/admin/tc/templates/${t.id}`}
                      className="container-card hover:border-luxury-accent transition-colors cursor-pointer block"
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
                    </Link>
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

      {newOpen && (
        <NewTemplateModal
          onClose={() => setNewOpen(false)}
          onSuccess={id => {
            setNewOpen(false)
            router.push(`/admin/tc/templates/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// New template modal
// ============================================================================
// Minimum fields required for insertion: name, slug, transaction_type,
// category, subject. Everything else is edited in the editor after the
// row exists.

function NewTemplateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [transactionType, setTransactionType] = useState<
    'buyer' | 'nc_buyer' | 'seller' | 'all'
  >('buyer')
  const [category, setCategory] = useState('')
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Auto-suggest a slug from the name the first time the user types it.
  const [slugTouched, setSlugTouched] = useState(false)
  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) {
      const auto = v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48)
      setSlug(auto)
    }
  }

  const canSubmit =
    name.trim() && slug.trim() && category.trim() && subject.trim() && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/tc/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          transaction_type: transactionType,
          category: category.trim(),
          subject: subject.trim(),
          body_format: 'html',
          html_body: '',
          uses_banner: false,
          uses_signature: true,
          is_active: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`)
      onSuccess(data.template.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="container-card max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-luxury-gray-1 mb-4">New template</h2>
        <div className="space-y-3">
          <div>
            <label className="field-label">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-luxury"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Under contract welcome"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-luxury font-mono text-xs"
              value={slug}
              onChange={e => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase())
              }}
              placeholder="under_contract_welcome"
            />
            <p className="text-[11px] text-luxury-gray-4 mt-1">
              Lowercase letters, digits, underscores. Must be unique.
            </p>
          </div>

          <div>
            <label className="field-label">
              Transaction type <span className="text-red-500">*</span>
            </label>
            <select
              className="input-luxury"
              value={transactionType}
              onChange={e => setTransactionType(e.target.value as typeof transactionType)}
            >
              <option value="buyer">Buyer</option>
              <option value="nc_buyer">NC Buyer</option>
              <option value="seller">Seller</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="field-label">
              Category <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-luxury"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. Under Contract, Pre-Closing"
            />
          </div>

          <div>
            <label className="field-label">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-luxury"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Welcome to Collective Realty Co."
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn text-luxury-gray-2 border border-luxury-gray-5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                Creating
              </>
            ) : (
              'Create'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
