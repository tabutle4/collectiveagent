'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface CampaignEmailModalProps {
  campaign: any
  onClose: () => void
  onSend: (templateId: string | null, recipientFilter: string, customHtml?: string, customSubject?: string, individualAgentId?: string) => Promise<void>
}

export default function CampaignEmailModal({ campaign, onClose, onSend }: CampaignEmailModalProps) {
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'active' | 'inactive' | 'prospect' | 'campaign_incomplete' | 'individual'>('all')
  const [individualAgentId, setIndividualAgentId] = useState<string>('')
  const [agents, setAgents] = useState<any[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [previewEditMode, setPreviewEditMode] = useState(false)
  const [editedPreviewHtml, setEditedPreviewHtml] = useState('')
  const [editedPreviewSubject, setEditedPreviewSubject] = useState('')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    fetchTemplates()
    fetchAgents()
  }, [])

  useEffect(() => {
    if (recipientFilter === 'individual') {
      fetchAgents()
    }
  }, [recipientFilter])

  useEffect(() => {
    if (templates.length === 0) return
    
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId)
      setSelectedTemplate(template || null)
    } else {
      // Load default template (or first template if no default)
      const defaultTemplate = templates.find(t => t.category === 'campaign' && t.is_default && t.is_active) || templates[0]
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id)
        setSelectedTemplate(defaultTemplate)
      }
    }
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (selectedTemplate) {
      generatePreview()
    }
  }, [selectedTemplate, selectedTemplateId])

  useEffect(() => {
    if (previewEditMode && previewHtml) {
      setEditedPreviewHtml(previewHtml)
      setEditedPreviewSubject(previewSubject)
    }
  }, [previewEditMode, previewHtml, previewSubject])

  // Make iframe content editable when in edit mode
  useEffect(() => {
    if (!previewEditMode || !iframeRef.current) return

    // Wait for iframe to load
    const timeoutId = setTimeout(() => {
      try {
        const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document
        if (!iframeDoc || !iframeDoc.body) return

        // Make all text elements contentEditable (but not variable placeholders)
        const walker = iframeDoc.createTreeWalker(
          iframeDoc.body,
          NodeFilter.SHOW_TEXT,
          null
        )
        const textNodes: Node[] = []
        let node
        while (node = walker.nextNode()) {
          const text = node.textContent || ''
          // Skip if text contains variable placeholders
          if (!/\{\{(\w+)\}\}/.test(text) && text.trim()) {
            textNodes.push(node)
          }
        }

        textNodes.forEach(textNode => {
          const parent = textNode.parentNode
          if (parent && parent instanceof Element && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
            const span = iframeDoc.createElement('span')
            span.contentEditable = 'true'
            span.style.outline = '1px dashed #C9A961'
            span.style.outlineOffset = '2px'
            span.style.cursor = 'text'
            span.textContent = textNode.textContent
            parent.replaceChild(span, textNode)
          }
        })

        // Update edited HTML when iframe content changes
        const updateHandler = () => {
          if (iframeDoc.body) {
            const htmlContent = iframeDoc.documentElement.outerHTML
            setEditedPreviewHtml(htmlContent)
          }
        }

        iframeDoc.body.addEventListener('input', updateHandler)
        iframeDoc.body.addEventListener('blur', updateHandler)

        return () => {
          iframeDoc.body?.removeEventListener('input', updateHandler)
          iframeDoc.body?.removeEventListener('blur', updateHandler)
        }
      } catch (error) {
        console.error('Error making iframe editable:', error)
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [previewEditMode]) // Only re-run when edit mode changes

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('category', 'campaign')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])

      // Set default template as selected
      const defaultTemplate = data?.find(t => t.is_default)
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id)
        setSelectedTemplate(defaultTemplate)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAgents = async () => {
    try {
      setLoadingAgents(true)
      const { data, error } = await supabase
        .from('users')
        .select('id, preferred_first_name, preferred_last_name, email, is_active')
        .contains('roles', ['agent'])
        .order('preferred_first_name', { ascending: true })
        .order('preferred_last_name', { ascending: true })

      if (error) throw error
      setAgents(data || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const generatePreview = async () => {
    if (!selectedTemplate) {
      setPreviewHtml('')
      setPreviewSubject('')
      return
    }

    setPreviewLoading(true)
    try {
      const htmlToPreview = selectedTemplate?.html_content || ''
      const subjectToPreview = selectedTemplate?.subject_line || ''

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const sampleLink = `${baseUrl}/campaign/${campaign.slug}?token=sample-token-12345`

      const variables: Record<string, string> = {
        first_name: 'John',
        last_name: 'Doe',
        campaign_name: campaign.name,
        campaign_link: sampleLink,
        deadline: new Date(campaign.deadline).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        logo_url: `${baseUrl}/logo.png`,
      }

      let preview = htmlToPreview
      let subject = subjectToPreview

      Object.keys(variables).forEach((key) => {
        const placeholder = `{{${key}}}`
        preview = preview.split(placeholder).join(variables[key])
        subject = subject.split(placeholder).join(variables[key])
      })

      setPreviewHtml(preview)
      setPreviewSubject(subject)
    } catch (error) {
      console.error('Preview error:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const getFilterLabel = () => {
    switch (recipientFilter) {
      case 'all':
        return 'all agents'
      case 'active':
        return 'active agents'
      case 'inactive':
        return 'inactive agents'
      case 'prospect':
        return 'prospects'
      case 'campaign_incomplete':
        return 'agents who haven\'t completed the campaign'
      case 'individual':
        const selectedAgent = agents.find(a => a.id === individualAgentId)
        return selectedAgent ? `individual agent: ${selectedAgent.preferred_first_name} ${selectedAgent.preferred_last_name}` : 'individual agent'
      default:
        return 'recipients'
    }
  }

  const syncPreviewChanges = () => {
    if (typeof window === 'undefined') return
    if (!iframeRef.current) return

    try {
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document
      if (!iframeDoc || !iframeDoc.body) return

      let editedHtml = iframeDoc.body.innerHTML

      // Restore variable placeholders if needed (for sync)
      const variables: Record<string, string> = {
        first_name: 'John',
        last_name: 'Doe',
        campaign_name: campaign.name,
        campaign_link: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/campaign/${campaign.slug}?token=sample-token-12345`,
        deadline: new Date(campaign.deadline).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        logo_url: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/logo.png`,
      }

      // Replace sample values back with placeholders (optional - may not be needed for custom edits)
      Object.keys(variables).forEach((key) => {
        const sampleValue = variables[key]
        const placeholder = `{{${key}}}`
        // Only replace if it's an exact match to avoid false positives
        editedHtml = editedHtml.split(sampleValue).join(placeholder)
      })

      setEditedPreviewHtml(editedHtml)

      // Get subject from any editable element (if we add subject editing)
      const subjectElement = iframeDoc.querySelector('[data-editable-subject]')
      if (subjectElement) {
        setEditedPreviewSubject(subjectElement.textContent || previewSubject)
      }
    } catch (error) {
      console.error('Error syncing preview changes:', error)
    }
  }

  const handleSend = async () => {
    if (recipientFilter === 'individual' && !individualAgentId) {
      alert('Please select an agent to send to')
      return
    }

    if (!confirm(`Send emails to ${getFilterLabel()}?`)) {
      return
    }

    setSending(true)
    try {
      // Use edited preview if in edit mode, otherwise use original template
      const customHtml = previewEditMode && editedPreviewHtml ? editedPreviewHtml : undefined
      const customSubject = previewEditMode && editedPreviewSubject ? editedPreviewSubject : undefined
      
      await onSend(
        selectedTemplateId, 
        recipientFilter, 
        customHtml, 
        customSubject,
        recipientFilter === 'individual' ? individualAgentId : undefined
      )
      onClose()
    } catch (error) {
      console.error('Send error:', error)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <p className="text-center">Loading templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-luxury-gray-5">
          <h2 className="text-xl font-light tracking-luxury">Preview & Send Campaign Email</h2>
          <button
            onClick={onClose}
            className="text-luxury-gray-2 hover:text-luxury-black text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left: Template Selector & Settings */}
            <div className="md:col-span-1 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Template
                </label>
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value || null)
                  }}
                  className="select-luxury"
                >
                  <option value="">Default Template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.is_default && '(Default)'}
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <p className="text-xs text-luxury-gray-2 mt-2">
                    Template selected: {selectedTemplate.name}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-luxury-gray-5">
                <label className="block text-sm font-medium mb-2">Send To</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="all"
                      checked={recipientFilter === 'all'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">All agents</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="active"
                      checked={recipientFilter === 'active'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Active agents</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="inactive"
                      checked={recipientFilter === 'inactive'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Inactive agents</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="prospect"
                      checked={recipientFilter === 'prospect'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Prospects</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="campaign_incomplete"
                      checked={recipientFilter === 'campaign_incomplete'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Campaign incomplete</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientFilter"
                      value="individual"
                      checked={recipientFilter === 'individual'}
                      onChange={(e) => setRecipientFilter(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Individual</span>
                  </label>
                  {recipientFilter === 'individual' && (
                    <div className="ml-6 mt-2">
                      {loadingAgents ? (
                        <p className="text-xs text-luxury-gray-3">Loading agents...</p>
                      ) : (
                        <select
                          value={individualAgentId}
                          onChange={(e) => setIndividualAgentId(e.target.value)}
                          className="select-luxury text-sm w-full"
                        >
                          <option value="">Select an agent...</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.preferred_first_name} {agent.preferred_last_name} ({agent.email}) {agent.is_active ? '' : '(Inactive)'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Preview */}
            <div className="md:col-span-2">
              <div className="border border-luxury-gray-5 rounded p-4 bg-white">
                <div className="mb-4 pb-3 border-b border-luxury-gray-5 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-luxury-gray-3 mb-1">Subject:</p>
                    {previewEditMode ? (
                      <input
                        type="text"
                        value={editedPreviewSubject}
                        onChange={(e) => setEditedPreviewSubject(e.target.value)}
                        className="input-luxury text-sm w-full"
                        placeholder="Email subject"
                      />
                    ) : (
                      <p className="text-sm font-medium">{previewSubject || 'Loading...'}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (previewEditMode) {
                        syncPreviewChanges()
                      }
                      setPreviewEditMode(!previewEditMode)
                    }}
                    className={`ml-4 text-xs px-3 py-1 rounded transition-colors ${
                      previewEditMode
                        ? 'bg-luxury-black text-white'
                        : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'
                    }`}
                  >
                    {previewEditMode ? 'Done Editing' : '✏️ Edit Preview'}
                  </button>
                </div>
                {previewLoading ? (
                  <div className="text-center py-12 text-luxury-gray-2">Generating preview...</div>
                ) : (previewEditMode ? editedPreviewHtml : previewHtml) ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={previewEditMode ? editedPreviewHtml : previewHtml}
                    className="w-full border-0"
                    style={{ height: '600px', minHeight: '400px' }}
                    title="Email Preview"
                  />
                ) : (
                  <div className="text-center py-12 text-luxury-gray-2">No template selected</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t border-luxury-gray-5">
          <button
            onClick={onClose}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !selectedTemplate}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Emails'}
          </button>
        </div>
      </div>
    </div>
  )
}

