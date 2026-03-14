'use client'

import { useState, useEffect, useRef } from 'react'

interface EmailTemplateBuilderProps {
  template?: any
  onSave: (data: any) => void | Promise<void>
}

export default function EmailTemplateBuilder({ template, onSave }: EmailTemplateBuilderProps) {
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [category, setCategory] = useState(template?.category || 'campaign')
  const [subjectLine, setSubjectLine] = useState(template?.subject_line || '')
  const [htmlContent, setHtmlContent] = useState(template?.html_content || '')
  const [variables, setVariables] = useState<string[]>(template?.variables || [])
  const [logoUrl, setLogoUrl] = useState(template?.logo_url || '/logo-white.png')
  const [isDefault, setIsDefault] = useState(template?.is_default || false)
  const [isActive, setIsActive] = useState(template?.is_active ?? true)

  // Sync state when template prop changes (for updates)
  useEffect(() => {
    if (template) {
      console.log('Syncing template state:', {
        name: template.name,
        subject_line: template.subject_line,
        has_html: !!template.html_content,
        html_length: template.html_content?.length || 0,
      })
      
      setName(template.name || '')
      setDescription(template.description || '')
      setCategory(template.category || 'campaign')
      setSubjectLine(template.subject_line || '')
      setHtmlContent(template.html_content || '')
      setVariables(template.variables || [])
      setLogoUrl(template.logo_url || '/logo-white.png')
      setIsDefault(template.is_default || false)
      setIsActive(template.is_active ?? true)
      
      console.log('State synced. Current values:', {
        name: template.name || '',
        subjectLine: template.subject_line || '',
        htmlContentLength: template.html_content?.length || 0,
      })
    }
  }, [template])
  
  // Debug: Log current state values
  useEffect(() => {
    console.log('EmailTemplateBuilder state:', {
      name: name?.substring(0, 50),
      subjectLine: subjectLine?.substring(0, 50),
      htmlContentLength: htmlContent?.length || 0,
      buttonDisabled: !name?.trim() || !subjectLine?.trim() || !htmlContent?.trim(),
    })
  }, [name, subjectLine, htmlContent])
  
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code')
  const [previewHtml, setPreviewHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [htmlEditMode, setHtmlEditMode] = useState(false)
  const [previewEditMode, setPreviewEditMode] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previousHtmlContentRef = useRef<string>('')
  const [textareaResetKey, setTextareaResetKey] = useState(0)

  // Available variables that can be inserted
  const availableVariables = [
    { name: 'first_name', label: 'First Name', description: 'Agent preferred first name' },
    { name: 'last_name', label: 'Last Name', description: 'Agent preferred last name' },
    { name: 'campaign_name', label: 'Campaign Name', description: 'Name of the campaign' },
    { name: 'campaign_link', label: 'Campaign Link', description: 'Full URL to campaign form' },
    { name: 'deadline', label: 'Deadline', description: 'Campaign deadline date' },
    { name: 'logo_url', label: 'Logo URL', description: 'URL to logo image' },
  ]

  // Extract variables from HTML content
  useEffect(() => {
    if (htmlContent) {
      const varMatches = htmlContent.match(/\{\{(\w+)\}\}/g)
      if (varMatches) {
        const extractedVars = varMatches
        .map((match: string) => match.replace(/[{}]/g, ''))
        //           .filter((v, i, arr) => arr.indexOf(v) === i)
        setVariables(extractedVars)
      }
    }
  }, [htmlContent])

  // Generate preview
  const generatePreview = async () => {
    if (!htmlContent) {
      setPreviewHtml('')
      return
    }

    try {
      // Always include logo_url in variables for preview, even if not in template's variables list
      const previewVariables = variables.includes('logo_url') 
        ? variables 
        : [...variables, 'logo_url']
      
      const response = await fetch('/api/email-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html_content: htmlContent, variables: previewVariables }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      let preview = data.preview_html

      // If preview edit mode, make non-variable text editable
      if (previewEditMode) {
        // Reset the initialization flag so script runs again
        preview = preview.replace(/window\.previewEditableInitialized = true/g, '')
        preview = makePreviewEditable(preview)
      }

      setPreviewHtml(preview)
    } catch (err: any) {
      console.error('Preview error:', err)
      setError('Failed to generate preview')
    }
  }

  // Make preview editable by injecting script into iframe
  const makePreviewEditable = (html: string): string => {
    // Inject a script that makes non-variable text editable
    const editableScript = `
      <style>
        .editable-text {
          outline: 1px dashed #C5A278 !important;
          outline-offset: 2px !important;
          min-height: 1em !important;
          display: inline-block !important;
          cursor: text !important;
        }
        .editable-text:hover {
          outline: 2px solid #C5A278 !important;
          background-color: rgba(201, 169, 97, 0.1) !important;
        }
        .editable-text:focus {
          outline: 2px solid #C5A278 !important;
          background-color: rgba(201, 169, 97, 0.15) !important;
        }
      </style>
      <script>
        (function() {
          if (window.previewEditableInitialized) return;
          window.previewEditableInitialized = true;
          
          function makeEditable() {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
              const text = node.textContent || '';
              // Skip if text contains variable placeholders
              if (!/\\{\\{\\w+\\}\\}/.test(text) && text.trim()) {
                textNodes.push(node);
              }
            }
            
            textNodes.forEach(textNode => {
              const parent = textNode.parentNode;
              if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
                const span = document.createElement('span');
                span.contentEditable = 'true';
                span.className = 'editable-text';
                span.setAttribute('data-editable', 'true');
                span.textContent = textNode.textContent;
                
                // Prevent editing variable placeholders on paste
                span.addEventListener('paste', (e) => {
                  e.preventDefault();
                  const text = (e.clipboardData || window.clipboardData).getData('text');
                  if (!/\\{\\{\\w+\\}\\}/.test(text)) {
                    span.textContent = text;
                  }
                });
                
                // Prevent inserting variables
                span.addEventListener('input', (e) => {
                  const text = span.textContent || '';
                  if (/\\{\\{\\w+\\}\\}/.test(text)) {
                    // Remove variable placeholders
                    span.textContent = text.replace(/\\{\\{\\w+\\}\\}/g, '');
                  }
                });
                
                parent.replaceChild(span, textNode);
              }
            });
          }
          
          // Wait for DOM to load
          if (document.body) {
            makeEditable();
          } else {
            document.addEventListener('DOMContentLoaded', makeEditable);
          }
        })();
      </script>
    `;
    
    // Inject style and script before closing body tag
    if (html.includes('</body>')) {
      return html.replace('</body>', editableScript + '</body>');
    }
    return html + editableScript;
  }

  // Generate preview when switching to preview tab or content changes
  useEffect(() => {
    if (activeTab === 'preview') {
      generatePreview()
    }
  }, [activeTab, htmlContent, variables, previewEditMode])

  // Reset edit modes when switching tabs
  useEffect(() => {
    if (activeTab === 'preview') {
      setHtmlEditMode(false)
    } else {
      setPreviewEditMode(false)
    }
  }, [activeTab])

  // Sync changes from preview back to HTML content
  const syncPreviewChanges = () => {
    if (typeof window === 'undefined') return
    if (!iframeRef.current) return

    try {
      const iframe = iframeRef.current
      if (!iframe.contentWindow) return

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
      if (!iframeDoc || !iframeDoc.body) return

      // Get the edited HTML from iframe
      let editedHtml = iframeDoc.body.innerHTML

      // Restore variable placeholders (they might have been replaced with sample data)
      variables.forEach(varName => {
        // Get sample value for this variable
        const sampleValue = getSampleValue(varName)
        // Replace sample values back with variable placeholders
        // Use a regex that matches the exact sample value
        const regex = new RegExp(sampleValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        editedHtml = editedHtml.replace(regex, `{{${varName}}}`)
      })

      // Replace the body content in the original HTML with the edited content
      const originalHtml = htmlContent
      
      // Extract body content from original
      const bodyMatch = originalHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        // Replace body content with edited content
        const updatedHtml = originalHtml.replace(
          /<body[^>]*>[\s\S]*<\/body>/i,
          bodyMatch[0].replace(bodyMatch[1], editedHtml)
        )
        
        // Update HTML content
        setHtmlContent(updatedHtml)
      }
    } catch (error) {
      console.error('Error syncing preview changes:', error)
      // If sync fails, warn user but don't block
      alert('Some changes from preview edit may not have synced. Please verify in HTML code view.')
    }
  }

  // Get sample value for a variable (must match preview API)
  const getSampleValue = (varName: string): string => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const samples: Record<string, string> = {
      first_name: 'John',
      last_name: 'Doe',
      campaign_name: '2026 Plan Selection',
      campaign_link: 'https://example.com/campaign/2026?token=sample-token',
      deadline: 'December 31, 2025',
      logo_url: `${baseUrl}/logo-white.png`,
    }
    return samples[varName] || ''
  }

  const insertVariable = (varName: string) => {
    const placeholder = `{{${varName}}}`
    setHtmlContent((prev: string) => prev + placeholder)  }

  // Protect variable placeholders when editing HTML or subject
  const protectVariables = (newValue: string, currentValue: string, fieldName: string): boolean => {
    // Extract all variables from the new content
    const newVarMatches = newValue.match(/\{\{(\w+)\}\}/g)
    const newVariables = newVarMatches 
      ? newVarMatches.map(m => m.replace(/[{}]/g, ''))
          .filter((v, i, arr) => arr.indexOf(v) === i)
      : []
    
    // Get existing variables from current content
    const existingVarMatches = currentValue.match(/\{\{(\w+)\}\}/g)
    const existingVariables = existingVarMatches
      ? existingVarMatches.map(m => m.replace(/[{}]/g, ''))
          .filter((v, i, arr) => arr.indexOf(v) === i)
      : []
    
    // Check if any variables were deleted
    const deletedVariables = existingVariables.filter(v => !newVariables.includes(v))
    
    if (deletedVariables.length > 0) {
      // Warn user and prevent deletion
      const confirmDelete = window.confirm(
        `Warning: You are about to delete variable placeholders from the ${fieldName}: ${deletedVariables.map(v => `{{${v}}}`).join(', ')}\n\n` +
        `These variables are used in the email template. Deleting them may cause errors.\n\n` +
        `Do you want to continue?`
      )
      
      return confirmDelete
    }
    
    return true
  }

  const handleHtmlContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const currentValue = htmlContent
    
    // Update ref to track previous value
    if (!previousHtmlContentRef.current) {
      previousHtmlContentRef.current = currentValue
    }
    
    // Check if variables are being deleted
    if (!protectVariables(newValue, currentValue, 'HTML content')) {
      // Force reset by updating the key to recreate the textarea with original value
      setTextareaResetKey(prev => prev + 1)
      return
    }
    
    // Update ref and allow the change
    previousHtmlContentRef.current = newValue
    setHtmlContent(newValue)
  }

  const handleSubjectLineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const currentValue = subjectLine
    
    // Check if variables are being deleted
    if (!protectVariables(newValue, currentValue, 'subject line')) {
      // Don't update if user cancels
      return
    }
    
    setSubjectLine(newValue)
  }

  // Update ref when htmlContent changes from outside (like when template loads or syncs)
  useEffect(() => {
    if (htmlContent) {
      previousHtmlContentRef.current = htmlContent
    }
  }, [htmlContent])

  const handleSave = async () => {
    if (!name || !subjectLine || !htmlContent) {
      setError('Name, subject line, and HTML content are required')
      return
    }

    setError('')
    setSaving(true)

    try {
      console.log('Saving template with data:', {
        name,
        description,
        category,
        subject_line: subjectLine,
        html_content: htmlContent.substring(0, 100) + '...',
        variables,
        logo_url: logoUrl,
        is_default: isDefault,
        is_active: isActive,
      })
      
      await onSave({
        name: name.trim(),
        description: description?.trim() || null,
        category,
        subject_line: subjectLine.trim(),
        html_content: htmlContent,
        variables,
        logo_url: logoUrl.trim() || '/logo-white.png',
        is_default: isDefault,
        is_active: isActive,
      })
      
      console.log('Template saved successfully')
    } catch (err: any) {
      console.error('Save error:', err)
      setError(err?.message || 'Failed to save template. Please check the console for details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {/* Template Settings */}
      <div className="card-section space-y-6">
        <h3 className="text-lg font-medium tracking-luxury">Template Settings</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-luxury"
              placeholder="Campaign Email Template"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="select-luxury"
            >
              <option value="campaign">Campaign</option>
              <option value="notification">Notification</option>
              <option value="welcome">Welcome</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-luxury"
              placeholder="Template description"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Subject Line <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subjectLine}
              onChange={handleSubjectLineChange}
              className="input-luxury"
              placeholder="Action Required: {{campaign_name}}"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Use variables like {'{{campaign_name}}'} in your subject line
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Logo URL
            </label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="input-luxury"
              placeholder="/logo-white.png"
            />
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Set as default for category</span>
            </label>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Template is active</span>
            </label>
          </div>
        </div>
      </div>

      {/* Variable Helper */}
      <div className="card-section">
        <h3 className="text-lg font-medium tracking-luxury mb-4">Available Variables</h3>
        <p className="text-sm text-luxury-gray-2 mb-4">
          Click a variable to insert it into your HTML content at the cursor position
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          {availableVariables.map((variable) => (
            <button
              key={variable.name}
              onClick={() => insertVariable(variable.name)}
              className="text-left p-3 border border-luxury-gray-5 rounded hover:bg-luxury-light transition-colors"
            >
              <div className="font-mono text-sm text-luxury-black mb-1">
                {`{{${variable.name}}}`}
              </div>
              <div className="text-xs text-luxury-gray-2">{variable.description}</div>
            </button>
          ))}
        </div>
        {variables.length > 0 && (
          <div className="mt-4 pt-4 border-t border-luxury-gray-5">
            <p className="text-sm font-medium mb-2">Variables used in template:</p>
            <div className="flex flex-wrap gap-2">
              {variables.map((varName, index) => (
                <span
                  key={`var-${index}-${varName}`}
                  className="text-xs px-2 py-1 bg-luxury-light rounded font-mono"
                >
                  {`{{${varName}}}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* HTML Editor / Preview */}
      <div className="card-section">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium tracking-luxury">Email Content</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                activeTab === 'code'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'
              }`}
            >
              HTML Code
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                activeTab === 'preview'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        {activeTab === 'code' ? (
          <div>
            {!htmlEditMode ? (
              <div className="border border-luxury-gray-5 rounded p-6 bg-luxury-light">
                <p className="text-sm text-luxury-gray-2 mb-4">
                  HTML content is protected to prevent accidental edits.
                </p>
                <button
                  type="button"
                  onClick={() => setHtmlEditMode(true)}
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary"
                >
                  Edit HTML
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-luxury-gray-2">
                    Editing HTML code. Use {'{{variable_name}}'} syntax for dynamic content
                  </p>
                  <button
                    type="button"
                    onClick={() => setHtmlEditMode(false)}
                    className="text-xs text-luxury-gray-2 hover:text-luxury-black underline"
                  >
                    Hide Editor
                  </button>
                </div>
                <textarea
                  key={`html-editor-${textareaResetKey}`}
                  value={htmlContent}
                  onChange={handleHtmlContentChange}
                  className="textarea-luxury font-mono text-sm"
                  rows={20}
                  placeholder="<!DOCTYPE html>..."
                  required
                />
              </div>
            )}
          </div>
        ) : (
          <div className="border border-luxury-gray-5 rounded p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-luxury-gray-2">
                {previewEditMode 
                  ? 'Edit mode enabled - click on text to edit (variable placeholders are protected)' 
                  : 'Preview mode - click "Edit Preview" to make text editable'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPreviewEditMode(!previewEditMode)
                  if (previewEditMode) {
                    // Sync changes from preview when exiting edit mode
                    syncPreviewChanges()
                  }
                }}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  previewEditMode
                    ? 'bg-luxury-black text-white'
                    : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'
                }`}
              >
                {previewEditMode ? 'Done Editing' : 'Edit Preview'}
              </button>
            </div>
            {previewHtml ? (
              <div className="relative">
                <iframe
                  key={previewEditMode ? 'editable' : 'preview'}
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ height: '800px', minHeight: '400px' }}
                  title="Email Preview"
                />
              </div>
            ) : (
              <div className="text-center py-12 text-luxury-gray-2">
                Generate preview...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            handleSave()
          }}
          disabled={saving || !name?.trim() || !subjectLine?.trim() || !htmlContent?.trim()}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : template ? 'Update Template' : 'Save Template'}
        </button>
        {(!name?.trim() || !subjectLine?.trim() || !htmlContent?.trim()) && (
          <p className="text-xs text-luxury-gray-3">
            {!name?.trim() && 'Name required. '}
            {!subjectLine?.trim() && 'Subject line required. '}
            {!htmlContent?.trim() && 'HTML content required.'}
          </p>
        )}
      </div>
    </div>
  )
}

