'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, Mail, ExternalLink } from 'lucide-react'
import { PhasePlaceholder } from '../page'
import type { TcProcessStep, TcEmailTemplate, PreferredVendor } from '@/types/tc-module'

/**
 * /admin/tc/process-steps  Process step CRUD
 *
 * Phase 1 scaffold with template preview. Groups steps by transaction_type
 * (buyer, nc_buyer, seller) matching the Preferred Vendors page pattern.
 * Each step card shows the linked email template. Clicking the template
 * name opens a modal with the rendered body. Vendor merge fields render
 * live from /api/tc/vendors.
 *
 * Full editor with drag-to-reorder and inline editing comes in Phase 1
 * completion per TC_Module_Build_Guide.docx section 9.2.
 */

type StepWithTemplate = TcProcessStep & {
  template: Pick<TcEmailTemplate, 'id' | 'slug' | 'name'> | null
}

export default function TcProcessStepsPage() {
  const [steps, setSteps] = useState<StepWithTemplate[]>([])
  const [vendors, setVendors] = useState<PreferredVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tc/process-steps').then(r => r.json()),
      fetch('/api/tc/vendors').then(r => r.json()),
    ])
      .then(([stepsData, vendorsData]) => {
        if (stepsData.error) {
          setError(stepsData.error)
        } else {
          setSteps(stepsData.steps || [])
        }
        if (vendorsData.vendors) {
          setVendors(vendorsData.vendors)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('API routes not yet implemented (Phase 1 completion)')
        setLoading(false)
      })
  }, [])

  // Group by transaction_type. API already sorts by transaction_type then
  // step_order, so iterating preserves the workflow sequence within each
  // section.
  const grouped = steps.reduce<Record<string, StepWithTemplate[]>>((acc, s) => {
    if (!acc[s.transaction_type]) acc[s.transaction_type] = []
    acc[s.transaction_type].push(s)
    return acc
  }, {})

  const sectionOrder: Array<{ key: string; label: string }> = [
    { key: 'buyer', label: 'Buyer' },
    { key: 'nc_buyer', label: 'NC Buyer' },
    { key: 'seller', label: 'Seller' },
  ]

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">PROCESS STEPS</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            disabled
          >
            <Plus size={14} />
            New step
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
            title="Process steps API coming soon"
            description="Once /api/tc/process-steps is wired up, this page will show all 52 seeded steps grouped by transaction type with the linked email template and a preview modal."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="space-y-8">
          {sectionOrder.map(section => {
            const list = grouped[section.key] || []
            if (list.length === 0) return null
            return (
              <section key={section.key}>
                <p className="section-title">
                  {section.label} ({list.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map(s => (
                    <div
                      key={s.id}
                      className="container-card hover:border-luxury-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-luxury-gray-1">{s.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-luxury-light text-luxury-gray-3 whitespace-nowrap flex-shrink-0">
                          {s.step_type}
                        </span>
                      </div>
                      <p className="text-xs text-luxury-gray-3 mb-2">order {s.step_order}</p>
                      <p className="text-xs text-luxury-gray-4 mb-3">
                        {s.anchor
                          ? `${s.anchor} ${(s.offset_days ?? 0) >= 0 ? '+' : ''}${s.offset_days ?? 0}d`
                          : 'no anchor'}
                        {s.recurrence !== 'none' ? ` · ${s.recurrence}` : ''}
                        {s.is_conditional ? ' · conditional' : ''}
                      </p>

                      {s.template ? (
                        <button
                          onClick={() => setPreviewTemplateId(s.template!.id)}
                          className="flex items-center gap-1.5 text-xs text-luxury-accent hover:text-luxury-accent/80 font-medium"
                        >
                          <Mail size={12} />
                          <span className="truncate">{s.template.name}</span>
                        </button>
                      ) : (
                        <p className="text-xs text-luxury-gray-4 italic">No template (task step)</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {!loading && !error && steps.length === 0 && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No process steps found"
          description="Run deploy/sql/05_seed_process_steps.sql in the Supabase SQL Editor to seed the 52 TC process steps."
        />
      )}

      {previewTemplateId && (
        <TemplatePreviewModal
          templateId={previewTemplateId}
          vendors={vendors}
          onClose={() => setPreviewTemplateId(null)}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Preview modal. Matches the repo's inline modal pattern.
// ----------------------------------------------------------------------------

function TemplatePreviewModal({
  templateId,
  vendors,
  onClose,
}: {
  templateId: string
  vendors: PreferredVendor[]
  onClose: () => void
}) {
  const [template, setTemplate] = useState<TcEmailTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tc/templates/${templateId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setTemplate(data.template)
      })
      .catch(() => setError('Failed to load template'))
  }, [templateId])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const rawBody = template?.body_format === 'html' ? template?.html_body : template?.plain_body
  const renderedBody = template && rawBody ? renderPreview(rawBody, vendors) : ''
  const renderedSubject = template ? renderPreview(template.subject, vendors) : ''

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="container-card max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-luxury-gray-5">
          <div className="min-w-0 flex-1">
            <p className="field-label">Template preview</p>
            <h2 className="text-sm font-semibold text-luxury-gray-1 truncate">
              {template?.name || 'Loading...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 p-1 -m-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {error && (
            <div className="px-5 py-4 text-sm text-red-600">Error loading template: {error}</div>
          )}

          {!error && !template && (
            <div className="px-5 py-4 text-sm text-luxury-gray-3">Loading template...</div>
          )}

          {template && (
            <>
              <div className="px-5 py-3 bg-luxury-light border-b border-luxury-gray-5">
                <p className="field-label">Subject</p>
                <p
                  className="text-sm text-luxury-gray-1"
                  dangerouslySetInnerHTML={{ __html: renderedSubject }}
                />
              </div>

              <div className="px-5 py-4">
                {template.body_format === 'html' ? (
                  <div
                    className="text-sm text-luxury-gray-1 leading-relaxed [&_p]:mb-2 [&_strong]:font-semibold [&_u]:underline"
                    dangerouslySetInnerHTML={{ __html: renderedBody }}
                  />
                ) : (
                  <pre
                    className="whitespace-pre-wrap text-sm text-luxury-gray-1 font-sans"
                    dangerouslySetInnerHTML={{ __html: renderedBody }}
                  />
                )}
              </div>

              <div className="px-5 py-3 border-t border-luxury-gray-5 bg-luxury-light">
                <p className="text-xs text-luxury-gray-4">
                  Orange pills are merge fields. They are replaced with real data at send-time.
                  Vendor blocks render live from the Preferred Vendors table.
                </p>
              </div>
            </>
          )}
        </div>

        {template && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-luxury-gray-5">
            <a
              href="/admin/tc/templates"
              className="text-xs text-luxury-accent hover:text-luxury-accent/80 flex items-center gap-1 font-medium"
            >
              Open in Templates
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Merge field renderer (preview only)
// ----------------------------------------------------------------------------

function renderPreview(body: string, vendors: PreferredVendor[]): string {
  const byType = vendors
    .filter(v => v.is_active)
    .reduce<Record<string, PreferredVendor[]>>((acc, v) => {
      if (!acc[v.vendor_type]) acc[v.vendor_type] = []
      acc[v.vendor_type].push(v)
      return acc
    }, {})

  const renderVendor = (v: PreferredVendor): string => {
    const lines: string[] = []
    if (v.contact_name) lines.push(escapeHtml(v.contact_name))
    lines.push(escapeHtml(v.company_name))
    if (v.phone) lines.push(escapeHtml(v.phone))
    if (v.email) lines.push(escapeHtml(v.email))
    return `<p style="margin: 0 0 10px 0;">${lines.join('<br>')}</p>`
  }

  const renderGroup = (label: string, type: string): string => {
    const list = byType[type] || []
    if (list.length === 0) return ''
    return `<div style="text-align: center; margin: 16px 0;">
      <p style="margin: 0 0 10px 0;"><strong><u>${label}</u></strong></p>
      ${list.map(renderVendor).join('')}
    </div>`
  }

  let rendered = body

  rendered = rendered.replace(
    /\{\{preferred_vendors_inspection\}\}/g,
    renderGroup('Inspection Companies', 'inspection')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_insurance\}\}/g,
    renderGroup('Insurance Companies', 'insurance')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_home_warranty\}\}/g,
    renderGroup('Home Warranty Companies', 'home_warranty')
  )
  rendered = rendered.replace(
    /\{\{preferred_vendors_all\}\}/g,
    renderGroup('Inspection Companies', 'inspection') +
      renderGroup('Insurance Companies', 'insurance') +
      renderGroup('Home Warranty Companies', 'home_warranty')
  )

  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const readable = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `<span style="background: rgba(197, 162, 120, 0.12); color: #C5A278; padding: 1px 6px; border-radius: 4px; font-size: 0.92em; font-weight: 500;">[${readable}]</span>`
  })

  return rendered
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
