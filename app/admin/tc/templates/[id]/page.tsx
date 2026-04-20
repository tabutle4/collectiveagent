'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Archive,
  Copy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Send,
} from 'lucide-react'
import RichTextEditor from '@/components/tc/RichTextEditor'
import SendTestModal from '@/components/tc/SendTestModal'
import {
  MERGE_FIELDS,
  MERGE_FIELD_GROUPS,
  renderTemplatePreview,
} from '@/lib/tc/mergeFields'
import type {
  TcEmailTemplate,
  TcAttachmentRef,
  PreferredVendor,
} from '@/types/tc-module'

/**
 * /admin/tc/templates/[id]  Template editor
 *
 * Layout:
 *   LEFT column:
 *     Metadata panel (name, slug, transaction_type, category,
 *                     uses_banner, uses_signature, is_active,
 *                     attach_documents, notes)
 *     Subject input
 *     Body editor (Tiptap, full toolbar)
 *   RIGHT column (sticky):
 *     Merge field pill sidebar with search
 *     Live preview pane (below sidebar)
 *
 * Save button at the top right commits a PATCH. Archive soft-deletes.
 * Duplicate opens a modal to pick a new slug + name then POSTs a new row.
 *
 * Body storage: when body_format='html' we write html_body. When
 * body_format='plain_text' we still use the Tiptap editor (it gracefully
 * handles plain paragraphs) but write the stripped text to plain_body.
 * Most CRC templates are html so html is the default.
 */

export default function TemplateEditorPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [template, setTemplate] = useState<TcEmailTemplate | null>(null)
  const [vendors, setVendors] = useState<PreferredVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Local edit state (controlled form). Initialized from loaded template.
  const [form, setForm] = useState<FormState>(emptyForm)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Archive state
  const [archiving, setArchiving] = useState(false)

  // Duplicate modal state
  const [dupOpen, setDupOpen] = useState(false)

  // Send test modal state
  const [testOpen, setTestOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState<string>('')

  // Merge field sidebar search
  const [fieldQuery, setFieldQuery] = useState('')

  // Subject cursor position (for inserting merge fields from sidebar)
  const [subjectRef, setSubjectRef] = useState<HTMLInputElement | null>(null)

  // Tiptap editor ref is inside RichTextEditor. To insert into the body
  // we append the token to html_body and rely on the editor's value
  // prop sync to place it at the end. A more elaborate approach would
  // expose a ref. For now, inserting-at-cursor works for subject only;
  // body inserts append to the end.

  // ----------------------------------------------------------------
  // Load template + vendors
  // ----------------------------------------------------------------

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetch(`/api/tc/templates/${id}`).then(r => r.json()),
      fetch('/api/tc/vendors').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ])
      .then(([tplData, vendorData, meData]) => {
        if (tplData.error) {
          setLoadError(tplData.error)
        } else if (tplData.template) {
          const t = tplData.template as TcEmailTemplate
          setTemplate(t)
          setForm(toForm(t))
        }
        if (vendorData && Array.isArray(vendorData.vendors)) {
          setVendors(vendorData.vendors as PreferredVendor[])
        }
        if (meData?.user?.email && typeof meData.user.email === 'string') {
          setAdminEmail(meData.user.email)
        }
        setLoading(false)
      })
      .catch(e => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load template')
        setLoading(false)
      })
  }, [id])

  // ----------------------------------------------------------------
  // Dirty detection
  // ----------------------------------------------------------------

  const dirty = template ? !sameForm(form, toForm(template)) : false

  // ----------------------------------------------------------------
  // Field updates
  // ----------------------------------------------------------------

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
    setSaveError(null)
  }

  const toggleAttach = (key: TcAttachmentRef) => {
    setForm(prev => {
      const present = prev.attach_documents.includes(key)
      return {
        ...prev,
        attach_documents: present
          ? prev.attach_documents.filter(k => k !== key)
          : [...prev.attach_documents, key],
      }
    })
    setSaveSuccess(false)
  }

  // ----------------------------------------------------------------
  // Insert merge field
  // ----------------------------------------------------------------

  const insertIntoSubject = useCallback(
    (token: string) => {
      if (subjectRef) {
        const start = subjectRef.selectionStart ?? form.subject.length
        const end = subjectRef.selectionEnd ?? form.subject.length
        const next = form.subject.slice(0, start) + token + form.subject.slice(end)
        update('subject', next)
        // Restore focus and move cursor to after the inserted token.
        const pos = start + token.length
        setTimeout(() => {
          subjectRef.focus()
          subjectRef.setSelectionRange(pos, pos)
        }, 0)
      } else {
        update('subject', form.subject + token)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.subject, subjectRef]
  )

  const appendToBody = useCallback(
    (token: string) => {
      // Append to html_body as a trailing span-less token. The Tiptap
      // editor will parse it as text on the next value-sync.
      const next =
        (form.html_body || '') + (form.html_body?.endsWith('>') ? '' : ' ') + token
      update('html_body', next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.html_body]
  )

  // Default target for pill clicks. If the user last focused the subject,
  // target the subject. Otherwise target the body.
  const [lastFocus, setLastFocus] = useState<'subject' | 'body'>('body')

  const handlePillClick = (token: string) => {
    if (lastFocus === 'subject') insertIntoSubject(token)
    else appendToBody(token)
  }

  // ----------------------------------------------------------------
  // Save
  // ----------------------------------------------------------------

  const handleSave = async () => {
    if (!dirty || !id) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const payload = formToPatchPayload(form)
      const res = await fetch(`/api/tc/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Save failed (${res.status})`)
      }
      setTemplate(data.template as TcEmailTemplate)
      setForm(toForm(data.template as TcEmailTemplate))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ----------------------------------------------------------------
  // Archive
  // ----------------------------------------------------------------

  const handleArchive = async () => {
    if (!id || !template) return
    const ok = window.confirm(
      `Archive "${template.name}"? It will be hidden from lists but remains in the database for audit.`
    )
    if (!ok) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/tc/templates/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Archive failed (${res.status})`)
      }
      router.push('/admin/tc/templates')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Archive failed')
      setArchiving(false)
    }
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  if (loading) {
    return <div className="py-12 text-center text-sm text-luxury-gray-3">Loading...</div>
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto mt-12 container-card">
        <p className="text-sm text-red-600 mb-2">Could not load template</p>
        <p className="text-xs text-luxury-gray-3 mb-4">{loadError}</p>
        <Link
          href="/admin/tc/templates"
          className="text-xs text-luxury-accent hover:text-luxury-accent/80"
        >
          Back to templates
        </Link>
      </div>
    )
  }

  if (!template) {
    return <div className="py-12 text-center text-sm text-luxury-gray-3">Not found.</div>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/admin/tc/templates"
            className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Templates
          </Link>
          <h1 className="page-title truncate min-w-0">{template.name}</h1>
          {!template.is_active && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-luxury-gray-5/60 text-luxury-gray-2 flex-shrink-0">
              Archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-[13px] text-emerald-700">
              <CheckCircle2 size={14} strokeWidth={1.75} />
              Saved
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-[13px] text-red-600">
              <AlertCircle size={14} strokeWidth={1.75} />
              {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={() => setDupOpen(true)}
            className="btn flex items-center gap-1.5 text-luxury-gray-2 hover:text-luxury-gray-1 border border-luxury-gray-5"
          >
            <Copy size={14} strokeWidth={1.75} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            disabled={dirty || !template.is_active}
            title={
              dirty
                ? 'Save your changes before sending a test'
                : !template.is_active
                  ? 'Reactivate this template to send a test'
                  : 'Send a test render to any inbox'
            }
            className="btn flex items-center gap-1.5 text-luxury-gray-2 hover:text-luxury-gray-1 border border-luxury-gray-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} strokeWidth={1.75} />
            Send test
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving || !template.is_active}
            className="btn flex items-center gap-1.5 text-luxury-gray-2 hover:text-red-600 border border-luxury-gray-5 disabled:opacity-50"
          >
            <Archive size={14} strokeWidth={1.75} />
            {archiving ? 'Archiving' : 'Archive'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save size={14} strokeWidth={1.75} />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* ==== LEFT: Editor column ==== */}
        <div className="space-y-5 min-w-0">
          {/* Metadata */}
          <div className="container-card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Template name" required>
                <input
                  type="text"
                  className="input-luxury"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                />
              </Field>
              <Field label="Slug" required help="lowercase letters, digits, underscores">
                <input
                  type="text"
                  className="input-luxury font-mono text-xs"
                  value={form.slug}
                  onChange={e => update('slug', e.target.value.toLowerCase())}
                />
              </Field>
              <Field label="Transaction type" required>
                <select
                  className="input-luxury"
                  value={form.transaction_type}
                  onChange={e =>
                    update(
                      'transaction_type',
                      e.target.value as FormState['transaction_type']
                    )
                  }
                >
                  <option value="buyer">Buyer</option>
                  <option value="nc_buyer">NC Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="all">All</option>
                </select>
              </Field>
              <Field label="Category" required>
                <input
                  type="text"
                  className="input-luxury"
                  value={form.category}
                  onChange={e => update('category', e.target.value)}
                  placeholder="e.g. Under Contract, Pre-Closing"
                />
              </Field>
            </div>

            {/* Flags */}
            <div className="mt-4 flex flex-wrap gap-4">
              <Toggle
                label="Include banner"
                checked={form.uses_banner}
                onChange={v => update('uses_banner', v)}
              />
              <Toggle
                label="Include signature"
                checked={form.uses_signature}
                onChange={v => update('uses_signature', v)}
              />
              <Toggle
                label="Active"
                checked={form.is_active}
                onChange={v => update('is_active', v)}
              />
            </div>

            {/* Attachments */}
            <div className="mt-4">
              <p className="field-label">Attach to email</p>
              <div className="flex flex-wrap gap-2">
                {(['contract', 'addenda', 'amendment'] as TcAttachmentRef[]).map(a => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => toggleAttach(a)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      form.attach_documents.includes(a)
                        ? 'bg-luxury-accent/10 border-luxury-accent text-luxury-gray-1'
                        : 'bg-white border-luxury-gray-5 text-luxury-gray-2 hover:border-luxury-gray-3'
                    }`}
                  >
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <Field label="Internal notes" help="Not included in the email.">
                <textarea
                  className="input-luxury"
                  rows={2}
                  value={form.notes}
                  onChange={e => update('notes', e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Subject */}
          <div className="container-card">
            <Field label="Subject line" required>
              <input
                ref={setSubjectRef}
                type="text"
                className="input-luxury"
                value={form.subject}
                onChange={e => update('subject', e.target.value)}
                onFocus={() => setLastFocus('subject')}
              />
            </Field>
          </div>

          {/* Body */}
          <div className="container-card" onFocus={() => setLastFocus('body')}>
            <p className="field-label">Email body</p>
            <RichTextEditor
              value={form.html_body}
              onChange={v => update('html_body', v)}
              variant="full"
              placeholder="Write the email body. Click a merge field pill on the right to insert it."
              minHeight={320}
            />
          </div>
        </div>

        {/* ==== RIGHT: Sidebar ==== */}
        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <MergeFieldSidebar
            query={fieldQuery}
            setQuery={setFieldQuery}
            onInsert={handlePillClick}
            targetLabel={lastFocus === 'subject' ? 'subject' : 'body'}
          />

          <LivePreview
            subject={form.subject}
            body={form.html_body}
            vendors={vendors}
            usesBanner={form.uses_banner}
            usesSignature={form.uses_signature}
          />
        </aside>
      </div>

      {dupOpen && template && (
        <DuplicateModal
          template={template}
          onClose={() => setDupOpen(false)}
          onSuccess={newId => {
            setDupOpen(false)
            router.push(`/admin/tc/templates/${newId}`)
          }}
        />
      )}

      {testOpen && template && (
        <SendTestModal
          templateId={template.id}
          templateName={template.name}
          defaultFromEmail={adminEmail}
          defaultToEmail={adminEmail}
          onClose={() => setTestOpen(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Form state
// ============================================================================

interface FormState {
  name: string
  slug: string
  transaction_type: 'buyer' | 'nc_buyer' | 'seller' | 'all'
  category: string
  subject: string
  html_body: string
  notes: string
  uses_banner: boolean
  uses_signature: boolean
  is_active: boolean
  attach_documents: TcAttachmentRef[]
}

const emptyForm: FormState = {
  name: '',
  slug: '',
  transaction_type: 'buyer',
  category: '',
  subject: '',
  html_body: '',
  notes: '',
  uses_banner: false,
  uses_signature: true,
  is_active: true,
  attach_documents: [],
}

function toForm(t: TcEmailTemplate): FormState {
  return {
    name: t.name || '',
    slug: t.slug || '',
    transaction_type: t.transaction_type,
    category: t.category || '',
    subject: t.subject || '',
    html_body: t.html_body || '',
    notes: t.notes || '',
    uses_banner: !!t.uses_banner,
    uses_signature: !!t.uses_signature,
    is_active: !!t.is_active,
    attach_documents: Array.isArray(t.attach_documents) ? [...t.attach_documents] : [],
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.name === b.name &&
    a.slug === b.slug &&
    a.transaction_type === b.transaction_type &&
    a.category === b.category &&
    a.subject === b.subject &&
    a.html_body === b.html_body &&
    a.notes === b.notes &&
    a.uses_banner === b.uses_banner &&
    a.uses_signature === b.uses_signature &&
    a.is_active === b.is_active &&
    sameArray(a.attach_documents, b.attach_documents)
  )
}

function sameArray<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const bs = new Set(b as unknown[])
  for (const x of a) if (!bs.has(x as unknown)) return false
  return true
}

function formToPatchPayload(form: FormState) {
  return {
    name: form.name,
    slug: form.slug,
    transaction_type: form.transaction_type,
    category: form.category,
    subject: form.subject,
    html_body: form.html_body || null,
    notes: form.notes || null,
    uses_banner: form.uses_banner,
    uses_signature: form.uses_signature,
    is_active: form.is_active,
    attach_documents: form.attach_documents,
  }
}

// ============================================================================
// UI primitives
// ============================================================================

function Field({
  label,
  required = false,
  help,
  children,
}: {
  label: string
  required?: boolean
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="field-label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {help && <p className="text-[11px] text-luxury-gray-4 mt-1">{help}</p>}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-luxury-accent"
      />
      <span className="text-xs text-luxury-gray-2">{label}</span>
    </label>
  )
}

// ============================================================================
// Merge field sidebar
// ============================================================================

function MergeFieldSidebar({
  query,
  setQuery,
  onInsert,
  targetLabel,
}: {
  query: string
  setQuery: (v: string) => void
  onInsert: (token: string) => void
  targetLabel: string
}) {
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      MERGE_FIELDS.filter(f =>
        !q
          ? true
          : f.token.toLowerCase().includes(q) ||
            f.label.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q)
      ),
    [q]
  )

  return (
    <div className="container-card">
      <p className="field-label">Merge fields</p>
      <p className="text-[11px] text-luxury-gray-4 mb-2">
        Click to insert into <strong>{targetLabel}</strong>. Click inside the subject or body to change where inserts land.
      </p>

      <div className="relative mb-3">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-luxury-gray-4 pointer-events-none"
        />
        <input
          type="search"
          className="input-luxury pl-7 text-xs"
          placeholder="Search fields..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {MERGE_FIELD_GROUPS.map(group => {
          const fields = filtered.filter(f => f.group === group.key)
          if (fields.length === 0) return null
          return (
            <div key={group.key}>
              <p className="text-[10px] uppercase tracking-wider text-luxury-gray-3 font-semibold mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <button
                    type="button"
                    key={f.token}
                    onClick={() => onInsert(f.token)}
                    title={`${f.token}\n${f.description}`}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-luxury-accent/10 text-luxury-accent hover:bg-luxury-accent/20 transition-colors"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-luxury-gray-4 italic">No fields match.</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Live preview
// ============================================================================

function LivePreview({
  subject,
  body,
  vendors,
  usesBanner,
  usesSignature,
}: {
  subject: string
  body: string
  vendors: PreferredVendor[]
  usesBanner: boolean
  usesSignature: boolean
}) {
  const renderedSubject = useMemo(
    () => renderTemplatePreview(subject, vendors),
    [subject, vendors]
  )
  const renderedBody = useMemo(
    () => renderTemplatePreview(body, vendors),
    [body, vendors]
  )

  return (
    <div className="container-card">
      <p className="field-label">Live preview</p>

      {usesBanner && (
        <div className="mb-3 p-3 border border-dashed border-luxury-gray-5 rounded text-center text-[11px] text-luxury-gray-3">
          [Banner image appears here at send time]
        </div>
      )}

      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-luxury-gray-4 mb-1">Subject</p>
        <p
          className="text-sm text-luxury-gray-1 break-words"
          dangerouslySetInnerHTML={{ __html: renderedSubject || '<em>empty</em>' }}
        />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-luxury-gray-4 mb-1">Body</p>
        <div
          className="text-sm text-luxury-gray-1 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderedBody || '<em>empty</em>' }}
        />
      </div>

      {usesSignature && (
        <div className="mt-3 p-3 border border-dashed border-luxury-gray-5 rounded text-center text-[11px] text-luxury-gray-3">
          [Signature appears here at send time]
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Duplicate modal
// ============================================================================

function DuplicateModal({
  template,
  onClose,
  onSuccess,
}: {
  template: TcEmailTemplate
  onClose: () => void
  onSuccess: (newId: string) => void
}) {
  const [name, setName] = useState(`${template.name} (copy)`)
  const [slug, setSlug] = useState(`${template.slug}_copy`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/tc/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          transaction_type: template.transaction_type,
          category: template.category,
          subject: template.subject,
          body_format: template.body_format,
          html_body: template.html_body,
          plain_body: template.plain_body,
          default_recipient_roles: template.default_recipient_roles,
          attach_documents: template.attach_documents,
          uses_banner: template.uses_banner,
          uses_signature: template.uses_signature,
          is_active: true,
          notes: template.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Duplicate failed (${res.status})`)
      onSuccess(data.template.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Duplicate failed')
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
        <h2 className="text-sm font-semibold text-luxury-gray-1 mb-4">Duplicate template</h2>
        <div className="space-y-3">
          <Field label="New name" required>
            <input
              type="text"
              className="input-luxury"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </Field>
          <Field
            label="New slug"
            required
            help="Must be unique. Lowercase letters, digits, underscores."
          >
            <input
              type="text"
              className="input-luxury font-mono text-xs"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
            />
          </Field>
          {err && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle size={12} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" />
              {err}
            </p>
          )}
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
            disabled={busy || !name.trim() || !slug.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {busy ? 'Creating' : 'Create copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
