'use client'

import { useEffect, useState } from 'react'
import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PhasePlaceholder } from '../page'
import type { TcSettings } from '@/types/tc-module'
import FileUploadDropzone from '@/components/tc/FileUploadDropzone'
import RichTextEditor from '@/components/tc/RichTextEditor'

/**
 * /admin/tc/settings  TC module settings editor
 *
 * Edits the singleton tc_settings row.
 *
 * Save model:
 *   - Banner image: saves immediately on upload via
 *     POST /api/tc/settings/upload-banner. The response includes the new
 *     banner_image_url which replaces the local copy.
 *   - All other fields: staged locally as the user types, committed in
 *     one PATCH /api/tc/settings when the user clicks Save.
 *
 * A banner upload and a pending PATCH can coexist. The Save button is
 * only enabled when there are unsaved text field changes.
 *
 * Homestead links are managed separately at /admin/tc/homestead-counties.
 */
export default function TcSettingsPage() {
  const [settings, setSettings] = useState<TcSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local form state. Initialized from the loaded settings row and
  // updated as the user types. Saving merges this into the server state.
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ----------------------------------------------------------------
  // Load settings
  // ----------------------------------------------------------------

  useEffect(() => {
    fetch('/api/tc/settings')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          const row = (data.settings as TcSettings | null) || null
          setSettings(row)
          if (row) setForm(toForm(row))
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load settings')
        setLoading(false)
      })
  }, [])

  // ----------------------------------------------------------------
  // Dirty detection
  // ----------------------------------------------------------------
  // The Save button should be inactive when form state matches server
  // state. We compare the 7 editable text fields.

  const dirty = settings ? !sameForm(form, toForm(settings)) : false

  // ----------------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------------

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
    setSaveError(null)
  }

  const handleBannerUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/tc/settings/upload-banner', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Upload failed with status ${res.status}`)
    }
    // Merge the new banner URL into local settings so the preview refreshes.
    setSettings(prev => (prev ? { ...prev, banner_image_url: data.banner_image_url } : prev))
  }

  const handleBannerRemove = async () => {
    const res = await fetch('/api/tc/settings/upload-banner', { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Delete failed with status ${res.status}`)
    }
    setSettings(prev => (prev ? { ...prev, banner_image_url: null } : prev))
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const payload = formToPayload(form)
      const res = await fetch('/api/tc/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Save failed with status ${res.status}`)
      }
      // The PATCH response includes the full updated row.
      setSettings(data.settings as TcSettings)
      setForm(toForm(data.settings as TcSettings))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  if (loading) {
    return (
      <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
    )
  }

  if (error) {
    return (
      <>
        <PhasePlaceholder
          phase="Settings unavailable"
          title="Could not load TC settings"
          description="Check your permissions and the console for details."
        />
        <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
      </>
    )
  }

  if (!settings) {
    return (
      <PhasePlaceholder
        phase="Seed needed"
        title="No settings row found"
        description="Run deploy/sql/03_seed_settings.sql in the Supabase SQL Editor to seed the singleton tc_settings row."
      />
    )
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">SETTINGS</h1>
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
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn btn-primary disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save size={14} strokeWidth={1.75} />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* ---- Banner ---- */}
        <SectionCard
          title="Under Contract banner"
          help="Image inserted at the top of all emails with uses_banner enabled. Recommended 800x400 pixels. Uploads save immediately."
        >
          <FileUploadDropzone
            currentUrl={settings.banner_image_url}
            onUpload={handleBannerUpload}
            onRemove={handleBannerRemove}
            acceptedTypes={['image/png', 'image/jpeg', 'image/webp']}
            maxSizeBytes={2 * 1024 * 1024}
            recommendedDimensions={{ width: 800, height: 400 }}
            helpText="Drop banner image here, or click to browse"
            aspectRatio="2/1"
          />
        </SectionCard>

        {/* ---- Office contact info ---- */}
        <SectionCard
          title="Office contact"
          help="Used in email signatures and footers."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Office email" required>
              <input
                type="email"
                className="input-luxury"
                value={form.office_email}
                onChange={e => updateField('office_email', e.target.value)}
                placeholder="office@collectiverealtyco.com"
              />
            </Field>
            <Field label="Default reply-to" required>
              <input
                type="email"
                className="input-luxury"
                value={form.default_reply_to}
                onChange={e => updateField('default_reply_to', e.target.value)}
                placeholder="tcandcompliance@collectiverealtyco.com"
              />
            </Field>
            <Field label="Office phone">
              <input
                type="text"
                className="input-luxury"
                value={form.office_phone}
                onChange={e => updateField('office_phone', e.target.value)}
                placeholder="(832) 555-0000"
              />
            </Field>
            <Field label="Google review link">
              <input
                type="url"
                className="input-luxury"
                value={form.google_review_link}
                onChange={e => updateField('google_review_link', e.target.value)}
                placeholder="https://g.page/r/..."
              />
            </Field>
          </div>
        </SectionCard>

        {/* ---- Calendar ---- */}
        <SectionCard
          title="TC calendar integration"
          help="Microsoft 365 group ID for the shared TC calendar. New TC events are published to this group's calendar via Microsoft Graph. Leave blank to disable calendar writes."
        >
          <Field label="TC calendar group ID">
            <input
              type="text"
              className="input-luxury font-mono text-xs"
              value={form.tc_calendar_group_id}
              onChange={e => updateField('tc_calendar_group_id', e.target.value)}
              placeholder="48f1de3f-74e7-4c5d-b890-bc4147fe3012"
            />
          </Field>
        </SectionCard>

        {/* ---- Signature ---- */}
        <SectionCard
          title="Email signature template"
          help="HTML signature appended to emails with uses_signature enabled. Merge fields like {{office_email}} are replaced at send time."
        >
          <RichTextEditor
            value={form.signature_html_template}
            onChange={v => updateField('signature_html_template', v)}
            variant="lite"
            placeholder="Paste or type the shared signature. Use merge fields like {{tc_name}}, {{office_email}}, {{office_phone}}."
            minHeight={160}
          />
        </SectionCard>

        {/* ---- Office locations ---- */}
        <SectionCard
          title="Office locations HTML"
          help="Optional HTML snippet used inside the signature for multi-location details. Merge fields supported."
        >
          <RichTextEditor
            value={form.office_locations_html}
            onChange={v => updateField('office_locations_html', v)}
            variant="lite"
            placeholder="Houston office | DFW office | etc."
            minHeight={140}
          />
        </SectionCard>

        <p className="text-xs text-luxury-gray-4 pt-2">
          Last updated {new Date(settings.updated_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Form state
// ============================================================================
// We hold local edits in strings (never null) so input controls remain
// controlled. Converting to / from TcSettings happens at the boundaries.

interface FormState {
  office_email: string
  default_reply_to: string
  office_phone: string
  google_review_link: string
  tc_calendar_group_id: string
  signature_html_template: string
  office_locations_html: string
}

const emptyForm: FormState = {
  office_email: '',
  default_reply_to: '',
  office_phone: '',
  google_review_link: '',
  tc_calendar_group_id: '',
  signature_html_template: '',
  office_locations_html: '',
}

function toForm(row: TcSettings): FormState {
  return {
    office_email: row.office_email || '',
    default_reply_to: row.default_reply_to || '',
    office_phone: row.office_phone || '',
    google_review_link: row.google_review_link || '',
    tc_calendar_group_id: row.tc_calendar_group_id || '',
    signature_html_template: row.signature_html_template || '',
    office_locations_html: row.office_locations_html || '',
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.office_email === b.office_email &&
    a.default_reply_to === b.default_reply_to &&
    a.office_phone === b.office_phone &&
    a.google_review_link === b.google_review_link &&
    a.tc_calendar_group_id === b.tc_calendar_group_id &&
    a.signature_html_template === b.signature_html_template &&
    a.office_locations_html === b.office_locations_html
  )
}

/**
 * Convert the form into the PATCH payload.
 *
 * For nullable columns, empty string -> null so the DB row is cleared
 * when the user empties the field. For required columns (office_email,
 * default_reply_to), the server-side route rejects empty via
 * `required: true` on setEmail, so the PATCH returns 400.
 */
function formToPayload(form: FormState): Record<string, string | null> {
  return {
    office_email: form.office_email,
    default_reply_to: form.default_reply_to,
    office_phone: form.office_phone || null,
    google_review_link: form.google_review_link || null,
    tc_calendar_group_id: form.tc_calendar_group_id || null,
    signature_html_template: form.signature_html_template || null,
    office_locations_html: form.office_locations_html || null,
  }
}

// ============================================================================
// Small UI primitives (private to this file)
// ============================================================================

function SectionCard({
  title,
  help,
  children,
}: {
  title: string
  help: string
  children: React.ReactNode
}) {
  return (
    <div className="container-card">
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-luxury-gray-1">{title}</h2>
          <p className="text-xs text-luxury-gray-3 mt-1">{help}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="field-label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
