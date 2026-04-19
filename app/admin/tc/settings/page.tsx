'use client'

import { useEffect, useState } from 'react'
import { PhasePlaceholder } from '../page'
import type { TcSettings } from '@/types/tc-module'

/**
 * /admin/tc/settings  TC module settings (singleton row editor)
 *
 * Phase 1 scaffold. Reads the singleton tc_settings row. Full editor
 * comes in Phase 1 completion per TC_Module_Build_Guide.docx section 9.5.
 *
 * Homestead links are NOT edited here. They are managed per-county in
 * /admin/tc/homestead-counties (see Patch 2).
 */
export default function TcSettingsPage() {
  const [settings, setSettings] = useState<TcSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tc/settings')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setSettings(data.settings || null)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('API route /api/tc/settings not yet implemented (Phase 1 completion)')
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">SETTINGS</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary disabled:opacity-50" disabled>
            Save changes
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
            title="Settings API coming soon"
            description="Once /api/tc/settings is wired up, this page will let you edit the banner image, signature template, calendar group ID, office email and phone, reply-to, Google review link, and office locations HTML."
          />
          <p className="text-xs text-luxury-gray-4 mt-4 text-center">{error}</p>
        </>
      )}

      {!loading && !error && settings && (
        <div className="max-w-2xl space-y-4">
          <SettingRow label="Office email" value={settings.office_email} />
          <SettingRow label="Office phone" value={settings.office_phone} />
          <SettingRow label="Default reply-to" value={settings.default_reply_to} />
          <SettingRow label="Google review link" value={settings.google_review_link} />
          <SettingRow label="TC calendar group ID" value={settings.tc_calendar_group_id} mono />
          <SettingRow label="Banner image" value={settings.banner_image_url} />
          <SettingRow
            label="Signature template"
            value={settings.signature_html_template ? 'Configured' : null}
          />
          <SettingRow
            label="Office locations HTML"
            value={settings.office_locations_html ? 'Configured' : null}
          />
          <p className="text-xs text-luxury-gray-4 pt-2">
            Last updated {new Date(settings.updated_at).toLocaleString()}
          </p>
        </div>
      )}

      {!loading && !error && !settings && (
        <PhasePlaceholder
          phase="Seed needed"
          title="No settings row found"
          description="Run deploy/sql/03_seed_settings.sql in the Supabase SQL Editor to seed the singleton tc_settings row."
        />
      )}
    </div>
  )
}

function SettingRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div className="container-card">
      <p className="field-label">{label}</p>
      <p
        className={`text-sm text-luxury-gray-1 break-all ${mono ? 'font-mono text-xs' : ''} ${
          !value ? 'italic text-luxury-gray-4' : ''
        }`}
      >
        {value || 'not set'}
      </p>
    </div>
  )
}
