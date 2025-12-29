(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/supabase.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "supabase",
    ()=>supabase,
    "supabaseAdmin",
    ()=>supabaseAdmin
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/module/index.js [app-client] (ecmascript) <locals>");
;
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://zuhqqtfnyjlvbpcprdhf.supabase.co"), ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1aHFxdGZueWpsdmJwY3ByZGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNTUyMjAsImV4cCI6MjA3NjgzMTIyMH0.EP5nnbIpWoOVQ7jUrjnkuEJsGAmLY1oVLpS4pnlyjj4"));
const supabaseAdmin = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.SUPABASE_SERVICE_ROLE_KEY ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://zuhqqtfnyjlvbpcprdhf.supabase.co"), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.SUPABASE_SERVICE_ROLE_KEY) : supabase;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/EmailTemplateBuilder.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EmailTemplateBuilder
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
function EmailTemplateBuilder({ template, onSave }) {
    _s();
    const [name, setName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.name || '');
    const [description, setDescription] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.description || '');
    const [category, setCategory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.category || 'campaign');
    const [subjectLine, setSubjectLine] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.subject_line || '');
    const [htmlContent, setHtmlContent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.html_content || '');
    const [variables, setVariables] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.variables || []);
    const [logoUrl, setLogoUrl] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.logo_url || '/logo-white.png');
    const [isDefault, setIsDefault] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.is_default || false);
    const [isActive, setIsActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(template?.is_active ?? true);
    // Sync state when template prop changes (for updates)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            if (template) {
                console.log('Syncing template state:', {
                    name: template.name,
                    subject_line: template.subject_line,
                    has_html: !!template.html_content,
                    html_length: template.html_content?.length || 0
                });
                setName(template.name || '');
                setDescription(template.description || '');
                setCategory(template.category || 'campaign');
                setSubjectLine(template.subject_line || '');
                setHtmlContent(template.html_content || '');
                setVariables(template.variables || []);
                setLogoUrl(template.logo_url || '/logo-white.png');
                setIsDefault(template.is_default || false);
                setIsActive(template.is_active ?? true);
                console.log('State synced. Current values:', {
                    name: template.name || '',
                    subjectLine: template.subject_line || '',
                    htmlContentLength: template.html_content?.length || 0
                });
            }
        }
    }["EmailTemplateBuilder.useEffect"], [
        template
    ]);
    // Debug: Log current state values
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            console.log('EmailTemplateBuilder state:', {
                name: name?.substring(0, 50),
                subjectLine: subjectLine?.substring(0, 50),
                htmlContentLength: htmlContent?.length || 0,
                buttonDisabled: !name?.trim() || !subjectLine?.trim() || !htmlContent?.trim()
            });
        }
    }["EmailTemplateBuilder.useEffect"], [
        name,
        subjectLine,
        htmlContent
    ]);
    const [activeTab, setActiveTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('code');
    const [previewHtml, setPreviewHtml] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [saving, setSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [htmlEditMode, setHtmlEditMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [previewEditMode, setPreviewEditMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const iframeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const previousHtmlContentRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])('');
    const [textareaResetKey, setTextareaResetKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    // Available variables that can be inserted
    const availableVariables = [
        {
            name: 'first_name',
            label: 'First Name',
            description: 'Agent preferred first name'
        },
        {
            name: 'last_name',
            label: 'Last Name',
            description: 'Agent preferred last name'
        },
        {
            name: 'campaign_name',
            label: 'Campaign Name',
            description: 'Name of the campaign'
        },
        {
            name: 'campaign_link',
            label: 'Campaign Link',
            description: 'Full URL to campaign form'
        },
        {
            name: 'deadline',
            label: 'Deadline',
            description: 'Campaign deadline date'
        },
        {
            name: 'logo_url',
            label: 'Logo URL',
            description: 'URL to logo image'
        }
    ];
    // Extract variables from HTML content
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            if (htmlContent) {
                const varMatches = htmlContent.match(/\{\{(\w+)\}\}/g);
                if (varMatches) {
                    const extractedVars = varMatches.map({
                        "EmailTemplateBuilder.useEffect.extractedVars": (match)=>match.replace(/[{}]/g, '')
                    }["EmailTemplateBuilder.useEffect.extractedVars"]);
                    //           .filter((v, i, arr) => arr.indexOf(v) === i)
                    setVariables(extractedVars);
                }
            }
        }
    }["EmailTemplateBuilder.useEffect"], [
        htmlContent
    ]);
    // Generate preview
    const generatePreview = async ()=>{
        if (!htmlContent) {
            setPreviewHtml('');
            return;
        }
        try {
            // Always include logo_url in variables for preview, even if not in template's variables list
            const previewVariables = variables.includes('logo_url') ? variables : [
                ...variables,
                'logo_url'
            ];
            const response = await fetch('/api/email-templates/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    html_content: htmlContent,
                    variables: previewVariables
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            let preview = data.preview_html;
            // If preview edit mode, make non-variable text editable
            if (previewEditMode) {
                // Reset the initialization flag so script runs again
                preview = preview.replace(/window\.previewEditableInitialized = true/g, '');
                preview = makePreviewEditable(preview);
            }
            setPreviewHtml(preview);
        } catch (err) {
            console.error('Preview error:', err);
            setError('Failed to generate preview');
        }
    };
    // Make preview editable by injecting script into iframe
    const makePreviewEditable = (html)=>{
        // Inject a script that makes non-variable text editable
        const editableScript = `
      <style>
        .editable-text {
          outline: 1px dashed #C9A961 !important;
          outline-offset: 2px !important;
          min-height: 1em !important;
          display: inline-block !important;
          cursor: text !important;
        }
        .editable-text:hover {
          outline: 2px solid #C9A961 !important;
          background-color: rgba(201, 169, 97, 0.1) !important;
        }
        .editable-text:focus {
          outline: 2px solid #C9A961 !important;
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
    };
    // Generate preview when switching to preview tab or content changes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            if (activeTab === 'preview') {
                generatePreview();
            }
        }
    }["EmailTemplateBuilder.useEffect"], [
        activeTab,
        htmlContent,
        variables,
        previewEditMode
    ]);
    // Reset edit modes when switching tabs
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            if (activeTab === 'preview') {
                setHtmlEditMode(false);
            } else {
                setPreviewEditMode(false);
            }
        }
    }["EmailTemplateBuilder.useEffect"], [
        activeTab
    ]);
    // Sync changes from preview back to HTML content
    const syncPreviewChanges = ()=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        if (!iframeRef.current) return;
        try {
            const iframe = iframeRef.current;
            if (!iframe.contentWindow) return;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!iframeDoc || !iframeDoc.body) return;
            // Get the edited HTML from iframe
            let editedHtml = iframeDoc.body.innerHTML;
            // Restore variable placeholders (they might have been replaced with sample data)
            variables.forEach((varName)=>{
                // Get sample value for this variable
                const sampleValue = getSampleValue(varName);
                // Replace sample values back with variable placeholders
                // Use a regex that matches the exact sample value
                const regex = new RegExp(sampleValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                editedHtml = editedHtml.replace(regex, `{{${varName}}}`);
            });
            // Replace the body content in the original HTML with the edited content
            const originalHtml = htmlContent;
            // Extract body content from original
            const bodyMatch = originalHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                // Replace body content with edited content
                const updatedHtml = originalHtml.replace(/<body[^>]*>[\s\S]*<\/body>/i, bodyMatch[0].replace(bodyMatch[1], editedHtml));
                // Update HTML content
                setHtmlContent(updatedHtml);
            }
        } catch (error) {
            console.error('Error syncing preview changes:', error);
            // If sync fails, warn user but don't block
            alert('Some changes from preview edit may not have synced. Please verify in HTML code view.');
        }
    };
    // Get sample value for a variable (must match preview API)
    const getSampleValue = (varName)=>{
        const baseUrl = ("TURBOPACK compile-time value", "http://localhost:3000") || 'http://localhost:3000';
        const samples = {
            first_name: 'John',
            last_name: 'Doe',
            campaign_name: '2026 Plan Selection',
            campaign_link: 'https://example.com/campaign/2026?token=sample-token',
            deadline: 'December 31, 2025',
            logo_url: `${baseUrl}/logo-white.png`
        };
        return samples[varName] || '';
    };
    const insertVariable = (varName)=>{
        const placeholder = `{{${varName}}}`;
        setHtmlContent((prev)=>prev + placeholder);
    };
    // Protect variable placeholders when editing HTML or subject
    const protectVariables = (newValue, currentValue, fieldName)=>{
        // Extract all variables from the new content
        const newVarMatches = newValue.match(/\{\{(\w+)\}\}/g);
        const newVariables = newVarMatches ? newVarMatches.map((m)=>m.replace(/[{}]/g, '')).filter((v, i, arr)=>arr.indexOf(v) === i) : [];
        // Get existing variables from current content
        const existingVarMatches = currentValue.match(/\{\{(\w+)\}\}/g);
        const existingVariables = existingVarMatches ? existingVarMatches.map((m)=>m.replace(/[{}]/g, '')).filter((v, i, arr)=>arr.indexOf(v) === i) : [];
        // Check if any variables were deleted
        const deletedVariables = existingVariables.filter((v)=>!newVariables.includes(v));
        if (deletedVariables.length > 0) {
            // Warn user and prevent deletion
            const confirmDelete = window.confirm(`Warning: You are about to delete variable placeholders from the ${fieldName}: ${deletedVariables.map((v)=>`{{${v}}}`).join(', ')}\n\n` + `These variables are used in the email template. Deleting them may cause errors.\n\n` + `Do you want to continue?`);
            return confirmDelete;
        }
        return true;
    };
    const handleHtmlContentChange = (e)=>{
        const newValue = e.target.value;
        const currentValue = htmlContent;
        // Update ref to track previous value
        if (!previousHtmlContentRef.current) {
            previousHtmlContentRef.current = currentValue;
        }
        // Check if variables are being deleted
        if (!protectVariables(newValue, currentValue, 'HTML content')) {
            // Force reset by updating the key to recreate the textarea with original value
            setTextareaResetKey((prev)=>prev + 1);
            return;
        }
        // Update ref and allow the change
        previousHtmlContentRef.current = newValue;
        setHtmlContent(newValue);
    };
    const handleSubjectLineChange = (e)=>{
        const newValue = e.target.value;
        const currentValue = subjectLine;
        // Check if variables are being deleted
        if (!protectVariables(newValue, currentValue, 'subject line')) {
            // Don't update if user cancels
            return;
        }
        setSubjectLine(newValue);
    };
    // Update ref when htmlContent changes from outside (like when template loads or syncs)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EmailTemplateBuilder.useEffect": ()=>{
            if (htmlContent) {
                previousHtmlContentRef.current = htmlContent;
            }
        }
    }["EmailTemplateBuilder.useEffect"], [
        htmlContent
    ]);
    const handleSave = async ()=>{
        if (!name || !subjectLine || !htmlContent) {
            setError('Name, subject line, and HTML content are required');
            return;
        }
        setError('');
        setSaving(true);
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
                is_active: isActive
            });
            await onSave({
                name: name.trim(),
                description: description?.trim() || null,
                category,
                subject_line: subjectLine.trim(),
                html_content: htmlContent,
                variables,
                logo_url: logoUrl.trim() || '/logo-white.png',
                is_default: isDefault,
                is_active: isActive
            });
            console.log('Template saved successfully');
        } catch (err) {
            console.error('Save error:', err);
            setError(err?.message || 'Failed to save template. Please check the console for details.');
        } finally{
            setSaving(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-6",
        children: [
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm",
                children: error
            }, void 0, false, {
                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                lineNumber: 424,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "card-section space-y-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-lg font-medium tracking-luxury",
                        children: "Template Settings"
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 431,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid md:grid-cols-2 gap-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-sm font-medium mb-2",
                                        children: [
                                            "Template Name ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 436,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 435,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: name,
                                        onChange: (e)=>setName(e.target.value),
                                        className: "input-luxury",
                                        placeholder: "Campaign Email Template",
                                        required: true
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 438,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 434,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-sm font-medium mb-2",
                                        children: "Category"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 449,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: category,
                                        onChange: (e)=>setCategory(e.target.value),
                                        className: "select-luxury",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "campaign",
                                                children: "Campaign"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 457,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "notification",
                                                children: "Notification"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 458,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "welcome",
                                                children: "Welcome"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 459,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "custom",
                                                children: "Custom"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 460,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 452,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 448,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "md:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-sm font-medium mb-2",
                                        children: "Description (Optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 465,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: description,
                                        onChange: (e)=>setDescription(e.target.value),
                                        className: "input-luxury",
                                        placeholder: "Template description"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 468,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 464,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "md:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-sm font-medium mb-2",
                                        children: [
                                            "Subject Line ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                                lineNumber: 479,
                                                columnNumber: 28
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 478,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: subjectLine,
                                        onChange: handleSubjectLineChange,
                                        className: "input-luxury",
                                        placeholder: "Action Required: {{campaign_name}}",
                                        required: true
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 481,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-luxury-gray-2 mt-1",
                                        children: [
                                            "Use variables like ",
                                            '{{campaign_name}}',
                                            " in your subject line"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 489,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 477,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "md:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-sm font-medium mb-2",
                                        children: "Logo URL"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 495,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: logoUrl,
                                        onChange: (e)=>setLogoUrl(e.target.value),
                                        className: "input-luxury",
                                        placeholder: "/logo-white.png"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 498,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 494,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center space-x-4",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "flex items-center space-x-3 cursor-pointer",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            checked: isDefault,
                                            onChange: (e)=>setIsDefault(e.target.checked),
                                            className: "w-4 h-4"
                                        }, void 0, false, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 509,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-sm font-medium",
                                            children: "Set as default for category"
                                        }, void 0, false, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 515,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 508,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 507,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center space-x-4",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "flex items-center space-x-3 cursor-pointer",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            checked: isActive,
                                            onChange: (e)=>setIsActive(e.target.checked),
                                            className: "w-4 h-4"
                                        }, void 0, false, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 521,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-sm font-medium",
                                            children: "Template is active"
                                        }, void 0, false, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 527,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 520,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 519,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 433,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                lineNumber: 430,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "card-section",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-lg font-medium tracking-luxury mb-4",
                        children: "Available Variables"
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 535,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-luxury-gray-2 mb-4",
                        children: "Click a variable to insert it into your HTML content at the cursor position"
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 536,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid md:grid-cols-2 gap-3",
                        children: availableVariables.map((variable)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>insertVariable(variable.name),
                                className: "text-left p-3 border border-luxury-gray-5 rounded hover:bg-luxury-light transition-colors",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-mono text-sm text-luxury-black mb-1",
                                        children: `{{${variable.name}}}`
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 546,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-luxury-gray-2",
                                        children: variable.description
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 549,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, variable.name, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 541,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 539,
                        columnNumber: 9
                    }, this),
                    variables.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-4 pt-4 border-t border-luxury-gray-5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm font-medium mb-2",
                                children: "Variables used in template:"
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 555,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap gap-2",
                                children: variables.map((varName, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-xs px-2 py-1 bg-luxury-light rounded font-mono",
                                        children: `{{${varName}}}`
                                    }, `var-${index}-${varName}`, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 558,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 556,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 554,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                lineNumber: 534,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "card-section",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between mb-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-lg font-medium tracking-luxury",
                                children: "Email Content"
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 573,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setActiveTab('code'),
                                        className: `px-4 py-2 text-sm rounded transition-colors ${activeTab === 'code' ? 'bg-luxury-black text-white' : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'}`,
                                        children: "HTML Code"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 575,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setActiveTab('preview'),
                                        className: `px-4 py-2 text-sm rounded transition-colors ${activeTab === 'preview' ? 'bg-luxury-black text-white' : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'}`,
                                        children: "Preview"
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 585,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 574,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 572,
                        columnNumber: 9
                    }, this),
                    activeTab === 'code' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: !htmlEditMode ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "border border-luxury-gray-5 rounded p-6 bg-luxury-light",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm text-luxury-gray-2 mb-4",
                                    children: "HTML content is protected to prevent accidental edits."
                                }, void 0, false, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 602,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setHtmlEditMode(true),
                                    className: "px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",
                                    children: "Edit HTML"
                                }, void 0, false, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 605,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                            lineNumber: 601,
                            columnNumber: 15
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between mb-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-luxury-gray-2",
                                            children: [
                                                "Editing HTML code. Use ",
                                                '{{variable_name}}',
                                                " syntax for dynamic content"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 616,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>setHtmlEditMode(false),
                                            className: "text-xs text-luxury-gray-2 hover:text-luxury-black underline",
                                            children: "Hide Editor"
                                        }, void 0, false, {
                                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                            lineNumber: 619,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 615,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                    value: htmlContent,
                                    onChange: handleHtmlContentChange,
                                    className: "textarea-luxury font-mono text-sm",
                                    rows: 20,
                                    placeholder: "<!DOCTYPE html>...",
                                    required: true
                                }, `html-editor-${textareaResetKey}`, false, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 627,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/EmailTemplateBuilder.tsx",
                            lineNumber: 614,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 599,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border border-luxury-gray-5 rounded p-4 bg-white",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between mb-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-luxury-gray-2",
                                        children: previewEditMode ? 'Edit mode enabled - click on text to edit (variable placeholders are protected)' : 'Preview mode - click "Edit Preview" to make text editable'
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 642,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>{
                                            setPreviewEditMode(!previewEditMode);
                                            if (previewEditMode) {
                                                // Sync changes from preview when exiting edit mode
                                                syncPreviewChanges();
                                            }
                                        },
                                        className: `text-xs px-3 py-1 rounded transition-colors ${previewEditMode ? 'bg-luxury-black text-white' : 'bg-luxury-light text-luxury-black hover:bg-luxury-gray-5'}`,
                                        children: previewEditMode ? 'Done Editing' : 'Edit Preview'
                                    }, void 0, false, {
                                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                        lineNumber: 647,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 641,
                                columnNumber: 13
                            }, this),
                            previewHtml ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "relative",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("iframe", {
                                    ref: iframeRef,
                                    srcDoc: previewHtml,
                                    className: "w-full border-0",
                                    style: {
                                        height: '800px',
                                        minHeight: '400px'
                                    },
                                    title: "Email Preview"
                                }, previewEditMode ? 'editable' : 'preview', false, {
                                    fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                    lineNumber: 667,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 666,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-center py-12 text-luxury-gray-2",
                                children: "Generate preview..."
                            }, void 0, false, {
                                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                                lineNumber: 677,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 640,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                lineNumber: 571,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: (e)=>{
                            e.preventDefault();
                            handleSave();
                        },
                        disabled: saving || !name?.trim() || !subjectLine?.trim() || !htmlContent?.trim(),
                        className: "px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
                        children: saving ? 'Saving...' : template ? 'Update Template' : 'Save Template'
                    }, void 0, false, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 687,
                        columnNumber: 9
                    }, this),
                    (!name?.trim() || !subjectLine?.trim() || !htmlContent?.trim()) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-luxury-gray-3",
                        children: [
                            !name?.trim() && 'Name required. ',
                            !subjectLine?.trim() && 'Subject line required. ',
                            !htmlContent?.trim() && 'HTML content required.'
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/EmailTemplateBuilder.tsx",
                        lineNumber: 699,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/EmailTemplateBuilder.tsx",
                lineNumber: 686,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/EmailTemplateBuilder.tsx",
        lineNumber: 422,
        columnNumber: 5
    }, this);
}
_s(EmailTemplateBuilder, "Fyzemipw3FzjBey+AWcERsB4QlY=");
_c = EmailTemplateBuilder;
var _c;
__turbopack_context__.k.register(_c, "EmailTemplateBuilder");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/admin/email-templates/[id]/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EditEmailTemplatePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$EmailTemplateBuilder$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/EmailTemplateBuilder.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function EditEmailTemplatePage() {
    _s();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [template, setTemplate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EditEmailTemplatePage.useEffect": ()=>{
            if (params.id) {
                fetchTemplate();
            }
        }
    }["EditEmailTemplatePage.useEffect"], [
        params.id
    ]);
    const fetchTemplate = async ()=>{
        try {
            const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["supabase"].from('email_templates').select('*').eq('id', params.id).single();
            if (error) throw error;
            setTemplate(data);
        } catch (error) {
            console.error('Error fetching template:', error);
        } finally{
            setLoading(false);
        }
    };
    const handleSave = async (templateData)=>{
        try {
            console.log('Updating template:', params.id, templateData);
            const response = await fetch(`/api/email-templates/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(templateData)
            });
            const data = await response.json();
            console.log('Update response:', {
                status: response.status,
                ok: response.ok,
                data
            });
            if (!response.ok) {
                const errorMessage = data.error || data.message || 'Failed to update template';
                console.error('Update failed:', errorMessage);
                throw new Error(errorMessage);
            }
            if (!data.template) {
                throw new Error('No template data returned from server');
            }
            // Update template state with fresh data from server
            setTemplate(data.template);
            console.log('Template updated successfully:', data.template);
            // Refresh from server to ensure we have latest
            await fetchTemplate();
            // Show success message
            alert('Template updated successfully!');
        } catch (error) {
            console.error('Error updating template:', error);
            const errorMessage = error?.message || 'Failed to update template. Please check the console for details.';
            alert(errorMessage);
            throw error // Re-throw so EmailTemplateBuilder can catch it
            ;
        }
    };
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "text-center py-12 text-luxury-gray-2",
            children: "Loading..."
        }, void 0, false, {
            fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
            lineNumber: 80,
            columnNumber: 12
        }, this);
    }
    if (!template) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "text-center py-12",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-luxury-gray-2 mb-6",
                    children: "Template not found"
                }, void 0, false, {
                    fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                    lineNumber: 86,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    href: "/admin/email-templates",
                    className: "px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black inline-block",
                    children: "Back to Templates"
                }, void 0, false, {
                    fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                    lineNumber: 87,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
            lineNumber: 85,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "max-w-7xl mx-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: "/admin/email-templates",
                        className: "text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block",
                        children: "← Back to Templates"
                    }, void 0, false, {
                        fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-xl md:text-2xl font-semibold tracking-luxury mb-4 md:mb-6",
                        style: {
                            fontWeight: '600'
                        },
                        children: [
                            "Edit: ",
                            template.name
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                        lineNumber: 103,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                lineNumber: 96,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$EmailTemplateBuilder$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                template: template,
                onSave: handleSave
            }, void 0, false, {
                fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
                lineNumber: 108,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/admin/email-templates/[id]/page.tsx",
        lineNumber: 95,
        columnNumber: 5
    }, this);
}
_s(EditEmailTemplatePage, "51V0aMm/6osnWC9BtWI9938YaTc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = EditEmailTemplatePage;
var _c;
__turbopack_context__.k.register(_c, "EditEmailTemplatePage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_c1da951d._.js.map