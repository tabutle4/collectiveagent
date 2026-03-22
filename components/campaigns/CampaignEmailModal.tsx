'use client'

import { useState, useEffect, useRef } from 'react'

interface CampaignEmailModalProps {
  campaign: any
  onClose: () => void
  onSend: (
    templateId: string | null,
    recipientFilter: string,
    customHtml?: string,
    customSubject?: string,
    individualAgentId?: string
  ) => Promise<void>
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
  const [recipientFilter, setRecipientFilter] = useState<
    'all' | 'active' | 'inactive' | 'prospect' | 'campaign_incomplete' | 'individual'
  >('all')
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
      const defaultTemplate =
        templates.find(t => t.category === 'campaign' && t.is_default && t.is_active) ||
        templates[0]
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
        const iframeDoc =
          iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document
        if (!iframeDoc || !iframeDoc.body) return

        // Make all text elements contentEditable (but not variable placeholders)
        const walker = iframeDoc.createTreeWalker(iframeDoc.body, NodeFilter.SHOW_TEXT, null)
        const textNodes: Node[] = []
        let node
        while ((node = walker.nextNode())) {
          const text = node.textContent || ''
          // Skip if text contains variable placeholders
          if (!/\{\{(\w+)\}\}/.test(text) && text.trim()) {
            textNodes.push(node)
          }
        }

        // Make body editable
        iframeDoc.body.contentEditable = 'true'
        iframeDoc.body.style.outline = 'none'

        // Track changes
        const handleInput = () => {
          setEditedPreviewHtml(iframeDoc.body.innerHTML)
        }
        iframeDoc.body.addEventListener('input', handleInput)

        return () => {
          if (iframeDoc.body) {
            iframeDoc.body.removeEventListener('input', handleInput)
          }
        }
      } catch (error) {
        console.error('Error making iframe editable:', error)
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [previewEditMode])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/email-templates?category=campaign&active_only=true')
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setTemplates(data.templates || [])

      // Set default template as selected
      const defaultTemplate = data.templates?.find((t: any) => t.is_default)
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
      const res = await fetch('/api/agents/list?status=active&licensed_only=true')
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const generatePreview = async () => {
    if (!selectedTemplate) return

    setPreviewLoading(true)

    try {
      // Generate preview using API
      const response = await fetch('/api/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          campaign_id: campaign.id,
        }),
      })

      const data = await response.json()
      if (response.ok && data.html) {
        setPreviewHtml(data.html)
        setPreviewSubject(data.subject || selectedTemplate.subject || '')
      } else {
        // Fallback - use template directly with sample data
        let html = selectedTemplate.html_content || ''
        let subject = selectedTemplate.subject || ''

        const sampleData: Record<string, string> = {
          first_name: 'John',
          last_name: 'Doe',
          campaign_link: `${window.location.origin}/campaign/${campaign.slug}?token=SAMPLE`,
          deadline: campaign.deadline
            ? new Date(campaign.deadline).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : '',
          campaign_name: campaign.name || '',
        }

        Object.entries(sampleData).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
          html = html.replace(regex, value)
          subject = subject.replace(regex, value)
        })

        setPreviewHtml(html)
        setPreviewSubject(subject)
      }
    } catch (error) {
      console.error('Error generating preview:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSend = async () => {
    if (recipientFilter === 'individual' && !individualAgentId) {
      alert('Please select an agent to send to')
      return
    }

    setSending(true)
    try {
      await onSend(
        selectedTemplateId,
        recipientFilter,
        previewEditMode ? editedPreviewHtml : undefined,
        previewEditMode ? editedPreviewSubject : undefined,
        recipientFilter === 'individual' ? individualAgentId : undefined
      )
      onClose()
    } catch (error) {
      console.error('Error sending emails:', error)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <p className="text-luxury-gray-2">Loading templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-luxury-gray-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-medium">Send Campaign Emails</h3>
            <button
              onClick={onClose}
              className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left sidebar - Settings */}
          <div className="w-80 border-r border-luxury-gray-5 p-6 overflow-y-auto">
            <div className="space-y-6">
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Email Template</label>
                <select
                  value={selectedTemplateId || ''}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="input-luxury w-full"
                >
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.is_default ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Send To</label>
                <select
                  value={recipientFilter}
                  onChange={e => setRecipientFilter(e.target.value as any)}
                  className="input-luxury w-full"
                >
                  <option value="all">All Active Licensed Agents</option>
                  <option value="campaign_incomplete">
                    Agents Who Haven't Completed Campaign
                  </option>
                  <option value="individual">Individual Agent</option>
                </select>
              </div>

              {/* Individual Agent Selection */}
              {recipientFilter === 'individual' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Select Agent</label>
                  {loadingAgents ? (
                    <p className="text-sm text-luxury-gray-2">Loading agents...</p>
                  ) : (
                    <select
                      value={individualAgentId}
                      onChange={e => setIndividualAgentId(e.target.value)}
                      className="input-luxury w-full"
                    >
                      <option value="">-- Select Agent --</option>
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.preferred_first_name || agent.first_name}{' '}
                          {agent.preferred_last_name || agent.last_name} ({agent.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Edit Mode Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={previewEditMode}
                    onChange={e => setPreviewEditMode(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Edit email before sending</span>
                </label>
                <p className="text-xs text-luxury-gray-2 mt-1">
                  Enable to customize the content for this send
                </p>
              </div>

              {/* Subject Line (editable) */}
              {previewEditMode && (
                <div>
                  <label className="block text-sm font-medium mb-2">Subject Line</label>
                  <input
                    type="text"
                    value={editedPreviewSubject}
                    onChange={e => setEditedPreviewSubject(e.target.value)}
                    className="input-luxury w-full"
                  />
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={sending || (recipientFilter === 'individual' && !individualAgentId)}
                className="w-full px-4 py-3 text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Emails'}
              </button>

              <p className="text-xs text-luxury-gray-2">
                Variables like {'{{'} first_name {'}}'}
                will be replaced with each agent's actual information
              </p>
            </div>
          </div>

          {/* Right side - Preview */}
          <div className="flex-1 p-6 bg-luxury-gray-5/30 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium">Email Preview</h4>
              {previewEditMode && (
                <span className="text-xs px-2 py-1 bg-luxury-accent text-white rounded">
                  Edit Mode
                </span>
              )}
            </div>

            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-luxury-gray-2">Generating preview...</p>
              </div>
            ) : (
              <div className="flex-1 bg-white rounded border border-luxury-gray-5 overflow-hidden">
                {/* Subject Preview */}
                <div className="p-4 border-b border-luxury-gray-5 bg-luxury-light">
                  <p className="text-xs text-luxury-gray-2 mb-1">Subject:</p>
                  <p className="text-sm font-medium">
                    {previewEditMode ? editedPreviewSubject : previewSubject}
                  </p>
                </div>

                {/* Email Body Preview */}
                <iframe
                  ref={iframeRef}
                  srcDoc={previewEditMode ? editedPreviewHtml : previewHtml}
                  className="w-full h-full border-0"
                  title="Email Preview"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}