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

interface ProcessingFeeType {
  id: string
  name: string
  code: string
  is_active: boolean
  display_order: number
}

interface RequiredDoc {
  id: string
  processing_fee_type_id: string
  name: string
  description: string | null
  is_required: boolean
  display_order: number
  is_active: boolean
}

interface EditingDoc {
  id?: string
  name: string
  description: string
  is_required: boolean
  display_order: number
}

export default function RequiredDocumentsPage() {
  const { user, hasPermission } = useAuth()
  const router = useRouter()
  const [types, setTypes] = useState<ProcessingFeeType[]>([])
  const [docs, setDocs] = useState<RequiredDoc[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<EditingDoc | null>(null)
  const [editingDocId, setEditingDocId] = useState<string | null>(null) // null = new
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (user && !hasPermission('can_manage_required_documents')) {
      router.replace('/admin/settings')
    }
  }, [user, hasPermission, router])

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/required-documents')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTypes(data.types || [])
      setDocs(data.docs || [])
      if (!selectedTypeId && data.types?.length > 0) {
        setSelectedTypeId(data.types[0].id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedType = types.find(t => t.id === selectedTypeId)
  const selectedDocs = docs
    .filter(d => d.processing_fee_type_id === selectedTypeId)
    .sort((a, b) => a.display_order - b.display_order)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const startAdd = () => {
    setEditingDocId(null)
    setEditingDoc({
      name: '',
      description: '',
      is_required: true,
      display_order: selectedDocs.length,
    })
  }

  const startEdit = (doc: RequiredDoc) => {
    setEditingDocId(doc.id)
    setEditingDoc({
      name: doc.name,
      description: doc.description || '',
      is_required: doc.is_required,
      display_order: doc.display_order,
    })
  }

  const cancelEdit = () => {
    setEditingDoc(null)
    setEditingDocId(null)
  }

  const saveDoc = async () => {
    if (!editingDoc || !selectedTypeId) return
    if (!editingDoc.name.trim()) {
      setError('Document name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isNew = editingDocId === null
      const res = await fetch('/api/admin/required-documents', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? {} : { id: editingDocId }),
          processing_fee_type_id: selectedTypeId,
          name: editingDoc.name,
          description: editingDoc.description,
          is_required: editingDoc.is_required,
          display_order: editingDoc.display_order,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (isNew) {
        setDocs(prev => [...prev, data.doc])
        showSuccess('Document added')
      } else {
        setDocs(prev => prev.map(d => d.id === editingDocId ? data.doc : d))
        showSuccess('Document updated')
      }
      cancelEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleRequired = async (doc: RequiredDoc) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/required-documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, is_required: !doc.is_required }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDocs(prev => prev.map(d => d.id === doc.id ? data.doc : d))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteDoc = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/required-documents?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDocs(prev => prev.filter(d => d.id !== id))
      setDeleteConfirmId(null)
      showSuccess('Document removed')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const moveDoc = async (doc: RequiredDoc, direction: 'up' | 'down') => {
    const list = selectedDocs
    const idx = list.findIndex(d => d.id === doc.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const swapDoc = list[swapIdx]
    setSaving(true)
    try {
      await Promise.all([
        fetch('/api/admin/required-documents', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: doc.id, display_order: swapDoc.display_order }),
        }),
        fetch('/api/admin/required-documents', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: swapDoc.id, display_order: doc.display_order }),
        }),
      ])
      setDocs(prev =>
        prev.map(d => {
          if (d.id === doc.id) return { ...d, display_order: swapDoc.display_order }
          if (d.id === swapDoc.id) return { ...d, display_order: doc.display_order }
          return d
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
          <h1 className="page-title">REQUIRED DOCUMENTS</h1>
          <p className="text-xs text-luxury-gray-3 mt-0.5">
            Manage the compliance document list for each transaction type
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

      <div className="flex gap-4">
        {/* Transaction type list */}
        <div className="w-56 flex-shrink-0">
          <p className="text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mb-2 px-1">
            Transaction Type
          </p>
          <div className="space-y-0.5">
            {types.map(t => {
              const count = docs.filter(d => d.processing_fee_type_id === t.id).length
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTypeId(t.id)
                    cancelEdit()
                    setDeleteConfirmId(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedTypeId === t.id
                      ? 'bg-luxury-accent/10 text-luxury-accent font-semibold'
                      : 'text-luxury-gray-2 hover:bg-luxury-light'
                  }`}
                >
                  <span className="block truncate">{t.name.replace(' Transaction', '')}</span>
                  <span className="text-[10px] opacity-60">{count} docs</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Documents for selected type */}
        <div className="flex-1 min-w-0">
          {selectedType ? (
            <div className="container-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="section-title">{selectedType.name}</p>
                  <p className="text-[10px] text-luxury-gray-3 mt-0.5">
                    {selectedDocs.length} document{selectedDocs.length !== 1 ? 's' : ''},{' '}
                    {selectedDocs.filter(d => d.is_required).length} required
                  </p>
                </div>
                <button
                  onClick={startAdd}
                  disabled={!!editingDoc}
                  className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus size={12} /> Add Document
                </button>
              </div>

              {/* Add new doc form */}
              {editingDoc && editingDocId === null && (
                <div className="mb-4 p-3 bg-luxury-light border border-luxury-accent/30 rounded-lg">
                  <p className="text-xs font-semibold text-luxury-gray-1 mb-3">New Document</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Document name (e.g. Sales Contract)"
                      value={editingDoc.name}
                      onChange={e => setEditingDoc({ ...editingDoc, name: e.target.value })}
                      className="input-luxury w-full text-xs"
                      autoFocus
                    />
                    <textarea
                      placeholder="Description or instructions (optional)"
                      value={editingDoc.description}
                      onChange={e => setEditingDoc({ ...editingDoc, description: e.target.value })}
                      className="input-luxury w-full text-xs resize-none"
                      rows={2}
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingDoc.is_required}
                        onChange={e => setEditingDoc({ ...editingDoc, is_required: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-xs text-luxury-gray-2">Required (not optional)</span>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={saveDoc}
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

              {/* Document list */}
              {selectedDocs.length === 0 && !editingDoc ? (
                <div className="text-center py-8">
                  <p className="text-xs text-luxury-gray-3">No documents configured for this transaction type.</p>
                  <button onClick={startAdd} className="mt-2 text-xs text-luxury-accent hover:underline">
                    Add the first document
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {selectedDocs.map((doc, idx) => (
                    <div key={doc.id}>
                      {/* Edit form inline */}
                      {editingDocId === doc.id && editingDoc ? (
                        <div className="p-3 bg-luxury-light border border-luxury-accent/30 rounded-lg">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingDoc.name}
                              onChange={e => setEditingDoc({ ...editingDoc, name: e.target.value })}
                              className="input-luxury w-full text-xs"
                              autoFocus
                            />
                            <textarea
                              value={editingDoc.description}
                              onChange={e => setEditingDoc({ ...editingDoc, description: e.target.value })}
                              className="input-luxury w-full text-xs resize-none"
                              rows={2}
                              placeholder="Description or instructions (optional)"
                            />
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingDoc.is_required}
                                onChange={e => setEditingDoc({ ...editingDoc, is_required: e.target.checked })}
                                className="rounded"
                              />
                              <span className="text-xs text-luxury-gray-2">Required</span>
                            </label>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={saveDoc}
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
                        <div className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-luxury-light group">
                          {/* Order buttons */}
                          <div className="flex flex-col gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => moveDoc(doc, 'up')}
                              disabled={idx === 0 || saving}
                              className="text-luxury-gray-4 hover:text-luxury-gray-2 disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <GripVertical size={12} />
                            </button>
                          </div>

                          {/* Required indicator */}
                          <button
                            onClick={() => toggleRequired(doc)}
                            title={doc.is_required ? 'Required - click to make optional' : 'Optional - click to make required'}
                            className="mt-0.5 shrink-0"
                          >
                            {doc.is_required ? (
                              <CheckCircle2 size={13} className="text-luxury-accent" />
                            ) : (
                              <Circle size={13} className="text-luxury-gray-4" />
                            )}
                          </button>

                          {/* Doc name + description */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-luxury-gray-1 font-medium">{doc.name}</p>
                            {doc.description && (
                              <p className="text-[10px] text-luxury-gray-3 mt-0.5">{doc.description}</p>
                            )}
                            {!doc.is_required && (
                              <span className="text-[10px] text-luxury-gray-4 italic">optional</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => startEdit(doc)}
                              className="p-1 text-luxury-gray-3 hover:text-luxury-gray-1"
                              title="Edit"
                            >
                              <Pencil size={11} />
                            </button>
                            {deleteConfirmId === doc.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-red-600">Remove?</span>
                                <button
                                  onClick={() => deleteDoc(doc.id)}
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
                                onClick={() => setDeleteConfirmId(doc.id)}
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
          ) : (
            <div className="container-card text-center py-12">
              <p className="text-xs text-luxury-gray-3">Select a transaction type to manage its documents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
