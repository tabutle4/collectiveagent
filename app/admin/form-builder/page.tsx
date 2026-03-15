'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, GripVertical, Save } from 'lucide-react'

interface FormField {
  id: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'email' | 'phone' | 'number' | 'co-listing-agent' | 'intermediary-agent' | 'referral-agent'
  label: string
  placeholder?: string
  required: boolean
  options?: string[] // For select, radio
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
}

interface FormConfig {
  fields: FormField[]
  submissionType?: boolean // Show new/update question
  agentSelector?: boolean // Show agent selector
}

export default function FormBuilderPage() {
  const router = useRouter()
  const [formId, setFormId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formType, setFormType] = useState('pre-listing')
  const [notificationEmail, setNotificationEmail] = useState('')
  const [formConfig, setFormConfig] = useState<FormConfig>({
    fields: [],
    submissionType: true,
    agentSelector: true,
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const id = urlParams.get('id')
    
    if (id) {
      setFormId(id)
      loadForm(id)
    } else {
      setLoading(false)
    }
  }, [])

  const loadForm = async (id: string) => {
    try {
      const response = await fetch(`/api/forms/get?id=${id}`)
      const data = await response.json()
      
      if (data.success && data.form) {
        setFormName(data.form.name)
        setFormDescription(data.form.description || '')
        setFormType(data.form.form_type)
        setNotificationEmail(data.form.notification_email || '')
        
        // Ensure form_config is properly structured with initialized fields
        const loadedConfig = data.form.form_config || { fields: [], submissionType: true, agentSelector: true }
        const initializedFields = (loadedConfig.fields || []).map((field: any) => ({
          ...field,
          options: field.options || (field.type === 'select' || field.type === 'radio' ? [] : undefined),
          validation: field.validation || {},
        }))
        
        setFormConfig({
          ...loadedConfig,
          fields: initializedFields,
          submissionType: loadedConfig.submissionType !== undefined ? loadedConfig.submissionType : true,
          agentSelector: loadedConfig.agentSelector !== undefined ? loadedConfig.agentSelector : true,
        })
      }
    } catch (error) {
      console.error('Error loading form:', error)
    } finally {
      setLoading(false)
    }
  }

  const addField = () => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type: 'text',
      label: 'New Field',
      placeholder: '',
      required: false,
      validation: {},
    }
    setFormConfig({
      ...formConfig,
      fields: [...(formConfig.fields || []), newField],
    })
  }

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setFormConfig({
      ...formConfig,
      fields: (formConfig.fields || []).map(field => {
        if (field.id === fieldId) {
          const updated = { ...field, ...updates }
          // If changing to/from select or radio, ensure options array exists
          if ((updates.type === 'select' || updates.type === 'radio') && !updated.options) {
            updated.options = []
          }
          // If changing away from select/radio, remove options
          if (updates.type && updates.type !== 'select' && updates.type !== 'radio' && updated.options) {
            delete updated.options
          }
          return updated
        }
        return field
      }),
    })
  }

  const deleteField = (fieldId: string) => {
    setFormConfig({
      ...formConfig,
      fields: formConfig.fields.filter(field => field.id !== fieldId),
    })
  }

  const addOption = (fieldId: string) => {
    setFormConfig({
      ...formConfig,
      fields: (formConfig.fields || []).map(field =>
        field.id === fieldId
          ? { ...field, options: [...(field.options || []), 'New Option'] }
          : field
      ),
    })
  }

  const updateOption = (fieldId: string, optionIndex: number, value: string) => {
    setFormConfig({
      ...formConfig,
      fields: (formConfig.fields || []).map(field =>
        field.id === fieldId
          ? {
              ...field,
              options: (field.options || []).map((opt, idx) => idx === optionIndex ? value : opt),
            }
          : field
      ),
    })
  }

  const deleteOption = (fieldId: string, optionIndex: number) => {
    setFormConfig({
      ...formConfig,
      fields: (formConfig.fields || []).map(field =>
        field.id === fieldId
          ? {
              ...field,
              options: (field.options || []).filter((_, idx) => idx !== optionIndex),
            }
          : field
      ),
    })
  }

  const handleSave = async () => {
    if (!formName || !formType) {
      alert('Please fill in form name and type')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/forms/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formId,
          name: formName,
          description: formDescription,
          form_type: formType,
          notification_email: notificationEmail || null,
          form_config: formConfig,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Form updated successfully!')
        router.push('/admin/form-responses?tab=forms')
      } else {
        alert(`Error: ${data.error || 'Failed to update form'}`)
      }
    } catch (error) {
      console.error('Error saving form:', error)
      alert('Failed to save form. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading form...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!formId) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">No form selected</p>
            <button
              onClick={() => router.push('/admin/form-responses?tab=forms')}
              className="mt-4 px-4 py-2 text-sm rounded transition-colors btn-primary"
            >
              Back to Forms
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/form-responses?tab=forms')}
            className="flex items-center gap-2 text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Forms
          </button>
          <h1 className="text-xl font-semibold text-luxury-gray-1">Form Builder</h1>
          <p className="text-sm text-luxury-gray-2 mt-2">
            Edit form fields and questions. Changes only affect new submissions, not past responses.
          </p>
        </div>

        <div className="card-section mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Form Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input-luxury"
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Form Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="select-luxury"
                required
              >
                <option value="pre-listing">Pre-Listing</option>
                <option value="just-listed">Just Listed</option>
                <option value="compliance-request">Compliance Request</option>
                <option value="under-contract">Under Contract</option>
                <option value="transaction-update">Transaction Update</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="textarea-luxury"
                rows={3}
              />
            </div>

            <div className="border-t border-luxury-gray-5 pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-luxury-gray-1">Form Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Notification Email
                  </label>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="input-luxury"
                    placeholder="email@example.com"
                  />
                  <p className="text-xs text-luxury-gray-2 mt-1">
                    Email address to receive form submissions (optional)
                  </p>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfig.submissionType}
                      onChange={(e) => setFormConfig({ ...formConfig, submissionType: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span className="text-sm">Show "New or Update" question</span>
                  </label>
                  
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfig.agentSelector}
                      onChange={(e) => setFormConfig({ ...formConfig, agentSelector: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span className="text-sm">Show agent selector</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card-section">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-luxury-gray-1">Form Fields</h3>
            <button
              onClick={addField}
              className="px-4 py-2 text-sm rounded transition-colors btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Field
            </button>
          </div>

          <div className="space-y-4">
            {(formConfig.fields || []).map((field, index) => (
              <div key={field.id} className="border border-luxury-gray-5 rounded p-4">
                <div className="flex items-start gap-4">
                  <div className="pt-2 text-luxury-gray-2">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs mb-1 text-luxury-gray-2">Field Type</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                          className="select-luxury text-sm"
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Textarea</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Select (Dropdown)</option>
                          <option value="radio">Radio Buttons</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="co-listing-agent">Co-Listing Agent</option>
                          <option value="intermediary-agent">Intermediary Agent</option>
                          <option value="referral-agent">Referral Agent</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs mb-1 text-luxury-gray-2">Required</label>
                        <label className="flex items-center space-x-2 cursor-pointer mt-2">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(field.id, { required: e.target.checked })}
                            className="mt-0.5"
                          />
                          <span className="text-xs">Required field</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs mb-1 text-luxury-gray-2">Label</label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        className="input-luxury text-sm"
                        placeholder="Field label"
                      />
                    </div>

                    {field.type !== 'checkbox' && !field.type.includes('-agent') && (
                      <div>
                        <label className="block text-xs mb-1 text-luxury-gray-2">Placeholder</label>
                        <input
                          type="text"
                          value={field.placeholder || ''}
                          onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                          className="input-luxury text-sm"
                          placeholder="Placeholder text"
                        />
                      </div>
                    )}
                    {(field.type === 'co-listing-agent' || field.type === 'intermediary-agent' || field.type === 'referral-agent') && (
                      <div className="bg-luxury-light p-3 rounded text-xs text-luxury-gray-2">
                        This field will show a searchable dropdown of all agents in the firm (including inactive agents).
                      </div>
                    )}

                    {(field.type === 'select' || field.type === 'radio') && (
                      <div>
                        <label className="block text-xs mb-2 text-luxury-gray-2">Options</label>
                        <div className="space-y-2">
                          {(field.options || []).map((option, optIndex) => (
                            <div key={optIndex} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => updateOption(field.id, optIndex, e.target.value)}
                                className="input-luxury text-sm flex-1"
                                placeholder="Option value"
                              />
                              <button
                                onClick={() => deleteOption(field.id, optIndex)}
                                className="p-1.5 text-red-600 hover:text-red-800 transition-colors"
                                title="Delete option"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addOption(field.id)}
                            className="text-xs text-luxury-black hover:text-luxury-gray-1 transition-colors"
                          >
                            + Add Option
                          </button>
                          {(!field.options || field.options.length === 0) && (
                            <p className="text-xs text-luxury-gray-2 italic">No options added yet. Click "+ Add Option" to add options.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {(field.type === 'number' || field.type === 'text') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs mb-1 text-luxury-gray-2">Min Length/Value</label>
                          <input
                            type="number"
                            value={field.validation?.min || ''}
                            onChange={(e) => updateField(field.id, {
                              validation: { ...field.validation, min: e.target.value ? Number(e.target.value) : undefined },
                            })}
                            className="input-luxury text-sm"
                            placeholder="Min"
                          />
                        </div>
                        <div>
                          <label className="block text-xs mb-1 text-luxury-gray-2">Max Length/Value</label>
                          <input
                            type="number"
                            value={field.validation?.max || ''}
                            onChange={(e) => updateField(field.id, {
                              validation: { ...field.validation, max: e.target.value ? Number(e.target.value) : undefined },
                            })}
                            className="input-luxury text-sm"
                            placeholder="Max"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => deleteField(field.id)}
                    className="p-1.5 text-red-600 hover:text-red-800 transition-colors"
                    title="Delete field"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {formConfig.fields.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-luxury-gray-5 rounded">
                <p className="text-luxury-gray-2 mb-4">No fields added yet</p>
                <button
                  onClick={addField}
                  className="px-4 py-2 text-sm rounded transition-colors btn-primary"
                >
                  Add Your First Field
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-luxury-gray-5 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !formName}
              className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Form'}
            </button>
          </div>
        </div>

        <div className="card-section mt-6 bg-luxury-light">
          <h4 className="text-sm font-medium text-luxury-gray-1 mb-2">About Form Changes</h4>
          <ul className="text-xs text-luxury-gray-2 space-y-1 list-disc list-inside">
            <li>Changes only affect new form submissions, not past responses</li>
            <li>Past responses remain unchanged with their original data structure</li>
            <li>New submissions will use the updated form structure</li>
            <li>Deleting a field means it won't appear on new forms, but past data is preserved</li>
            <li>Adding a field means it will appear on new forms, but past submissions won't have it</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

