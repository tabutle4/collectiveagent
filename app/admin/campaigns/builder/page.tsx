'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface StepConfig {
  stepNumber: number
  type: 'info' | 'profile' | 'rsvp' | 'survey'
  title: string
  content: any
}

function CampaignBuilderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = searchParams?.get('id') || undefined
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  
  // Campaign basic info
  const [campaignInfo, setCampaignInfo] = useState({
    name: '',
    slug: '',
    year: new Date().getFullYear() + 1,
    deadline: '',
    event_staff_email: '',
    is_active: true,
    email_subject: '',
    email_body: '',
  })
  
  // Steps configuration
  const [steps, setSteps] = useState<StepConfig[]>([])
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)

  useEffect(() => {
    if (campaignId) {
      fetchCampaign()
    }
  }, [campaignId])

  const fetchCampaign = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (error) throw error

      setCampaignInfo({
        name: data.name || '',
        slug: data.slug || '',
        year: data.year || new Date().getFullYear() + 1,
        deadline: data.deadline ? new Date(data.deadline).toISOString().split('T')[0] : '',
        event_staff_email: data.event_staff_email || '',
        is_active: data.is_active ?? true,
        email_subject: data.email_subject || '',
        email_body: data.email_body || '',
      })

      // Load steps config or use default
      if (data.steps_config && Array.isArray(data.steps_config) && data.steps_config.length > 0) {
        setSteps(data.steps_config)
      } else {
        // Default 4-step campaign
        setSteps([
          {
            stepNumber: 1,
            type: 'info',
            title: 'Commission Plan Selection',
            content: {
              greeting: 'Hi, {first_name}',
              sections: [
                {
                  heading: 'Important Information',
                  items: [
                    'There will be **NO fee, split, or cap increases for 2026!**',
                    'Your Independent Contractor Agreement remains in effect for an indefinite term.',
                    'You may change your commission plan annually when eligible.',
                  ]
                }
              ],
              buttonText: 'Next: Update My Profile →'
            }
          },
          {
            stepNumber: 2,
            type: 'profile',
            title: 'Update Your Profile',
            content: {
              fields: ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'personal_email', 'personal_phone', 'business_phone', 'date_of_birth', 'shirt_type', 'shirt_size', 'shipping_address_line1', 'shipping_address_line2', 'shipping_city', 'shipping_state', 'shipping_zip']
            }
          },
          {
            stepNumber: 3,
            type: 'rsvp',
            title: 'Event RSVP',
            content: {
              eventTitle: 'Annual Award Ceremony Luncheon',
              eventSubtitle: 'We Made It!',
              eventDescription: 'Join us to celebrate our entire firm\'s success this year.',
              hostedBy: 'CJE Media',
              when: 'Tuesday, December 16 at 12:00 PM',
              where: 'Rhay\'s Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077',
              rsvpBy: 'December 9, 2025',
              dressCode: 'Black Tie',
              eventFlyerUrl: '',
              commentsPrompt: 'Any dietary restrictions or special requests?',
              closingText: 'Let\'s Celebrate!'
            }
          },
          {
            stepNumber: 4,
            type: 'survey',
            title: 'Quick Feedback Survey',
            content: {
              questions: [
                {
                  id: 'q1',
                  type: 'slider',
                  label: 'On a scale of 1-10, how supported do you feel by Collective Realty Co.?',
                  required: true,
                  min: 1,
                  max: 10,
                  minLabel: 'Not supported',
                  maxLabel: 'Very supported'
                },
                {
                  id: 'q2',
                  type: 'textarea',
                  label: 'What are two specific ways we could better support you in 2026?',
                  required: false
                },
                {
                  id: 'q3',
                  type: 'radio',
                  label: 'In 2026, do you see yourself working best:',
                  required: true,
                  options: ['On a team', 'Independently', 'Not sure yet']
                }
              ]
            }
          }
        ])
      }
    } catch (err: any) {
      console.error('Error fetching campaign:', err)
      setError(err.message || 'Failed to load campaign')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      // Validate basic info
      if (!campaignInfo.name || !campaignInfo.slug || !campaignInfo.deadline) {
        setError('Please fill in campaign name, slug, and deadline')
        setSaving(false)
        return
      }

      // Validate steps
      if (steps.length === 0) {
        setError('Please add at least one step')
        setSaving(false)
        return
      }

      // Ensure step numbers are sequential
      const sortedSteps = steps.map((step, index) => ({
        ...step,
        stepNumber: index + 1
      }))

      const updateData: any = {
        name: campaignInfo.name.trim(),
        slug: campaignInfo.slug.trim(),
        year: campaignInfo.year || null,
        deadline: campaignInfo.deadline,
        event_staff_email: campaignInfo.event_staff_email?.trim() || null,
        is_active: campaignInfo.is_active,
        email_subject: campaignInfo.email_subject?.trim() || null,
        email_body: campaignInfo.email_body?.trim() || null,
        steps_config: sortedSteps,
      }

      if (campaignId) {
        // Update existing campaign
        const { error } = await supabase
          .from('campaigns')
          .update(updateData)
          .eq('id', campaignId)

        if (error) throw error
        alert('Campaign saved successfully!')
      } else {
        // Create new campaign
        // Check slug uniqueness
        let uniqueSlug = updateData.slug
        let attempt = 1
        while (attempt <= 10) {
          const { data: existing } = await supabase
            .from('campaigns')
            .select('id')
            .eq('slug', uniqueSlug)
            .maybeSingle()

          if (!existing) break
          attempt++
          uniqueSlug = `${updateData.slug}-${attempt}`
        }

        updateData.slug = uniqueSlug

        const { data, error } = await supabase
          .from('campaigns')
          .insert([updateData])
          .select()
          .single()

        if (error) throw error
        alert('Campaign created successfully!')
        router.push(`/admin/campaigns/builder/${data.id}`)
      }
    } catch (err: any) {
      console.error('Error saving campaign:', err)
      setError(err.message || 'Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

  const addStep = (type: StepConfig['type']) => {
    const newStep: StepConfig = {
      stepNumber: steps.length + 1,
      type,
      title: `Step ${steps.length + 1}`,
      content: getDefaultContentForType(type)
    }
    setSteps([...steps, newStep])
    setSelectedStepIndex(steps.length)
  }

  const getDefaultContentForType = (type: StepConfig['type']): any => {
    switch (type) {
      case 'info':
        return {
          greeting: 'Hi, {first_name}',
          sections: [{ heading: 'Information', items: ['Add your content here'] }],
          buttonText: 'Next →'
        }
      case 'profile':
        return { fields: ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name'] }
      case 'rsvp':
        return {
          eventTitle: 'Event Title',
          eventSubtitle: '',
          eventDescription: '',
          hostedBy: '',
          when: '',
          where: '',
          rsvpBy: '',
          dressCode: '',
          eventFlyerUrl: '',
          commentsPrompt: 'Any dietary restrictions or special requests?',
          closingText: ''
        }
      case 'survey':
        return { questions: [] }
      default:
        return {}
    }
  }

  const removeStep = (index: number) => {
    if (confirm('Are you sure you want to remove this step?')) {
      const newSteps = steps.filter((_, i) => i !== index).map((step, i) => ({
        ...step,
        stepNumber: i + 1
      }))
      setSteps(newSteps)
      if (selectedStepIndex === index) {
        setSelectedStepIndex(null)
      } else if (selectedStepIndex !== null && selectedStepIndex > index) {
        setSelectedStepIndex(selectedStepIndex - 1)
      }
    }
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === steps.length - 1) return

    const newSteps = [...steps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
    
    const renumbered = newSteps.map((step, i) => ({ ...step, stepNumber: i + 1 }))
    setSteps(renumbered)
    
    if (selectedStepIndex === index) {
      setSelectedStepIndex(targetIndex)
    } else if (selectedStepIndex === targetIndex) {
      setSelectedStepIndex(index)
    }
  }

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null

  return (
    <div className="min-h-0">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/campaigns"
            className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block"
          >
            ← Back to Campaigns
          </Link>
          
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold tracking-wide" >
              {campaignId ? 'Edit Campaign' : 'Create New Campaign'}
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary"
              >
                {previewMode ? 'Exit Preview' : 'Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Campaign'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
            {error}
          </div>
        )}

        {previewMode ? (
          <div className="container-card">
            <h3 className="text-lg font-medium mb-4">Campaign Preview</h3>
            <p className="text-sm text-luxury-gray-2 mb-4">
              This is how agents will see the campaign. Steps: {steps.length}
            </p>
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={index} className="border border-luxury-gray-5 p-4 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-luxury-gray-2">Step {step.stepNumber} of {steps.length}</span>
                    <span className="px-2 py-1 text-xs rounded bg-luxury-gray-5">{step.type}</span>
                  </div>
                  <h4 className="font-medium">{step.title}</h4>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Sidebar - Campaign Info & Steps List */}
            <div className="lg:col-span-1 space-y-6">
              {/* Campaign Basic Info */}
              <div className="container-card">
                <h3 className="text-lg font-medium mb-4">Campaign Info</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={campaignInfo.name}
                      onChange={(e) => {
                        setCampaignInfo({ ...campaignInfo, name: e.target.value })
                        if (!campaignId) {
                          const slug = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                          setCampaignInfo(prev => ({ ...prev, slug }))
                        }
                      }}
                      className="input-luxury"
                      placeholder="2027 Plan Selection"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Slug <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={campaignInfo.slug}
                      onChange={(e) => setCampaignInfo({ ...campaignInfo, slug: e.target.value })}
                      className="input-luxury"
                      placeholder="2027-plan-selection"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Deadline <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={campaignInfo.deadline}
                      onChange={(e) => setCampaignInfo({ ...campaignInfo, deadline: e.target.value })}
                      className="input-luxury"
                    />
                  </div>
                </div>
              </div>

              {/* Steps List */}
              <div className="container-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">Steps ({steps.length})</h3>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addStep(e.target.value as StepConfig['type'])
                          e.target.value = ''
                        }
                      }}
                      className="text-xs px-2 py-1 border border-luxury-gray-5 rounded"
                    >
                      <option value="">Add Step</option>
                      <option value="info">Info Page</option>
                      <option value="profile">Profile Update</option>
                      <option value="rsvp">RSVP</option>
                      <option value="survey">Survey</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedStepIndex(index)}
                      className={`p-3 rounded border cursor-pointer transition-colors ${
                        selectedStepIndex === index
                          ? 'border-luxury-black bg-luxury-light'
                          : 'border-luxury-gray-5 hover:border-luxury-gray-3'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">Step {step.stepNumber}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-luxury-gray-5">
                          {step.type}
                        </span>
                      </div>
                      <p className="text-xs text-luxury-gray-2 truncate">{step.title}</p>
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            moveStep(index, 'up')
                          }}
                          disabled={index === 0}
                          className="text-xs px-2 py-1 bg-white border border-luxury-gray-5 rounded hover:bg-luxury-gray-5 disabled:opacity-50"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            moveStep(index, 'down')
                          }}
                          disabled={index === steps.length - 1}
                          className="text-xs px-2 py-1 bg-white border border-luxury-gray-5 rounded hover:bg-luxury-gray-5 disabled:opacity-50"
                        >
                          ↓
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeStep(index)
                          }}
                          className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side - Step Editor */}
            <div className="lg:col-span-2">
              {selectedStep ? (
                <StepEditor
                  step={selectedStep}
                  onChange={(updatedStep) => {
                    const newSteps = [...steps]
                    newSteps[selectedStepIndex!] = updatedStep
                    setSteps(newSteps)
                  }}
                />
              ) : (
                <div className="container-card text-center py-12">
                  <p className="text-luxury-gray-2">Select a step to edit, or add a new step</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Step Editor Component
function StepEditor({ step, onChange }: { step: StepConfig; onChange: (step: StepConfig) => void }) {
  const updateContent = (updates: any) => {
    onChange({
      ...step,
      content: { ...step.content, ...updates }
    })
  }

  const updateTitle = (title: string) => {
    onChange({ ...step, title })
  }

  switch (step.type) {
    case 'info':
      return <InfoStepEditor step={step} onChange={onChange} />
    case 'profile':
      return <ProfileStepEditor step={step} onChange={onChange} />
    case 'rsvp':
      return <RsvpStepEditor step={step} onChange={onChange} />
    case 'survey':
      return <SurveyStepEditor step={step} onChange={onChange} />
    default:
      return <div>Unknown step type</div>
  }
}

// Info Step Editor
function InfoStepEditor({ step, onChange }: { step: StepConfig; onChange: (step: StepConfig) => void }) {
  const content = step.content || { greeting: '', sections: [], buttonText: '' }

  const updateTitle = (title: string) => {
    onChange({ ...step, title })
  }

  const updateContent = (updates: any) => {
    onChange({
      ...step,
      content: { ...content, ...updates }
    })
  }

  const addSection = () => {
    const sections = content.sections || []
    updateContent({
      sections: [...sections, { heading: 'New Section', items: [''] }]
    })
  }

  const updateSection = (index: number, updates: any) => {
    const sections = [...(content.sections || [])]
    sections[index] = { ...sections[index], ...updates }
    updateContent({ sections })
  }

  const removeSection = (index: number) => {
    const sections = content.sections?.filter((_: any, i: number) => i !== index) || []
    updateContent({ sections })
  }

  const addItem = (sectionIndex: number) => {
    const sections = [...(content.sections || [])]
    sections[sectionIndex].items = [...(sections[sectionIndex].items || []), '']
    updateContent({ sections })
  }

  const updateItem = (sectionIndex: number, itemIndex: number, value: string) => {
    const sections = [...(content.sections || [])]
    sections[sectionIndex].items[itemIndex] = value
    updateContent({ sections })
  }

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const sections = [...(content.sections || [])]
    sections[sectionIndex].items = sections[sectionIndex].items.filter((_: any, i: number) => i !== itemIndex)
    updateContent({ sections })
  }

  return (
    <div className="container-card">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Step Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="input-luxury"
          placeholder="Commission Plan Selection"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Greeting</label>
        <input
          type="text"
          value={content.greeting || ''}
          onChange={(e) => updateContent({ greeting: e.target.value })}
          className="input-luxury"
          placeholder="Hi, {first_name}"
        />
        <p className="text-xs text-luxury-gray-2 mt-1">Use {'{first_name}'} for personalization</p>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Information Sections</label>
          <button
            onClick={addSection}
            className="text-xs px-2 py-1 bg-luxury-black text-white rounded hover:opacity-90"
          >
            + Add Section
          </button>
        </div>
        
        <div className="space-y-4">
          {content.sections?.map((section: any, sectionIndex: number) => (
            <div key={sectionIndex} className="border border-luxury-gray-5 p-4 rounded">
              <div className="flex items-center justify-between mb-3">
                <input
                  type="text"
                  value={section.heading || ''}
                  onChange={(e) => updateSection(sectionIndex, { heading: e.target.value })}
                  className="input-luxury flex-1"
                  placeholder="Section Heading"
                />
                <button
                  onClick={() => removeSection(sectionIndex)}
                  className="ml-2 text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
              
              <div className="space-y-2">
                {section.items?.map((item: string, itemIndex: number) => (
                  <div key={itemIndex} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateItem(sectionIndex, itemIndex, e.target.value)}
                      className="input-luxury flex-1"
                      placeholder="Bullet point (use **text** for bold)"
                    />
                    <button
                      onClick={() => removeItem(sectionIndex, itemIndex)}
                      className="text-xs px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(sectionIndex)}
                  className="text-xs px-2 py-1 bg-white border border-luxury-gray-5 rounded hover:bg-luxury-gray-5"
                >
                  + Add Item
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Button Text</label>
        <input
          type="text"
          value={content.buttonText || ''}
          onChange={(e) => updateContent({ buttonText: e.target.value })}
          className="input-luxury"
          placeholder="Next: Update My Profile →"
        />
      </div>
    </div>
  )
}

// Profile Step Editor
function ProfileStepEditor({ step, onChange }: { step: StepConfig; onChange: (step: StepConfig) => void }) {
  const content = step.content || { fields: [] }
  const availableFields = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'preferred_first_name', label: 'Preferred First Name' },
    { key: 'preferred_last_name', label: 'Preferred Last Name' },
    { key: 'personal_email', label: 'Personal Email' },
    { key: 'office_email', label: 'Office Email' },
    { key: 'personal_phone', label: 'Personal Phone' },
    { key: 'business_phone', label: 'Business Phone' },
    { key: 'date_of_birth', label: 'Date of Birth' },
    { key: 'birth_month', label: 'Birth Month' },
    { key: 'shirt_type', label: 'Shirt Type' },
    { key: 'shirt_size', label: 'Shirt Size' },
    { key: 'shipping_address_line1', label: 'Shipping Address Line 1' },
    { key: 'shipping_address_line2', label: 'Shipping Address Line 2' },
    { key: 'shipping_city', label: 'Shipping City' },
    { key: 'shipping_state', label: 'Shipping State' },
    { key: 'shipping_zip', label: 'Shipping ZIP' },
    { key: 'instagram_handle', label: 'Instagram Handle' },
    { key: 'tiktok_handle', label: 'TikTok Handle' },
    { key: 'threads_handle', label: 'Threads Handle' },
    { key: 'youtube_url', label: 'YouTube URL' },
    { key: 'linkedin_url', label: 'LinkedIn URL' },
    { key: 'facebook_url', label: 'Facebook URL' },
    { key: 'commission_plan', label: 'Commission Plan' },
    { key: 'commission_plan_other', label: 'Commission Plan Other' },
  ]

  const toggleField = (fieldKey: string) => {
    const fields = content.fields || []
    if (fields.includes(fieldKey)) {
      updateContent({ fields: fields.filter((f: string) => f !== fieldKey) })
    } else {
      updateContent({ fields: [...fields, fieldKey] })
    }
  }

  const updateContent = (updates: any) => {
    onChange({
      ...step,
      content: { ...content, ...updates }
    })
  }

  const updateTitle = (title: string) => {
    onChange({ ...step, title })
  }

  return (
    <div className="container-card">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Step Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="input-luxury"
          placeholder="Update Your Profile"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Select Fields to Show</label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {availableFields.map((field) => (
            <label key={field.key} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={content.fields?.includes(field.key)}
                onChange={() => toggleField(field.key)}
                className="w-4 h-4"
              />
              <span className="text-sm">{field.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// RSVP Step Editor
function RsvpStepEditor({ step, onChange }: { step: StepConfig; onChange: (step: StepConfig) => void }) {
  const content = step.content || {}

  const updateContent = (updates: any) => {
    onChange({
      ...step,
      content: { ...content, ...updates }
    })
  }

  const updateTitle = (title: string) => {
    onChange({ ...step, title })
  }

  return (
    <div className="container-card">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Step Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="input-luxury"
          placeholder="Event RSVP"
        />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Event Title</label>
          <input
            type="text"
            value={content.eventTitle || ''}
            onChange={(e) => updateContent({ eventTitle: e.target.value })}
            className="input-luxury"
            placeholder="Annual Award Ceremony Luncheon"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Event Subtitle</label>
          <input
            type="text"
            value={content.eventSubtitle || ''}
            onChange={(e) => updateContent({ eventSubtitle: e.target.value })}
            className="input-luxury"
            placeholder="We Made It!"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Event Description</label>
          <textarea
            value={content.eventDescription || ''}
            onChange={(e) => updateContent({ eventDescription: e.target.value })}
            className="textarea-luxury"
            rows={3}
            placeholder="Join us to celebrate our entire firm's success this year."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Hosted By</label>
          <input
            type="text"
            value={content.hostedBy || ''}
            onChange={(e) => updateContent({ hostedBy: e.target.value })}
            className="input-luxury"
            placeholder="CJE Media"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">When</label>
          <input
            type="text"
            value={content.when || ''}
            onChange={(e) => updateContent({ when: e.target.value })}
            className="input-luxury"
            placeholder="Tuesday, December 16 at 12:00 PM"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Where</label>
          <input
            type="text"
            value={content.where || ''}
            onChange={(e) => updateContent({ where: e.target.value })}
            className="input-luxury"
            placeholder="Rhay's Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">RSVP By</label>
          <input
            type="text"
            value={content.rsvpBy || ''}
            onChange={(e) => updateContent({ rsvpBy: e.target.value })}
            className="input-luxury"
            placeholder="December 9, 2025"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Dress Code</label>
          <input
            type="text"
            value={content.dressCode || ''}
            onChange={(e) => updateContent({ dressCode: e.target.value })}
            className="input-luxury"
            placeholder="Black Tie"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Event Flyer URL (Optional)</label>
          <input
            type="url"
            value={content.eventFlyerUrl || ''}
            onChange={(e) => updateContent({ eventFlyerUrl: e.target.value })}
            className="input-luxury"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Comments Prompt</label>
          <input
            type="text"
            value={content.commentsPrompt || ''}
            onChange={(e) => updateContent({ commentsPrompt: e.target.value })}
            className="input-luxury"
            placeholder="Any dietary restrictions or special requests?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Closing Text</label>
          <input
            type="text"
            value={content.closingText || ''}
            onChange={(e) => updateContent({ closingText: e.target.value })}
            className="input-luxury"
            placeholder="Let's Celebrate!"
          />
        </div>
      </div>
    </div>
  )
}

// Survey Step Editor
function SurveyStepEditor({ step, onChange }: { step: StepConfig; onChange: (step: StepConfig) => void }) {
  const content = step.content || { questions: [] }

  const updateContent = (updates: any) => {
    onChange({
      ...step,
      content: { ...content, ...updates }
    })
  }

  const updateTitle = (title: string) => {
    onChange({ ...step, title })
  }

  const addQuestion = () => {
    const questions = content.questions || []
    updateContent({
      questions: [...questions, {
        id: `q${Date.now()}`,
        type: 'textarea',
        label: '',
        required: false
      }]
    })
  }

  const updateQuestion = (index: number, updates: any) => {
    const questions = [...(content.questions || [])]
    questions[index] = { ...questions[index], ...updates }
    updateContent({ questions })
  }

  const removeQuestion = (index: number) => {
    const questions = content.questions?.filter((_: any, i: number) => i !== index) || []
    updateContent({ questions })
  }

  return (
    <div className="container-card">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Step Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="input-luxury"
          placeholder="Quick Feedback Survey"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium">Survey Questions</label>
          <button
            onClick={addQuestion}
            className="text-xs px-2 py-1 bg-luxury-black text-white rounded hover:opacity-90"
          >
            + Add Question
          </button>
        </div>

        <div className="space-y-4">
          {content.questions?.map((question: any, index: number) => (
            <div key={index} className="border border-luxury-gray-5 p-4 rounded">
              <div className="flex items-center justify-between mb-3">
                <select
                  value={question.type || 'textarea'}
                  onChange={(e) => updateQuestion(index, { type: e.target.value })}
                  className="text-xs px-2 py-1 border border-luxury-gray-5 rounded"
                >
                  <option value="textarea">Text Area</option>
                  <option value="slider">Slider</option>
                  <option value="radio">Radio Buttons</option>
                  <option value="checkbox">Checkboxes</option>
                </select>
                <button
                  onClick={() => removeQuestion(index)}
                  className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100"
                >
                  Remove
                </button>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium mb-1">Question Label</label>
                <input
                  type="text"
                  value={question.label || ''}
                  onChange={(e) => updateQuestion(index, { label: e.target.value })}
                  className="input-luxury"
                  placeholder="Enter your question"
                />
              </div>

              <div className="mb-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={question.required || false}
                    onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-xs">Required</span>
                </label>
              </div>

              {question.type === 'slider' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Min Value</label>
                    <input
                      type="number"
                      value={question.min || 1}
                      onChange={(e) => updateQuestion(index, { min: parseInt(e.target.value) })}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Max Value</label>
                    <input
                      type="number"
                      value={question.max || 10}
                      onChange={(e) => updateQuestion(index, { max: parseInt(e.target.value) })}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Min Label</label>
                    <input
                      type="text"
                      value={question.minLabel || ''}
                      onChange={(e) => updateQuestion(index, { minLabel: e.target.value })}
                      className="input-luxury"
                      placeholder="Not supported"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Max Label</label>
                    <input
                      type="text"
                      value={question.maxLabel || ''}
                      onChange={(e) => updateQuestion(index, { maxLabel: e.target.value })}
                      className="input-luxury"
                      placeholder="Very supported"
                    />
                  </div>
                </div>
              )}

              {(question.type === 'radio' || question.type === 'checkbox') && (
                <div>
                  <label className="block text-xs font-medium mb-2">Options (one per line)</label>
                  <textarea
                    value={question.options?.join('\n') || ''}
                    onChange={(e) => {
                      const options = e.target.value.split('\n').filter(o => o.trim())
                      updateQuestion(index, { options })
                    }}
                    className="textarea-luxury"
                    rows={4}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CampaignBuilderPage() {
  return (
    <Suspense fallback={<div className="min-h-0 flex items-center justify-center">Loading...</div>}>
      <CampaignBuilderContent />
    </Suspense>
  )
}

