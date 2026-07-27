'use client'

/**
 * Agent Email Dashboard, template manager.
 *
 * Full CRUD for reply templates in the agent_email category. These are
 * the chips that appear in the My Work composer. Create, edit inline,
 * delete with confirm.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Pencil, Trash2, FileText } from 'lucide-react'
import { Template, Modal, formatDateShort, htmlToPlain } from '@/components/agent-email/shared'

export default function AgentEmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const toastTimerRef = useRef<any>(null)

  const flash = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ text, tone })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/agent-email/templates', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load templates')
      setTemplates(json.templates || [])
    } catch (e: any) {
      flash(e?.message || 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }, [flash])

  useEffect(() => {
    load()
  }, [load])

  const remove = useCallback(
    async (t: Template) => {
      if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
      const res = await fetch(`/api/admin/agent-email/templates/${t.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        flash(json?.error || 'Delete failed', 'error')
        return
      }
      flash(`Deleted "${t.name}".`)
      await load()
    },
    [flash, load]
  )

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#EBEBEB]">
      <div className="max-w-[760px] mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <a
              href="/admin/agent-email"
              className="text-luxury-gray-3 hover:text-luxury-gray-1"
              title="Back to the dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div>
              <h1 className="text-[16px] font-semibold text-luxury-gray-1 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Reply templates
              </h1>
              <p className="text-[11.5px] text-luxury-gray-3 italic mt-0.5">
                These appear as chips in the composer. Keep them short and current.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-[12px] px-3 py-1.5 rounded-md bg-luxury-gray-1 text-white hover:bg-luxury-gray-2 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> New template
          </button>
        </div>

        {loading && <div className="text-sm text-luxury-gray-3">Loading...</div>}

        {!loading && templates.length === 0 && (
          <div className="bg-white border border-luxury-gray-4 rounded-lg p-8 text-center">
            <div className="text-sm font-medium text-luxury-gray-1 mb-1">No templates yet</div>
            <div className="text-xs text-luxury-gray-3">
              Create one here, or use "Save as template" in the composer while replying.
            </div>
          </div>
        )}

        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="bg-white border border-luxury-gray-4 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-luxury-gray-1 truncate">{t.name}</div>
                  <div className="text-[12px] text-luxury-gray-3 line-clamp-2 mt-0.5">
                    {htmlToPlain(t.html_content).slice(0, 220)}
                  </div>
                  {t.created_at && (
                    <div className="text-[10.5px] text-luxury-gray-3 mt-1">
                      Created {formatDateShort(t.created_at)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="text-[12px] px-2.5 py-1.5 rounded border border-luxury-gray-4 hover:bg-luxury-gray-5 flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    className="text-[12px] px-2.5 py-1.5 rounded border border-luxury-gray-4 hover:bg-red-50 hover:border-red-200 hover:text-red-800 flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(creating || editing) && (
        <TemplateEditorModal
          template={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setCreating(false)
            setEditing(null)
            flash('Saved.')
            await load()
          }}
          flash={flash}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-md ${
            toast.tone === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-teal-50 text-teal-800 border border-teal-200'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

function TemplateEditorModal({
  template,
  onClose,
  onSaved,
  flash,
}: {
  template: Template | null
  onClose: () => void
  onSaved: () => Promise<void>
  flash: (text: string, tone?: 'ok' | 'error') => void
}) {
  const [name, setName] = useState(template?.name || '')
  const [bodyText, setBodyText] = useState(template ? htmlToPlain(template.html_content) : '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      flash('Name is required.', 'error')
      return
    }
    if (!bodyText.trim()) {
      flash('Body is required.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = template
        ? await fetch(`/api/admin/agent-email/templates/${template.id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), bodyText: bodyText.trim() }),
          })
        : await fetch(`/api/admin/agent-email/templates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              subjectLine: 'Reply template',
              bodyText: bodyText.trim(),
            }),
          })
      const json = await res.json()
      if (!res.ok) {
        flash(json?.error || 'Save failed', 'error')
        return
      }
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title={template ? 'Edit template' : 'New template'} wide>
      <div className="mb-3">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Payout timing"
          className="w-full text-[13px] px-3 py-2 border border-luxury-gray-4 rounded-md"
        />
      </div>
      <div className="mb-4">
        <label className="block text-[10.5px] uppercase text-luxury-gray-3 font-medium mb-1">Body</label>
        <textarea
          rows={10}
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          placeholder="Plain text. Blank line between paragraphs."
          className="w-full text-[13px] px-3 py-2 border border-luxury-gray-4 rounded-md font-sans"
        />
        <p className="text-[10.5px] text-luxury-gray-3 italic mt-1">
          The signature is added automatically at send time, so leave it out here.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] px-4 py-2 border border-luxury-gray-4 rounded hover:bg-luxury-gray-5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="text-[13px] px-4 py-2 bg-luxury-gray-1 text-white rounded hover:bg-luxury-gray-2 disabled:opacity-50"
        >
          {template ? 'Save changes' : 'Create template'}
        </button>
      </div>
    </Modal>
  )
}
