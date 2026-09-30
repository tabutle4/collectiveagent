'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import {
  ChevronLeft,
  Plus,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

type ListName = 'items' | 'tasks'

interface Row {
  id: string
  label: string
  description: string | null
  display_order: number
  is_active: boolean
  section?: string | null
  section_title?: string | null
  item_key?: string | null
  priority?: string | null
  link_text?: string | null
  link_url?: string | null
  second_link_text?: string | null
  second_link_url?: string | null
  agent_variant?: string | null
}

interface SectionOption {
  section: string
  section_title: string
}

interface Draft {
  id?: string
  label: string
  description: string
  section: string
  section_title: string
  item_key: string
  priority: string
  link_text: string
  link_url: string
  second_link_text: string
  second_link_url: string
  agent_variant: string
}

const EMPTY_DRAFT: Draft = {
  label: '',
  description: '',
  section: '',
  section_title: '',
  item_key: '',
  priority: 'normal',
  link_text: '',
  link_url: '',
  second_link_text: '',
  second_link_url: '',
  agent_variant: 'standard',
}

const LIST_LABELS: Record<ListName, string> = {
  items: 'Agent Checklist',
  tasks: 'Office Tasks',
}

export default function OnboardingChecklistSettingsPage() {
  const { user, hasPermission } = useAuth()
  const router = useRouter()
  const canManage = hasPermission('can_manage_onboarding_checklist')

  const [list, setList] = useState<ListName>('items')
  const [variant, setVariant] = useState('standard')
  const [rows, setRows] = useState<Row[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const loadData = useCallback(async (which: ListName) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/onboarding-checklist?list=${which}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to load')
      }
      const data = await res.json()
      setRows(data.rows || [])
      setSections(data.sections || [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // Same bounce the sibling checklist settings page does, so someone without
  // the permission lands somewhere useful instead of on an error banner.
  useEffect(() => {
    if (user && !hasPermission('can_view_onboarding_checklist')) {
      router.push('/admin/settings')
    }
  }, [user, hasPermission, router])

  useEffect(() => {
    loadData(list)
  }, [list, loadData])

  // Office tasks number each variant from 1, so the two lists are shown and
  // reordered separately.
  const visible =
    list === 'tasks' ? rows.filter(r => (r.agent_variant || 'standard') === variant) : rows

  const activeVisible = visible.filter(r => r.is_active)

  const send = async (method: string, body: any, okMsg: string) => {
    setBusy(body.id || 'new')
    try {
      const res = await fetch('/api/admin/onboarding-checklist', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Request failed')
      }
      await loadData(list)
      flash(okMsg)
      return true
    } catch (e: any) {
      setError(e?.message || 'Request failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  const move = (row: Row, direction: 'up' | 'down') =>
    send('PUT', { list, id: row.id, action: 'move', direction }, 'Order updated')

  const toggleActive = (row: Row) => {
    // Retiring or restoring an agent checklist item changes the total every
    // agent is measured against, so someone one item short can tip over to
    // complete and the office gets their completion email. Worth a confirm.
    if (list === 'items') {
      const warning = row.is_active
        ? `Retire "${row.label}"?\n\nIt disappears from every agent's checklist and the total drops by one, so an agent who was one item short will show as complete. Ticks already recorded are kept and come back if you restore it.${
            row.item_key === 'mls_setup'
              ? '\n\nThis item also carries the MLS join and transfer walkthrough. Retiring it removes that from the checklist entirely.'
              : ''
          }`
        : `Restore "${row.label}"?\n\nIt returns to every agent's checklist and the total goes up by one, so agents currently showing complete will show one item outstanding.`
      if (!confirm(warning)) return
    }
    return send(
      'PUT',
      { list, id: row.id, is_active: !row.is_active },
      row.is_active ? 'Item retired' : 'Item restored'
    )
  }

  const startEdit = (row: Row) => {
    setDraft({
      id: row.id,
      label: row.label,
      description: row.description || '',
      section: row.section || '',
      section_title: row.section_title || '',
      item_key: row.item_key || '',
      priority: row.priority || 'normal',
      link_text: row.link_text || '',
      link_url: row.link_url || '',
      second_link_text: row.second_link_text || '',
      second_link_url: row.second_link_url || '',
      agent_variant: row.agent_variant || 'standard',
    })
  }

  const startNew = () => {
    setDraft({ ...EMPTY_DRAFT, agent_variant: variant })
  }

  const saveDraft = async () => {
    if (!draft) return

    let section = draft.section
    let sectionTitle = draft.section_title

    // Sections are the fixed set the agent page already groups by. An item is
    // filed into one of them, never into a new one: a heading invented here
    // would render as a second section on the agent checklist, and two sections
    // can end up with the same heading under different keys.
    if (list === 'items') {
      const match = sections.find(s => s.section === section)
      if (!match) {
        setError('Pick a section')
        return
      }
      sectionTitle = match.section_title
    }

    const payload: any = {
      list,
      label: draft.label,
      description: draft.description,
    }
    if (draft.id) payload.id = draft.id

    if (list === 'items') {
      payload.section = section
      payload.section_title = sectionTitle
      payload.priority = draft.priority
      payload.link_text = draft.link_text
      payload.link_url = draft.link_url
      payload.second_link_text = draft.second_link_text
      payload.second_link_url = draft.second_link_url
      if (!draft.id) payload.item_key = draft.item_key
    } else if (!draft.id) {
      payload.agent_variant = draft.agent_variant
    }

    const ok = await send(
      draft.id ? 'PUT' : 'POST',
      payload,
      draft.id ? 'Changes saved' : 'Item added'
    )
    if (ok) setDraft(null)
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/settings"
          className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="page-title">ONBOARDING CHECKLIST</h1>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Manage the checklist agents work through and the office task list
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={12} className="text-red-400" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-600 shrink-0" />
          <p className="text-xs text-green-700">{successMsg}</p>
        </div>
      )}

      <div className="mb-4">
        <p className="text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mb-2 px-1">
          List
        </p>
        <div className="flex gap-0.5">
          {(['items', 'tasks'] as ListName[]).map(l => (
            <button
              key={l}
              onClick={() => {
                setList(l)
                setDraft(null)
              }}
              className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                list === l
                  ? 'bg-luxury-accent/10 text-luxury-accent font-semibold'
                  : 'text-luxury-gray-2 hover:bg-luxury-light'
              }`}
            >
              {LIST_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {list === 'tasks' && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mb-2 px-1">
            Agent Type
          </p>
          <div className="flex gap-0.5">
            {['standard', 'referral'].map(v => (
              <button
                key={v}
                onClick={() => {
                  setVariant(v)
                  setDraft(null)
                }}
                className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                  variant === v
                    ? 'bg-luxury-accent/10 text-luxury-accent font-semibold'
                    : 'text-luxury-gray-2 hover:bg-luxury-light'
                }`}
              >
                {v === 'standard' ? 'Standard' : 'Referral'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="container-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-title">{LIST_LABELS[list]}</p>
            <p className="text-[10px] text-luxury-gray-3 mt-0.5">
              {activeVisible.length} active, {visible.length - activeVisible.length} retired
            </p>
          </div>
          {canManage && !draft && (
            <button onClick={startNew} className="btn btn-primary text-xs">
              <Plus size={12} className="inline mr-1" />
              Add Item
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-luxury-gray-3">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-luxury-gray-3">No items yet.</p>
        ) : (
          <div className="space-y-1">
            {visible.map(row => {
              const activeIndex = activeVisible.findIndex(r => r.id === row.id)
              const isFirst = activeIndex === 0
              const isLast = activeIndex === activeVisible.length - 1
              return (
                <div
                  key={row.id}
                  className={`flex items-start gap-3 p-2.5 rounded border border-luxury-gray-5 ${
                    row.is_active ? '' : 'opacity-50'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <button
                      onClick={() => move(row, 'up')}
                      disabled={!canManage || !row.is_active || isFirst || busy === row.id}
                      className="text-luxury-gray-3 hover:text-luxury-gray-1 disabled:opacity-30 transition-colors"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => move(row, 'down')}
                      disabled={!canManage || !row.is_active || isLast || busy === row.id}
                      className="text-luxury-gray-3 hover:text-luxury-gray-1 disabled:opacity-30 transition-colors"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  <span className="text-xs text-luxury-gray-3 pt-1 w-6 shrink-0">
                    {row.is_active ? row.display_order : ''}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-luxury-gray-1">{row.label}</span>
                      {row.priority === 'high' && (
                        <span className="badge badge-error">Priority</span>
                      )}
                      {!row.is_active && <span className="badge badge-neutral">Retired</span>}
                    </div>
                    {row.description && (
                      <p className="text-xs text-luxury-gray-3 mt-0.5">{row.description}</p>
                    )}
                    {list === 'items' && (
                      <p className="text-[10px] text-luxury-gray-3 mt-0.5">
                        {row.section_title} · {row.item_key}
                      </p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(row)}
                        disabled={busy === row.id}
                        className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={busy === row.id}
                        className="btn btn-secondary text-xs"
                      >
                        {row.is_active ? 'Retire' : 'Restore'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {draft && (
        <div className="container-card mt-4">
          <p className="section-title mb-4">{draft.id ? 'Edit Item' : 'Add Item'}</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-luxury-gray-3 mb-1.5">Label</label>
              <input
                className="input-luxury w-full"
                value={draft.label}
                onChange={e => setDraft({ ...draft, label: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs text-luxury-gray-3 mb-1.5">Description</label>
              <input
                className="input-luxury w-full"
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            {list === 'items' && (
              <>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Section</label>
                  <select
                    className="input-luxury w-full"
                    value={draft.section}
                    onChange={e => setDraft({ ...draft, section: e.target.value })}
                  >
                    <option value="">Select a section</option>
                    {sections.map(s => (
                      <option key={s.section} value={s.section}>
                        {s.section_title}
                      </option>
                    ))}
                  </select>
                </div>

                {!draft.id && (
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Item Key</label>
                    <input
                      className="input-luxury w-full"
                      value={draft.item_key}
                      onChange={e => setDraft({ ...draft, item_key: e.target.value })}
                    />
                    <p className="text-[10px] text-luxury-gray-3 mt-1">
                      Lowercase with underscores, unique, and permanent. The app uses this to find
                      specific items, so it cannot be changed later.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Priority</label>
                  <select
                    className="input-luxury w-full"
                    value={draft.priority}
                    onChange={e => setDraft({ ...draft, priority: e.target.value })}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High, shows a Priority badge</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Link Text</label>
                    <input
                      className="input-luxury w-full"
                      value={draft.link_text}
                      onChange={e => setDraft({ ...draft, link_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Link URL</label>
                    <input
                      className="input-luxury w-full"
                      value={draft.link_url}
                      onChange={e => setDraft({ ...draft, link_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">
                      Second Link Text
                    </label>
                    <input
                      className="input-luxury w-full"
                      value={draft.second_link_text}
                      onChange={e => setDraft({ ...draft, second_link_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">
                      Second Link URL
                    </label>
                    <input
                      className="input-luxury w-full"
                      value={draft.second_link_url}
                      onChange={e => setDraft({ ...draft, second_link_url: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {list === 'tasks' && !draft.id && (
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-1.5">Agent Type</label>
                <select
                  className="input-luxury w-full"
                  value={draft.agent_variant}
                  onChange={e => setDraft({ ...draft, agent_variant: e.target.value })}
                >
                  <option value="standard">Standard</option>
                  <option value="referral">Referral</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={saveDraft}
              disabled={busy !== null}
              className="btn btn-primary text-xs"
            >
              {draft.id ? 'Save Changes' : 'Add Item'}
            </button>
            <button onClick={() => setDraft(null)} className="btn btn-secondary text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
