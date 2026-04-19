'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PhasePlaceholder } from '../page'
import type { TcEmailTemplate } from '@/types/tc-module'

/**
 * /admin/tc/templates  Email template CRUD
 *
 * Phase 1 scaffold. Reads and displays templates in a list so Tara can
 * verify the seed worked. Full WYSIWYG editor in Phase 1 completion per
 * TC_Module_Build_Guide.docx section 9.1.
 */
export default function TcTemplatesPage() {
  const [templates, setTemplates] = useState<TcEmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tc/templates')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setTemplates(data.templates || [])
        }
        setLoading(false)
      })
      .catch(() => {
        setError('API route /api/tc/templates not yet implemented (Phase 1 completion)')
        setLoading(false)
      })
  }, [])

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

      {loading && (
        <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
      )}

      {error && (
        <>
          <PhasePlaceholder
            phase="Phase 1 (in progress)"
            title="Template list API coming soon"
            description="Once /api/tc/templates is wired up, this page will show all 43 seeded templates grouped by category. The WYSIWYG editor with merge field pills comes in Phase 1 completion."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="container-card hover:border-luxury-accent transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-luxury-gray-1">{t.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-luxury-light text-luxury-gray-3 whitespace-nowrap flex-shrink-0">
                  {t.transaction_type}
                </span>
              </div>
              <p className="text-xs text-luxury-gray-3 mb-2">{t.category}</p>
              <p className="text-xs text-luxury-gray-4 truncate">{t.subject}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No templates found"
          description="Run deploy/sql/04_seed_templates.sql in the Supabase SQL Editor to seed the 43 TC templates."
        />
      )}
    </div>
  )
}
