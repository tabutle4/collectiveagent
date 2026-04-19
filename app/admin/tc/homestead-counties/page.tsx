'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { PhasePlaceholder } from '../page'

/**
 * /admin/tc/homestead-counties  Manage the homestead_links table
 *
 * At email send-time, the {{homestead_application_link}} merge field
 * resolves via transactions.homestead_county_id -> homestead_links.link_url.
 * When Leah creates a TC she picks the county from a dropdown; if its
 * not yet in the list she adds it here (or inline from the intake form
 * in Phase 3).
 */

interface HomesteadCounty {
  id: string
  county_name: string
  state: string
  link_url: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type ModalMode = { type: 'closed' } | { type: 'add' } | { type: 'edit'; county: HomesteadCounty }

export default function HomesteadCountiesPage() {
  const [counties, setCounties] = useState<HomesteadCounty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalMode>({ type: 'closed' })

  const load = () => {
    setLoading(true)
    fetch('/api/tc/homestead-counties')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setCounties(data.counties || [])
          setError(null)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load counties')
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/tc/homestead-counties/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      load()
    } catch {
      alert('Failed to delete. Check your connection and try again.')
    }
  }

  const withLinks = counties.filter(c => c.link_url)
  const withoutLinks = counties.filter(c => !c.link_url)

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">HOMESTEAD COUNTIES</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setModal({ type: 'add' })}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={14} />
            New county
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
      )}

      {error && !loading && (
        <>
          <PhasePlaceholder
            phase="Error"
            title="Failed to load counties"
            description="Try refreshing. If the problem continues, run the Patch 2 SQL migration in Supabase."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && counties.length === 0 && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No counties found"
          description="Run deploy/sql/01_homestead.sql in the Supabase SQL Editor to seed the Texas counties."
        />
      )}

      {!loading && !error && counties.length > 0 && (
        <div className="space-y-8">
          {withLinks.length > 0 && (
            <section>
              <p className="section-title">With Links ({withLinks.length})</p>
              <CountyTable
                counties={withLinks}
                onEdit={c => setModal({ type: 'edit', county: c })}
                onDelete={handleDelete}
              />
            </section>
          )}

          {withoutLinks.length > 0 && (
            <section>
              <p className="section-title">Missing Link ({withoutLinks.length})</p>
              <CountyTable
                counties={withoutLinks}
                onEdit={c => setModal({ type: 'edit', county: c })}
                onDelete={handleDelete}
              />
            </section>
          )}
        </div>
      )}

      {modal.type !== 'closed' && (
        <CountyModal
          mode={modal}
          onClose={() => setModal({ type: 'closed' })}
          onSaved={() => {
            setModal({ type: 'closed' })
            load()
          }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Table
// ----------------------------------------------------------------------------

function CountyTable({
  counties,
  onEdit,
  onDelete,
}: {
  counties: HomesteadCounty[]
  onEdit: (c: HomesteadCounty) => void
  onDelete: (id: string, name: string) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {counties.map(c => (
        <div key={c.id} className="container-card">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-luxury-gray-1 min-w-0 break-words">
              {c.county_name}
              <span className="text-luxury-gray-3 font-normal ml-1">({c.state})</span>
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="p-1 text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                aria-label={`Edit ${c.county_name}`}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id, c.county_name)}
                className="p-1 text-luxury-gray-3 hover:text-red-600 transition-colors"
                aria-label={`Delete ${c.county_name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {c.link_url ? (
            <a
              href={c.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-luxury-accent hover:text-luxury-accent/80 break-all"
            >
              {c.link_url}
            </a>
          ) : (
            <p className="text-xs text-luxury-gray-4 italic">No link set</p>
          )}
          {!c.is_active && (
            <p className="text-xs text-luxury-gray-4 mt-2 italic">Inactive</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Add/edit modal. Matches the repo pattern used in coordination/campaigns.
// ----------------------------------------------------------------------------

function CountyModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: { type: 'add' } | { type: 'edit'; county: HomesteadCounty }
  onClose: () => void
  onSaved: () => void
}) {
  const editing = mode.type === 'edit' ? mode.county : null
  const [countyName, setCountyName] = useState(editing?.county_name ?? '')
  const [state, setState] = useState(editing?.state ?? 'TX')
  const [linkUrl, setLinkUrl] = useState(editing?.link_url ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [isActive, setIsActive] = useState(editing?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitError(null)
    if (!countyName.trim()) {
      setSubmitError('County name is required')
      return
    }
    if (linkUrl.trim() && !/^https?:\/\//i.test(linkUrl.trim())) {
      setSubmitError('Link URL must start with http:// or https://')
      return
    }

    setSaving(true)
    try {
      const url = editing
        ? `/api/tc/homestead-counties/${editing.id}`
        : '/api/tc/homestead-counties'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county_name: countyName.trim(),
          state: state.trim().toUpperCase(),
          link_url: linkUrl.trim() || null,
          notes: notes.trim() || null,
          is_active: isActive,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setSubmitError(data.error)
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setSubmitError('Failed to save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="container-card max-w-lg w-full p-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-luxury-gray-5">
          <h2 className="text-sm font-semibold text-luxury-gray-1">
            {editing ? 'Edit county' : 'New county'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 p-1 -m-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="field-label" htmlFor="county-name">
              County name
            </label>
            <input
              id="county-name"
              type="text"
              value={countyName}
              onChange={e => setCountyName(e.target.value)}
              className="input-luxury"
              placeholder="e.g. Harris"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="county-state">
              State
            </label>
            <input
              id="county-state"
              type="text"
              value={state}
              onChange={e => setState(e.target.value)}
              className="input-luxury"
              maxLength={2}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="county-link">
              Homestead application link
            </label>
            <input
              id="county-link"
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              className="input-luxury"
              placeholder="https://..."
            />
            <p className="text-xs text-luxury-gray-4 mt-1">
              Optional. Can be added later if unknown now.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="county-notes">
              Notes
            </label>
            <textarea
              id="county-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="textarea-luxury"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-luxury-gray-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-luxury-accent"
            />
            Active
          </label>

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {submitError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-luxury-gray-5 bg-luxury-light">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-primary disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
