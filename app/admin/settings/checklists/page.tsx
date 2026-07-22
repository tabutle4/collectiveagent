'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Circle,
} from 'lucide-react'

interface ChecklistTemplate {
  id: string
  slug: string
  name: string
}

interface ChecklistItem {
  id: string
  checklist_template_id: string
  section: string | null
  label: string
  description: string | null
  display_order: number
  is_active: boolean
}

interface EditingItem {
  id?: string
  label: string
  section: string
  description: string
  display_order: number
}

// Friendly labels for the two editable checklists. The stored template names
// ("Commission Check Processing" / "CDA Checklist") differ from how the app
// refers to them, so the selector shows these instead.
const TEMPLATE_LABELS: Record<string, string> = {
  payouts: 'Lease Payouts',
  cda: 'Sale CDA',
}

export default function ChecklistsPage() {
  const { user, hasPermission } = useAuth()
  const router = useRouter()
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>('payouts')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null) // null = new
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (user && !hasPermission('can_manage_checklists')) {
      router.replace('/admin/settings')
    }
  }, [user, hasPermission, router])

  useEffect(() => {
    load(selectedSlug)
  }, [selectedSlug])

  const load = async (slug: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/checklist-items?template=${slug}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplates(data.templates || [])
      setItems(data.items || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedItems = [...items].sort((a, b) => a.display_order - b.display_order)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const selectTemplate = (slug: string) => {
    if (slug === selectedSlug) return
    cancelEdit()
    setDeleteConfirmId(null)
    setSelectedSlug(slug)
  }

  const startAdd = () => {
    setEditingItemId(null)
    setEditingItem({
      label: '',
      section: '',
      description: '',
      display_order: selectedItems.length,
    })
  }

  const startEdit = (item: ChecklistItem) => {
    setEditingItemId(item.id)
    setEditingItem({
      label: item.label,
      section: item.section || '',
      description: item.description || '',
      display_order: item.display_order,
    })
  }

  const cancelEdit = () => {
    setEditingItem(null)
    setEditingItemId(null)
  }

  const saveItem = async () => {
    if (!editingItem) return
    if (!editingItem.label.trim()) {
      setError('Item label is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isNew = editingItemId === null
      const res = await fetch('/api/admin/checklist-items', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? { template: selectedSlug } : { id: editingItemId }),
          label: editingItem.label,
          section: editingItem.section,
          description: editingItem.description,
          display_order: editingItem.display_order,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (isNew) {
        setItems(prev => [...prev, data.item])
        showSuccess('Item added')
      } else {
        setItems(prev => prev.map(i => i.id === editingItemId ? data.item : i))
        showSuccess('Item updated')
      }
      cancelEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item: ChecklistItem) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/checklist-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(prev => prev.map(i => i.id === item.id ? data.item : i))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/checklist-items?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeleteConfirmId(null)
      showSuccess('Item removed')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const moveItem = async (item: ChecklistItem, direction: 'up' | 'down') => {
    const list = selectedItems
    const idx = list.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const swapItem = list[swapIdx]
    setSaving(true)
    try {
      await Promise.all([
        fetch('/api/admin/checklist-items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, display_order: swapItem.display_order }),
        }),
        fetch('/api/admin/checklist-items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: swapItem.id, display_order: item.display_order }),
        }),
      ])
      setItems(prev =>
        prev.map(i => {
          if (i.id === item.id) return { ...i, display_order: swapItem.display_order }
          if (i.id === swapItem.id) return { ...i, display_order: item.display_order }
          return i
        })
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-xs text-luxury-gray-3">Loading...</p>
      </div>
    )
  }

  const selectedLabel = TEMPLATE_LABELS[selectedSlug] || selectedSlug

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/settings"
          className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="page-title">CHECKLIST ITEMS</h1>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Manage the checklist items for each transaction type
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

      {/* Template selector */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mb-2 px-1">
          Checklist
        </p>
        <div className="flex gap-0.5">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t.slug)}
              className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                selectedSlug === t.slug
                  ? 'bg-luxury-accent/10 text-luxury-accent font-semibold'
                  : 'text-luxury-gray-2 hover:bg-luxury-light'
              }`}
            >
              {TEMPLATE_LABELS[t.slug] || t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Items for selected template */}
      <div className="container-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-title">{selectedLabel}</p>
            <p className="text-[10px] text-luxury-gray-3 mt-0.5">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''},{' '}
              {selectedItems.filter(i => i.is_active).length} active
            </p>
          </div>
          <button
            onClick={startAdd}
            disabled={!!editingItem}
            className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            <Plus size={12} /> Add Item
          </button>
        </div>

        {/* Add new item form */}
        {editingItem && editingItemId === null && (
          <div className="mb-4 p-3 bg-luxury-light border border-luxury-accent/30 rounded-lg">
            <p className="text-xs font-semibold text-luxury-gray-1 mb-3">New Item</p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Item label (e.g. Deposit Check)"
                value={editingItem.label}
                onChange={e => setEditingItem({ ...editingItem, label: e.target.value })}
                className="input-luxury w-full text-xs"
                autoFocus
              />
              <input
                type="text"
                placeholder="Section (optional)"
                value={editingItem.section}
                onChange={e => setEditingItem({ ...editingItem, section: e.target.value })}
                className="input-luxury w-full text-xs"
              />
              <textarea
                placeholder="Description or instructions (optional)"
                value={editingItem.description}
                onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                className="input-luxury w-full text-xs resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={saveItem}
                disabled={saving}
                className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
              >
                <Check size={12} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={cancelEdit} className="btn btn-secondary text-xs px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Item list */}
        {selectedItems.length === 0 && !editingItem ? (
          <div className="text-center py-8">
            <p className="text-xs text-luxury-gray-3">No items configured for this checklist.</p>
            <button onClick={startAdd} className="mt-2 text-xs text-luxury-accent hover:underline">
              Add the first item
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {selectedItems.map((item, idx) => (
              <div key={item.id}>
                {/* Edit form inline */}
                {editingItemId === item.id && editingItem ? (
                  <div className="p-3 bg-luxury-light border border-luxury-accent/30 rounded-lg">
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingItem.label}
                        onChange={e => setEditingItem({ ...editingItem, label: e.target.value })}
                        className="input-luxury w-full text-xs"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editingItem.section}
                        onChange={e => setEditingItem({ ...editingItem, section: e.target.value })}
                        className="input-luxury w-full text-xs"
                        placeholder="Section (optional)"
                      />
                      <textarea
                        value={editingItem.description}
                        onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                        className="input-luxury w-full text-xs resize-none"
                        rows={2}
                        placeholder="Description or instructions (optional)"
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={saveItem}
                        disabled={saving}
                        className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                      >
                        <Check size={12} /> {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} className="btn btn-secondary text-xs px-3 py-1.5">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`flex items-start gap-2 p-2.5 rounded-lg hover:bg-luxury-light group ${!item.is_active ? 'opacity-50' : ''}`}>
                    {/* Order buttons */}
                    <div className="flex flex-col gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveItem(item, 'up')}
                        disabled={idx === 0 || saving}
                        className="text-luxury-gray-4 hover:text-luxury-gray-2 disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <GripVertical size={12} />
                      </button>
                    </div>

                    {/* Active indicator */}
                    <button
                      onClick={() => toggleActive(item)}
                      title={item.is_active ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                      className="mt-0.5 shrink-0"
                    >
                      {item.is_active ? (
                        <CheckCircle2 size={13} className="text-luxury-accent" />
                      ) : (
                        <Circle size={13} className="text-luxury-gray-4" />
                      )}
                    </button>

                    {/* Item label + description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-luxury-gray-1 font-medium">{item.label}</p>
                      {item.section && (
                        <p className="text-[10px] text-luxury-gray-4">{item.section}</p>
                      )}
                      {item.description && (
                        <p className="text-[10px] text-luxury-gray-3 mt-0.5">{item.description}</p>
                      )}
                      {!item.is_active && (
                        <span className="text-[10px] text-luxury-gray-4 italic">inactive</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1 text-luxury-gray-3 hover:text-luxury-gray-1"
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      {deleteConfirmId === item.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-red-600">Remove?</span>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="p-1 text-red-600 hover:text-red-800"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-1 text-luxury-gray-3"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-1 text-luxury-gray-3 hover:text-red-600"
                          title="Remove"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
