module.exports=[9467,a=>{"use strict";var b=a.i(87924),c=a.i(72131);function d({template:a,onSave:d}){let[e,f]=(0,c.useState)(a?.name||""),[g,h]=(0,c.useState)(a?.description||""),[i,j]=(0,c.useState)(a?.category||"campaign"),[k,l]=(0,c.useState)(a?.subject_line||""),[m,n]=(0,c.useState)(a?.html_content||""),[o,p]=(0,c.useState)(a?.variables||[]),[q,r]=(0,c.useState)(a?.logo_url||"/logo-white.png"),[s,t]=(0,c.useState)(a?.is_default||!1),[u,v]=(0,c.useState)(a?.is_active??!0);(0,c.useEffect)(()=>{a&&(console.log("Syncing template state:",{name:a.name,subject_line:a.subject_line,has_html:!!a.html_content,html_length:a.html_content?.length||0}),f(a.name||""),h(a.description||""),j(a.category||"campaign"),l(a.subject_line||""),n(a.html_content||""),p(a.variables||[]),r(a.logo_url||"/logo-white.png"),t(a.is_default||!1),v(a.is_active??!0),console.log("State synced. Current values:",{name:a.name||"",subjectLine:a.subject_line||"",htmlContentLength:a.html_content?.length||0}))},[a]),(0,c.useEffect)(()=>{console.log("EmailTemplateBuilder state:",{name:e?.substring(0,50),subjectLine:k?.substring(0,50),htmlContentLength:m?.length||0,buttonDisabled:!e?.trim()||!k?.trim()||!m?.trim()})},[e,k,m]);let[w,x]=(0,c.useState)("code"),[y,z]=(0,c.useState)(""),[A,B]=(0,c.useState)(!1),[C,D]=(0,c.useState)(""),[E,F]=(0,c.useState)(!1),[G,H]=(0,c.useState)(!1),I=(0,c.useRef)(null),J=(0,c.useRef)(""),[K,L]=(0,c.useState)(0);(0,c.useEffect)(()=>{if(m){let a=m.match(/\{\{(\w+)\}\}/g);a&&p(a.map(a=>a.replace(/[{}]/g,"")))}},[m]);let M=async()=>{if(!m)return void z("");try{let a=o.includes("logo_url")?o:[...o,"logo_url"],b=await fetch("/api/email-templates/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({html_content:m,variables:a})}),c=await b.json();if(!b.ok)throw Error(c.error);let d=c.preview_html;G&&(d=d.replace(/window\.previewEditableInitialized = true/g,""),d=N(d)),z(d)}catch(a){console.error("Preview error:",a),D("Failed to generate preview")}},N=a=>{let b=`
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
    `;return a.includes("</body>")?a.replace("</body>",b+"</body>"):a+b};(0,c.useEffect)(()=>{"preview"===w&&M()},[w,m,o,G]),(0,c.useEffect)(()=>{"preview"===w?F(!1):H(!1)},[w]);let O=(a,b,c)=>{let d=a.match(/\{\{(\w+)\}\}/g),e=d?d.map(a=>a.replace(/[{}]/g,"")).filter((a,b,c)=>c.indexOf(a)===b):[],f=b.match(/\{\{(\w+)\}\}/g),g=(f?f.map(a=>a.replace(/[{}]/g,"")).filter((a,b,c)=>c.indexOf(a)===b):[]).filter(a=>!e.includes(a));return!(g.length>0)||window.confirm(`Warning: You are about to delete variable placeholders from the ${c}: ${g.map(a=>`{{${a}}}`).join(", ")}

These variables are used in the email template. Deleting them may cause errors.

Do you want to continue?`)};(0,c.useEffect)(()=>{m&&(J.current=m)},[m]);let P=async()=>{if(!e||!k||!m)return void D("Name, subject line, and HTML content are required");D(""),B(!0);try{console.log("Saving template with data:",{name:e,description:g,category:i,subject_line:k,html_content:m.substring(0,100)+"...",variables:o,logo_url:q,is_default:s,is_active:u}),await d({name:e.trim(),description:g?.trim()||null,category:i,subject_line:k.trim(),html_content:m,variables:o,logo_url:q.trim()||"/logo-white.png",is_default:s,is_active:u}),console.log("Template saved successfully")}catch(a){console.error("Save error:",a),D(a?.message||"Failed to save template. Please check the console for details.")}finally{B(!1)}};return(0,b.jsxs)("div",{className:"space-y-6",children:[C&&(0,b.jsx)("div",{className:"p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm",children:C}),(0,b.jsxs)("div",{className:"card-section space-y-6",children:[(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury",children:"Template Settings"}),(0,b.jsxs)("div",{className:"grid md:grid-cols-2 gap-6",children:[(0,b.jsxs)("div",{children:[(0,b.jsxs)("label",{className:"block text-sm font-medium mb-2",children:["Template Name ",(0,b.jsx)("span",{className:"text-red-500",children:"*"})]}),(0,b.jsx)("input",{type:"text",value:e,onChange:a=>f(a.target.value),className:"input-luxury",placeholder:"Campaign Email Template",required:!0})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Category"}),(0,b.jsxs)("select",{value:i,onChange:a=>j(a.target.value),className:"select-luxury",children:[(0,b.jsx)("option",{value:"campaign",children:"Campaign"}),(0,b.jsx)("option",{value:"notification",children:"Notification"}),(0,b.jsx)("option",{value:"welcome",children:"Welcome"}),(0,b.jsx)("option",{value:"custom",children:"Custom"})]})]}),(0,b.jsxs)("div",{className:"md:col-span-2",children:[(0,b.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Description (Optional)"}),(0,b.jsx)("input",{type:"text",value:g,onChange:a=>h(a.target.value),className:"input-luxury",placeholder:"Template description"})]}),(0,b.jsxs)("div",{className:"md:col-span-2",children:[(0,b.jsxs)("label",{className:"block text-sm font-medium mb-2",children:["Subject Line ",(0,b.jsx)("span",{className:"text-red-500",children:"*"})]}),(0,b.jsx)("input",{type:"text",value:k,onChange:a=>{let b=a.target.value;O(b,k,"subject line")&&l(b)},className:"input-luxury",placeholder:"Action Required: {{campaign_name}}",required:!0}),(0,b.jsxs)("p",{className:"text-xs text-luxury-gray-2 mt-1",children:["Use variables like ","{{campaign_name}}"," in your subject line"]})]}),(0,b.jsxs)("div",{className:"md:col-span-2",children:[(0,b.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Logo URL"}),(0,b.jsx)("input",{type:"text",value:q,onChange:a=>r(a.target.value),className:"input-luxury",placeholder:"/logo-white.png"})]}),(0,b.jsx)("div",{className:"flex items-center space-x-4",children:(0,b.jsxs)("label",{className:"flex items-center space-x-3 cursor-pointer",children:[(0,b.jsx)("input",{type:"checkbox",checked:s,onChange:a=>t(a.target.checked),className:"w-4 h-4"}),(0,b.jsx)("span",{className:"text-sm font-medium",children:"Set as default for category"})]})}),(0,b.jsx)("div",{className:"flex items-center space-x-4",children:(0,b.jsxs)("label",{className:"flex items-center space-x-3 cursor-pointer",children:[(0,b.jsx)("input",{type:"checkbox",checked:u,onChange:a=>v(a.target.checked),className:"w-4 h-4"}),(0,b.jsx)("span",{className:"text-sm font-medium",children:"Template is active"})]})})]})]}),(0,b.jsxs)("div",{className:"card-section",children:[(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury mb-4",children:"Available Variables"}),(0,b.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-4",children:"Click a variable to insert it into your HTML content at the cursor position"}),(0,b.jsx)("div",{className:"grid md:grid-cols-2 gap-3",children:[{name:"first_name",label:"First Name",description:"Agent preferred first name"},{name:"last_name",label:"Last Name",description:"Agent preferred last name"},{name:"campaign_name",label:"Campaign Name",description:"Name of the campaign"},{name:"campaign_link",label:"Campaign Link",description:"Full URL to campaign form"},{name:"deadline",label:"Deadline",description:"Campaign deadline date"},{name:"logo_url",label:"Logo URL",description:"URL to logo image"}].map(a=>(0,b.jsxs)("button",{onClick:()=>{var b;let c;return b=a.name,c=`{{${b}}}`,void n(a=>a+c)},className:"text-left p-3 border border-luxury-gray-5 rounded hover:bg-luxury-light transition-colors",children:[(0,b.jsx)("div",{className:"font-mono text-sm text-luxury-black mb-1",children:`{{${a.name}}}`}),(0,b.jsx)("div",{className:"text-xs text-luxury-gray-2",children:a.description})]},a.name))}),o.length>0&&(0,b.jsxs)("div",{className:"mt-4 pt-4 border-t border-luxury-gray-5",children:[(0,b.jsx)("p",{className:"text-sm font-medium mb-2",children:"Variables used in template:"}),(0,b.jsx)("div",{className:"flex flex-wrap gap-2",children:o.map((a,c)=>(0,b.jsx)("span",{className:"text-xs px-2 py-1 bg-luxury-light rounded font-mono",children:`{{${a}}}`},`var-${c}-${a}`))})]})]}),(0,b.jsxs)("div",{className:"card-section",children:[(0,b.jsxs)("div",{className:"flex items-center justify-between mb-4",children:[(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury",children:"Email Content"}),(0,b.jsxs)("div",{className:"flex gap-2",children:[(0,b.jsx)("button",{onClick:()=>x("code"),className:`px-4 py-2 text-sm rounded transition-colors ${"code"===w?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:"HTML Code"}),(0,b.jsx)("button",{onClick:()=>x("preview"),className:`px-4 py-2 text-sm rounded transition-colors ${"preview"===w?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:"Preview"})]})]}),"code"===w?(0,b.jsx)("div",{children:E?(0,b.jsxs)("div",{children:[(0,b.jsxs)("div",{className:"flex items-center justify-between mb-2",children:[(0,b.jsxs)("p",{className:"text-xs text-luxury-gray-2",children:["Editing HTML code. Use ","{{variable_name}}"," syntax for dynamic content"]}),(0,b.jsx)("button",{type:"button",onClick:()=>F(!1),className:"text-xs text-luxury-gray-2 hover:text-luxury-black underline",children:"Hide Editor"})]}),(0,b.jsx)("textarea",{value:m,onChange:a=>{let b=a.target.value;(J.current||(J.current=m),O(b,m,"HTML content"))?(J.current=b,n(b)):L(a=>a+1)},className:"textarea-luxury font-mono text-sm",rows:20,placeholder:"<!DOCTYPE html>...",required:!0},`html-editor-${K}`)]}):(0,b.jsxs)("div",{className:"border border-luxury-gray-5 rounded p-6 bg-luxury-light",children:[(0,b.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-4",children:"HTML content is protected to prevent accidental edits."}),(0,b.jsx)("button",{type:"button",onClick:()=>F(!0),className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",children:"Edit HTML"})]})}):(0,b.jsxs)("div",{className:"border border-luxury-gray-5 rounded p-4 bg-white",children:[(0,b.jsxs)("div",{className:"flex items-center justify-between mb-2",children:[(0,b.jsx)("p",{className:"text-xs text-luxury-gray-2",children:G?"Edit mode enabled - click on text to edit (variable placeholders are protected)":'Preview mode - click "Edit Preview" to make text editable'}),(0,b.jsx)("button",{type:"button",onClick:()=>{H(!G)},className:`text-xs px-3 py-1 rounded transition-colors ${G?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:G?"Done Editing":"Edit Preview"})]}),y?(0,b.jsx)("div",{className:"relative",children:(0,b.jsx)("iframe",{ref:I,srcDoc:y,className:"w-full border-0",style:{height:"800px",minHeight:"400px"},title:"Email Preview"},G?"editable":"preview")}):(0,b.jsx)("div",{className:"text-center py-12 text-luxury-gray-2",children:"Generate preview..."})]})]}),(0,b.jsxs)("div",{className:"flex items-center gap-4",children:[(0,b.jsx)("button",{type:"button",onClick:a=>{a.preventDefault(),P()},disabled:A||!e?.trim()||!k?.trim()||!m?.trim(),className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",children:A?"Saving...":a?"Update Template":"Save Template"}),(!e?.trim()||!k?.trim()||!m?.trim())&&(0,b.jsxs)("p",{className:"text-xs text-luxury-gray-3",children:[!e?.trim()&&"Name required. ",!k?.trim()&&"Subject line required. ",!m?.trim()&&"HTML content required."]})]})]})}a.s(["default",()=>d])}];

//# sourceMappingURL=components_EmailTemplateBuilder_tsx_08fc520f._.js.map