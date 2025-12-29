'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Edit, Plus, Save, X, Trash2, AlertCircle } from 'lucide-react'

interface ChecklistItem {
  id: string
  section: string
  section_title: string
  item_key: string | null
  label: string
  description: string | null
  priority: 'normal' | 'high'
  link_text: string | null
  link_url: string | null
  second_link_text: string | null
  second_link_url: string | null
  display_order: number
  is_active: boolean
}

export default function ChecklistEditorPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // Check localStorage for user (same auth method as rest of app)
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        router.push('/auth/login')
        return
      }

      const userData = JSON.parse(userStr)
      setCurrentUser(userData)

      // Check if admin
      if (!userData.roles?.includes('admin')) {
        router.push('/admin/dashboard')
        setLoading(false)
        return
      }

      // Fetch all checklist items
      const { data: allItems, error: itemsError } = await supabase
        .from('checklist_items')
        .select('*')
        .order('display_order', { ascending: true })

      if (itemsError) throw itemsError
      setItems((allItems || []) as ChecklistItem[])
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  const handleEdit = (item: ChecklistItem) => {
    setEditingItem({ ...item })
    setIsNew(false)
  }

  const handleNew = () => {
    setEditingItem({
      id: '',
      section: '',
      section_title: '',
      item_key: '',
      label: '',
      description: '',
      priority: 'normal',
      link_text: '',
      link_url: '',
      second_link_text: '',
      second_link_url: '',
      display_order: items.length + 1,
      is_active: true,
    })
    setIsNew(true)
  }

  const handleSave = async () => {
    if (!editingItem) return

    setSaving(true)
    try {
      if (isNew) {
        const { error } = await supabase.from('checklist_items').insert(editingItem)
        if (error) throw error
      } else {
        const { error } = await supabase.from('checklist_items').update(editingItem).eq('id', editingItem.id)
        if (error) throw error
      }

      setEditingItem(null)
      setIsNew(false)
      await loadData()
    } catch (error: any) {
      console.error('Error saving item:', error)
      alert('Failed to save checklist item: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this checklist item?')) return

    try {
      const { error } = await supabase.from('checklist_items').delete().eq('id', id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      console.error('Error deleting item:', error)
      alert('Failed to delete checklist item: ' + (error.message || 'Unknown error'))
    }
  }

  const updateField = (field: keyof ChecklistItem, value: any) => {
    if (!editingItem) return
    setEditingItem({ ...editingItem, [field]: value })
  }

  const groupedItems = items.reduce((acc: Record<string, ChecklistItem[]>, item) => {
    if (!acc[item.section]) {
      acc[item.section] = []
    }
    acc[item.section].push(item)
    return acc
  }, {})

  // Get unique sections from existing items
  const existingSections = Array.from(new Set(items.map((item) => item.section)))
  const existingSectionTitles = items.reduce((acc: Record<string, string>, item) => {
    if (!acc[item.section]) {
      acc[item.section] = item.section_title
    }
    return acc
  }, {})

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6" style={{ paddingTop: '104px', paddingBottom: '3rem' }}>
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!currentUser || !currentUser.roles?.includes('admin')) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6" style={{ paddingTop: '104px', paddingBottom: '3rem' }}>
          <div className="card-section">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="w-5 h-5" />
              <p>Access denied. This page is only available to administrators.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-white">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pb-8" style={{ paddingTop: '104px' }}>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-6">
            <div className="text-center sm:text-left space-y-1 sm:space-y-2 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-luxury-gray-1">Checklist Editor</h1>
              <p className="text-xs sm:text-sm md:text-base text-luxury-gray-2">Manage onboarding checklist items</p>
            </div>
            <button
              onClick={handleNew}
              className="w-full sm:w-auto px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Checklist Item
            </button>
          </div>

          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section} className="card-section mb-6 break-words">
              <h2 className="text-lg sm:text-xl mb-1">{sectionItems[0]?.section_title || section}</h2>
              <p className="text-sm text-luxury-gray-2 mb-4">{sectionItems.length} items</p>
              <div className="space-y-3">
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-luxury-gray-5 rounded-lg gap-2"
                  >
                    <div className="flex-1 w-full sm:w-auto">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-medium text-base">{item.label}</p>
                        {item.priority === 'high' && (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Priority</span>
                        )}
                        {!item.is_active && (
                          <span className="px-2 py-0.5 text-xs rounded bg-luxury-light text-luxury-gray-2">Inactive</span>
                        )}
                      </div>
                      {item.description && <p className="text-sm text-luxury-gray-2 break-words">{item.description}</p>}
                      <p className="text-xs text-luxury-gray-3 mt-1 break-words">Key: {item.item_key || 'N/A'}</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => handleEdit(item)}
                        className="px-3 py-1.5 text-xs rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 text-xs rounded transition-colors text-center bg-white border border-red-600 text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
              <h3 className="text-xl font-semibold">{isNew ? 'Add New' : 'Edit'} Checklist Item</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-luxury-gray-3 hover:text-luxury-black text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Section Key</label>
                  <select
                    value={editingItem.section}
                    onChange={(e) => {
                      updateField('section', e.target.value)
                      if (existingSectionTitles[e.target.value]) {
                        updateField('section_title', existingSectionTitles[e.target.value])
                      }
                    }}
                    className="select-luxury"
                  >
                    <option value="">Select or type new section</option>
                    <option value="systemsSetup">systemsSetup</option>
                    <option value="communication">communication</option>
                    <option value="training">training</option>
                    <option value="compliance">compliance</option>
                    <option value="clientRelations">clientRelations</option>
                    <option value="resources">resources</option>
                    {existingSections
                      .filter((s) => !['systemsSetup', 'communication', 'training', 'compliance', 'clientRelations', 'resources'].includes(s))
                      .map((section) => (
                        <option key={section} value={section}>
                          {section}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={editingItem.section}
                    onChange={(e) => updateField('section', e.target.value)}
                    placeholder="Or type custom section key"
                    className="input-luxury mt-2"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Section Title</label>
                  <select
                    value={editingItem.section_title}
                    onChange={(e) => updateField('section_title', e.target.value)}
                    className="select-luxury"
                  >
                    <option value="">Select or type new title</option>
                    <option value="Systems Setup">Systems Setup</option>
                    <option value="Communication & Setup">Communication & Setup</option>
                    <option value="Training & Development">Training & Development</option>
                    <option value="Transaction & Compliance">Transaction & Compliance</option>
                    <option value="Client Relations & Guidelines">Client Relations & Guidelines</option>
                    <option value="Resources & Support">Resources & Support</option>
                  </select>
                  <input
                    type="text"
                    value={editingItem.section_title}
                    onChange={(e) => updateField('section_title', e.target.value)}
                    placeholder="Or type custom title"
                    className="input-luxury mt-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">Item Key</label>
                <input
                  type="text"
                  value={editingItem.item_key || ''}
                  onChange={(e) => updateField('item_key', e.target.value)}
                  placeholder="e.g., outlookWeb"
                  className="input-luxury"
                />
                <p className="text-xs text-luxury-gray-3 mt-1">Unique identifier within the section (use camelCase)</p>
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">Label</label>
                <input
                  type="text"
                  value={editingItem.label}
                  onChange={(e) => updateField('label', e.target.value)}
                  placeholder="Display label for the item"
                  className="input-luxury"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">Description (Optional)</label>
                <textarea
                  value={editingItem.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Additional description text"
                  rows={2}
                  className="textarea-luxury"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Priority</label>
                  <select
                    value={editingItem.priority}
                    onChange={(e) => updateField('priority', e.target.value)}
                    className="select-luxury"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Display Order</label>
                  <input
                    type="number"
                    value={editingItem.display_order}
                    onChange={(e) => updateField('display_order', parseInt(e.target.value) || 0)}
                    className="input-luxury"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">First Link Text (Optional)</label>
                <select
                  value={editingItem.link_text || ''}
                  onChange={(e) => updateField('link_text', e.target.value || null)}
                  className="select-luxury"
                >
                  <option value="">None</option>
                  <option value="View Guide">View Guide</option>
                  <option value="View Training">View Training</option>
                  <option value="View Requirement">View Requirement</option>
                  <option value="View Documents">View Documents</option>
                  <option value="View Forms">View Forms</option>
                  <option value="View Contacts">View Contacts</option>
                  <option value="Learn More">Learn More</option>
                  <option value="Get App">Get App</option>
                  <option value="Join Group">Join Group</option>
                  <option value="iOS">iOS</option>
                  <option value="Android">Android</option>
                </select>
                <input
                  type="text"
                  value={editingItem.link_text || ''}
                  onChange={(e) => updateField('link_text', e.target.value || null)}
                  placeholder="Or type custom link text"
                  className="input-luxury mt-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">First Link URL (Optional)</label>
                <input
                  type="url"
                  value={editingItem.link_url || ''}
                  onChange={(e) => updateField('link_url', e.target.value || null)}
                  placeholder="https://..."
                  className="input-luxury"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">Second Link Text (Optional)</label>
                <select
                  value={editingItem.second_link_text || ''}
                  onChange={(e) => updateField('second_link_text', e.target.value || null)}
                  className="select-luxury"
                >
                  <option value="">None</option>
                  <option value="iOS">iOS</option>
                  <option value="Android">Android</option>
                  <option value="View Guide">View Guide</option>
                  <option value="Learn More">Learn More</option>
                </select>
                <input
                  type="text"
                  value={editingItem.second_link_text || ''}
                  onChange={(e) => updateField('second_link_text', e.target.value || null)}
                  placeholder="Or type custom link text"
                  className="input-luxury mt-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">Second Link URL (Optional)</label>
                <input
                  type="url"
                  value={editingItem.second_link_url || ''}
                  onChange={(e) => updateField('second_link_url', e.target.value || null)}
                  placeholder="https://..."
                  className="input-luxury"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active_checkbox"
                  checked={editingItem.is_active}
                  onChange={(e) => updateField('is_active', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="is_active_checkbox" className="text-sm text-luxury-gray-1">Active (show to agents)</label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-luxury-gray-5">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

